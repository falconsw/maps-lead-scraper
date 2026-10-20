import { FILTERS, toCsv, exportFileName, downloadText } from '../lib/export.js';
import { queryFromMapsUrl } from '../lib/parser.js';

const $ = (sel) => document.querySelector(sel);

// Maps each filter chip to the stats counter that holds its size.
const FILTER_STAT = { all: 'total', website: 'websites', noWebsite: 'noWebsite', phone: 'phones', socials: 'socials' };

let snap = null;
let filterKey = 'all';
let error = '';

async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || 'The extension did not respond.');
  return res.result;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function render(next) {
  snap = next;
  const { state, session, stats, recent } = snap;
  document.body.classList.toggle('running', state.running);
  $('#start').disabled = state.running;
  $('#stop').disabled = !state.running;
  $('#export').disabled = !stats.total;
  for (const button of document.querySelectorAll('.mode')) {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', active);
    button.disabled = state.running;
  }
  $('#area-size-row').hidden = state.mode !== 'area';
  $('#area-size').value = String(state.areaSize);
  $('#area-size').disabled = state.running;

  const status = $('#status');
  status.classList.toggle('error', !!error);
  status.textContent =
    error ||
    (state.running
      ? state.mode === 'area'
        ? `Sweeping spot ${state.areaStep + 1}/${state.areaTotal || '…'} · ${stats.total} businesses`
        : `Capturing… ${stats.total}`
      : session && state.stopReason === 'area-done'
        ? `Area sweep finished · ${stats.total} businesses`
        : session && state.stopReason === 'end'
          ? `End of the list · ${stats.total} businesses. Move the map and press Start to add more.`
          : session
            ? `Paused · “${session.query}” · ${stats.total} businesses`
            : 'Search on Google Maps, then press Start.');

  $('#total').textContent = stats.total;
  for (const metric of document.querySelectorAll('.metric')) {
    const value = stats[metric.dataset.key] || 0;
    metric.querySelector('b').textContent = value;
    metric.querySelector('em').style.width = stats.total ? `${(value / stats.total) * 100}%` : '0';
  }

  $('#filtered').textContent = stats[FILTER_STAT[filterKey]] || 0;
  $('#filters').replaceChildren(
    ...Object.entries(FILTERS).map(([key, f]) =>
      el('button', { className: `chip${key === filterKey ? ' active' : ''}`, textContent: f.label, onclick: () => selectFilter(key) }),
    ),
  );

  $('#recent').replaceChildren(
    ...(recent.length
      ? recent.map((r) =>
          el(
            'li',
            {},
            el('div', { className: 'name', textContent: r.name }),
            el('div', {
              className: 'meta',
              textContent: [r.category, r.rating != null ? `★ ${r.rating}${r.reviews != null ? ` (${r.reviews})` : ''}` : '', r.phone, r.domain]
                .filter(Boolean)
                .join(' · '),
            }),
          ),
        )
      : [el('li', { className: 'empty', textContent: 'Nothing captured yet.' })]),
  );
}

function selectFilter(key) {
  filterKey = key;
  if (snap) render(snap);
}

async function refresh() {
  render(await send('panel:snapshot'));
}

async function guarded(fn) {
  error = '';
  try {
    await fn();
  } catch (err) {
    error = err.message;
  }
  await refresh();
}

async function startOn(sessionId) {
  const tab = await activeTab();
  await send('panel:start', { tabId: tab?.id, url: tab?.url, sessionId });
}

async function exportSession(session, key = 'all') {
  const rows = await send('panel:places', { sessionId: session.id });
  const filtered = rows.filter(FILTERS[key].test).sort((a, b) => a.capturedAt - b.capturedAt);
  downloadText(toCsv(filtered), exportFileName(session.query, key));
}

$('#start').onclick = () =>
  guarded(async () => {
    // Keep adding to the paused session only when the user is still on the same search.
    const tab = await activeTab();
    const sameSearch = snap?.session && queryFromMapsUrl(tab?.url || '') === snap.session.query;
    await startOn(sameSearch ? snap.session.id : undefined);
  });
$('#stop').onclick = () => guarded(() => send('panel:stop'));
$('#new-session').onclick = () => guarded(() => send('panel:new-session'));
$('#export').onclick = () => guarded(() => exportSession(snap.session, filterKey));
for (const button of document.querySelectorAll('.mode')) button.onclick = () => guarded(() => send('panel:set-mode', { mode: button.dataset.mode }));
$('#area-size').onchange = (e) => guarded(() => send('panel:set-mode', { areaSize: Number(e.target.value) }));

async function renderHistory() {
  const sessions = await send('panel:sessions');
  $('#sessions').replaceChildren(
    ...(sessions.length
      ? sessions.map((s) =>
          el(
            'li',
            {},
            el('div', { className: 'name', textContent: s.query }),
            el('div', { className: 'meta', textContent: `${new Date(s.startedAt).toLocaleString()} · ${s.count} businesses` }),
            el(
              'div',
              { className: 'actions' },
              el('button', {
                textContent: 'Continue',
                onclick: () =>
                  guarded(async () => {
                    await startOn(s.id);
                    showTab('capture');
                  }),
              }),
              el('button', { textContent: 'CSV', onclick: () => guarded(() => exportSession(s)) }),
              el('button', {
                className: 'delete',
                textContent: 'Delete',
                onclick: async () => {
                  if (!confirm(`Delete “${s.query}” and its ${s.count} businesses?`)) return;
                  await guarded(() => send('panel:delete-session', { sessionId: s.id }));
                  renderHistory();
                },
              }),
            ),
          ),
        )
      : [el('li', { className: 'empty', textContent: 'No sessions yet.' })]),
  );
}

function showTab(name) {
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.tab === name);
  $('#capture').hidden = name !== 'capture';
  $('#history').hidden = name !== 'history';
  if (name === 'history') renderHistory().catch((err) => alert(err.message));
}

for (const tab of document.querySelectorAll('.tab')) tab.onclick = () => showTab(tab.dataset.tab);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'state') return;
  error = '';
  render(msg);
});

refresh().catch((err) => {
  $('#status').textContent = err.message;
});
