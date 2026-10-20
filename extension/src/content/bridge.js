// Isolated-world side of the content script: forwards captured Maps responses
// to the background worker and drives the page while capturing:
//   list:   scroll the results list to its end, then stop
//   area:   sweep the map in a spiral, emptying the list at every spot
//   manual: only record what the user browses
(() => {
  const CHANNEL = 'maps-lead-scraper';
  const BUFFER_SIZE = 10;
  const SCROLL_EVERY_MS = 1500;
  // Without the end marker, this many ticks with no new cards (~15s) also means the end.
  const STALL_TICKS = 10;
  // Each hop moves the view by this share of the visible map, leaving some overlap.
  const HOP = 0.6;
  const NEW_RESULTS_TIMEOUT_MS = 8000;

  // Responses seen before Start is pressed, so the visible results count too.
  const buffer = [];
  let running = false;
  let runId = 0;
  let responses = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tell = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const send = (url, body) => tell({ type: 'maps:response', url, body });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.channel !== CHANNEL) return;
    const { url, body } = event.data;
    if (typeof body !== 'string') return;
    responses++;
    if (running) return send(url, body);
    buffer.push({ url, body });
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  });

  // "Update results when map moves" must be on for a moved map to search again.
  function ensureQueryOnPan() {
    const box = document.querySelector('button[role="checkbox"][jsaction*="queryOnPan"]');
    if (box?.getAttribute('aria-checked') === 'false') box.click();
  }

  // Scrolls the results list until Maps says it has ended. Resolves false if the run was cancelled.
  async function emptyList(id) {
    let lastCount = -1;
    let stalled = 0;
    while (id === runId) {
      const feed = document.querySelector('div[role="feed"]');
      // "You've reached the end of the list." / "Listenin sonuna ulaştınız."
      if (feed?.querySelector('span.HlvSq')) return true;
      const count = feed ? feed.querySelectorAll('a[href*="/maps/place/"]').length : 0;
      stalled = count === lastCount ? stalled + 1 : 0;
      lastCount = count;
      if (stalled >= STALL_TICKS) return true;
      if (feed) feed.scrollTop = feed.scrollHeight;
      await sleep(SCROLL_EVERY_MS);
    }
    return false;
  }

  // Square spiral of unit moves (x east, y south) covering (2r+1)² spots.
  function spiralMoves(rings) {
    const total = (2 * rings + 1) ** 2 - 1;
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const moves = [];
    for (let leg = 0; moves.length < total; leg++) {
      for (let i = 0; i < Math.floor(leg / 2) + 1 && moves.length < total; i++) moves.push(dirs[leg % 4]);
    }
    return moves;
  }

  // Maps pans on plain synthetic mouse events dispatched on its canvas. The
  // moves are spread out and held still before release; a burst of moves reads
  // as a fling and the map keeps gliding several times further.
  async function dragMap([ux, uy]) {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!canvas) return false;
    const r = canvas.getBoundingClientRect();
    // The results panel covers the left part of the canvas.
    const panelRight = document.querySelector('div[role="feed"]')?.getBoundingClientRect().right ?? r.left;
    const left = Math.max(r.left, Math.min(panelRight, r.right - 200));
    const w = r.right - left;
    const h = r.height;
    const x0 = left + w / 2;
    const y0 = r.top + h / 2;
    const dx = -ux * w * HOP;
    const dy = -uy * h * HOP;
    const fire = (type, x, y, buttons) =>
      canvas.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons }),
      );
    fire('mousedown', x0, y0, 1);
    for (let i = 1; i <= 12; i++) {
      fire('mousemove', x0 + (dx * i) / 12, y0 + (dy * i) / 12, 1);
      await sleep(25);
    }
    for (let i = 0; i < 4; i++) {
      fire('mousemove', x0 + dx, y0 + dy, 1);
      await sleep(40);
    }
    fire('mouseup', x0 + dx, y0 + dy, 0);
    return true;
  }

  async function waitForNewResults(id, since) {
    const deadline = Date.now() + NEW_RESULTS_TIMEOUT_MS;
    while (id === runId && responses === since && Date.now() < deadline) await sleep(200);
    await sleep(800); // let the list re-render before looking for its end
  }

  async function runList(id) {
    ensureQueryOnPan();
    if (await emptyList(id)) tell({ type: 'content:finished', reason: 'end' });
  }

  async function runArea(id, rings, startStep) {
    const moves = spiralMoves(rings);
    for (let step = startStep; id === runId; step++) {
      tell({ type: 'content:area-progress', step: step + 1, total: moves.length + 1 });
      ensureQueryOnPan();
      if (!(await emptyList(id))) return;
      if (step >= moves.length) return tell({ type: 'content:finished', reason: 'area-done' });
      const since = responses;
      if (!(await dragMap(moves[step]))) return tell({ type: 'content:finished', reason: 'end' });
      await waitForNewResults(id, since);
    }
  }

  function apply(next) {
    const wasRunning = running;
    running = !!next.running;
    if (running && !wasRunning) for (const { url, body } of buffer.splice(0)) send(url, body);
    const id = ++runId;
    if (!running) return;
    if (next.mode === 'area') runArea(id, next.areaSize, next.areaStep || 0);
    else if (next.mode === 'list') runList(id);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'capture') apply(msg);
  });

  tell({ type: 'content:hello' }).then((res) => res?.ok && apply(res.result));
})();
