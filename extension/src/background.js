import { parseMapsResponse, queryFromMapsUrl } from './lib/parser.js';
import * as db from './lib/db.js';

// Capture state lives in storage.session so it survives service-worker restarts.
// mode: 'list' empties the current results list, 'area' sweeps the map, 'manual' only records.
const DEFAULT_STATE = { running: false, sessionId: null, tabId: null, mode: 'area', areaSize: 1, areaStep: 0, areaTotal: 0 };
const MODES = new Set(['list', 'area', 'manual']);

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function getState() {
  const { capture } = await chrome.storage.session.get('capture');
  return { ...DEFAULT_STATE, ...capture };
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.session.set({ capture: next });
  return next;
}

export function computeStats(rows) {
  const stats = { total: rows.length, phones: 0, websites: 0, noWebsite: 0, socials: 0 };
  for (const r of rows) {
    if (r.phone) stats.phones++;
    if (r.website) stats.websites++;
    else stats.noWebsite++;
    if (r.socials && Object.keys(r.socials).length) stats.socials++;
  }
  return stats;
}

async function snapshot() {
  const state = await getState();
  if (!state.sessionId) return { state, session: null, stats: computeStats([]), recent: [] };
  const [session, rows] = await Promise.all([db.getSession(state.sessionId), db.getSessionPlaces(state.sessionId)]);
  const recent = rows.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, 30);
  return { state, session, stats: computeStats(rows), recent };
}

// Coalesces bursts of captures into one panel update.
let broadcastTimer = null;
function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    chrome.runtime.sendMessage({ type: 'state', ...(await snapshot()) }).catch(() => {});
  }, 300);
}

const contentState = (state, tabId) => ({
  running: state.running && state.tabId === tabId,
  mode: state.mode,
  areaSize: state.areaSize,
  areaStep: state.areaStep,
});

async function tellContent(tabId, state) {
  if (tabId == null) return;
  await chrome.tabs.sendMessage(tabId, { type: 'capture', ...contentState(state, tabId) }).catch(() => {});
}

async function startCapture({ tabId, url, sessionId }) {
  if (!/^https:\/\/www\.google\.[a-z.]+\/maps/.test(url || '')) {
    throw new Error('Open a Google Maps search in the active tab first.');
  }
  let session = sessionId ? await db.getSession(sessionId) : null;
  if (!session) {
    session = { id: crypto.randomUUID(), query: queryFromMapsUrl(url) || 'Google Maps', startedAt: Date.now(), count: 0 };
    await db.putSession(session);
  }
  const previous = await getState();
  if (previous.running && previous.tabId !== tabId) await tellContent(previous.tabId, { ...previous, running: false });
  const state = await setState({ running: true, sessionId: session.id, tabId, stopReason: null, areaStep: 0, areaTotal: 0 });
  await tellContent(tabId, state);
  scheduleBroadcast();
}

async function stopCapture(stopReason = 'user') {
  const state = await setState({ running: false, stopReason });
  await tellContent(state.tabId, state);
  if (state.sessionId) {
    const session = await db.getSession(state.sessionId);
    if (session) await db.putSession({ ...session, endedAt: Date.now() });
  }
  scheduleBroadcast();
}

// Responses are processed one at a time so upserts and session counts don't race.
let captureQueue = Promise.resolve();
function handleMapsResponse(body, tabId) {
  captureQueue = captureQueue.then(() => processMapsResponse(body, tabId)).catch((err) => console.warn('capture failed', err));
  return captureQueue;
}

async function processMapsResponse(body, tabId) {
  const state = await getState();
  if (!state.running || state.tabId !== tabId) return;
  const records = parseMapsResponse(body);
  if (!records.length) return;
  const added = await db.upsertPlaces(state.sessionId, records);
  if (added.length) {
    const session = await db.getSession(state.sessionId);
    if (session) await db.putSession({ ...session, count: session.count + added.length });
  }
  scheduleBroadcast();
}

const handlers = {
  'maps:response': (msg, sender) => handleMapsResponse(msg.body, sender.tab?.id),
  'content:hello': async (_msg, sender) => contentState(await getState(), sender.tab?.id),
  'content:area-progress': async (msg, sender) => {
    const state = await getState();
    if (!state.running || state.tabId !== sender.tab?.id) return;
    await setState({ areaStep: msg.step - 1, areaTotal: msg.total });
    scheduleBroadcast();
  },
  // Queued behind pending responses so the last page is stored before stopping.
  'content:finished': (msg, sender) => {
    captureQueue = captureQueue
      .then(async () => {
        const state = await getState();
        if (state.running && state.tabId === sender.tab?.id) await stopCapture(msg.reason === 'area-done' ? 'area-done' : 'end');
      })
      .catch((err) => console.warn('auto-stop failed', err));
    return captureQueue;
  },
  'panel:snapshot': () => snapshot(),
  'panel:start': (msg) => startCapture(msg),
  'panel:stop': () => stopCapture('user'),
  'panel:new-session': async () => {
    await stopCapture();
    await setState({ sessionId: null });
    scheduleBroadcast();
  },
  'panel:set-mode': async (msg) => {
    const patch = {};
    if (MODES.has(msg.mode)) patch.mode = msg.mode;
    if ([1, 2, 3].includes(msg.areaSize)) patch.areaSize = msg.areaSize;
    const state = await setState(patch);
    await tellContent(state.tabId, state);
    scheduleBroadcast();
  },
  'panel:sessions': () => db.listSessions(),
  'panel:places': (msg) => db.getSessionPlaces(msg.sessionId),
  'panel:delete-session': async (msg) => {
    const state = await getState();
    if (state.sessionId === msg.sessionId) await setState({ running: false, sessionId: null });
    await db.deleteSession(msg.sessionId);
    scheduleBroadcast();
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg, sender))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.running && state.tabId === tabId) await stopCapture();
});
