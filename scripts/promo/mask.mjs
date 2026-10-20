// Phone numbers in promo material stay recognisable but not dialable:
// "0532 304 60 10" → "0532 ••• •• ••", "+1 703-524-0288" → "+1 •••-•••-••••".
// Both functions are self-contained so record.mjs can inject them into pages.

export function maskPhones(text) {
  return text.replace(/\+?\(?\d[\d\s()-]{7,}\d/g, (match) => {
    if ((match.match(/\d/g) || []).length < 9) return match;
    const [, head, rest] = match.match(/^(\+?\(?\d+\)?)([\s\S]*)$/);
    return head + rest.replace(/\d/g, '•');
  });
}

// Runs inside recorded pages: masks every text node now and whenever the page changes.
export function installPhoneMask(mask) {
  const fix = (node) => {
    const next = mask(node.data);
    if (next !== node.data) node.data = next;
  };
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (it.nextNode()) fix(it.currentNode);
  };
  const start = () => {
    walk(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') fix(record.target);
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) fix(node);
          else if (node.nodeType === Node.ELEMENT_NODE) walk(node);
        }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}
