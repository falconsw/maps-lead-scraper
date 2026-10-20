// Runs in the page's own JS world (MAIN) at document_start so it sees Google
// Maps' XHR/fetch traffic. Matching response bodies are posted to bridge.js.
(() => {
  const CHANNEL = 'maps-lead-scraper';
  const WANTED = /\/search\?tbm=map|\/maps\/preview\/place/;
  const urls = new WeakMap();
  const listening = new WeakSet();
  const posted = new WeakSet();

  const post = (url, body) => {
    if (typeof body === 'string' && body.length) window.postMessage({ channel: CHANNEL, url, body }, location.origin);
  };

  const readXhr = (xhr) => {
    switch (xhr.responseType) {
      case '':
      case 'text':
        return xhr.responseText;
      case 'arraybuffer':
        return new TextDecoder().decode(xhr.response);
      case 'json':
        return JSON.stringify(xhr.response);
      default:
        return null;
    }
  };

  // Maps reads these responses as a stream and calls abort() from its own
  // progress handler as soon as readyState hits 4, so 'load'/'loadend' never
  // fire. Capture the body on any event that sees state 4, and right before
  // abort() wipes it.
  function captureIfDone(xhr) {
    if (posted.has(xhr) || xhr.readyState !== 4) return;
    const url = urls.get(xhr);
    if (!url || !WANTED.test(url)) return;
    let body = null;
    try {
      body = readXhr(xhr);
    } catch {}
    if (!body) return;
    posted.add(xhr);
    post(url, body);
  }

  const { open, abort } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const href = String(url);
    urls.set(this, href);
    posted.delete(this);
    if (WANTED.test(href) && !listening.has(this)) {
      listening.add(this);
      for (const type of ['readystatechange', 'progress', 'load']) this.addEventListener(type, () => captureIfDone(this));
    }
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.abort = function (...args) {
    captureIfDone(this);
    return abort.apply(this, args);
  };

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await originalFetch.call(this, input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      if (url && WANTED.test(url)) {
        response
          .clone()
          .text()
          .then((body) => post(url, body))
          .catch(() => {});
      }
    } catch {}
    return response;
  };
})();
