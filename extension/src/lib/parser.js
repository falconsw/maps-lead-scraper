// Parses Google Maps internal responses (/search?tbm=map, /maps/preview/place)
// into flat place records. Field indices were verified against a live
// response on 2026-10-20; see test/fixtures for the sample.
//
// Everything comes from Maps itself; the extension never visits business websites.

const FEATURE_ID = /^0x[0-9a-f]+:0x[0-9a-f]+$/i;

// Maps bodies come as `)]}'\n[...]`, sometimes wrapped as `{"c":0,"d":")]}'..."}/*""*/`.
export function decodeMapsBody(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  if (t.endsWith('/*""*/')) t = t.slice(0, -6);
  if (t.startsWith('{')) {
    try {
      const wrapped = JSON.parse(t);
      if (typeof wrapped?.d !== 'string') return null;
      t = wrapped.d.trim();
    } catch {
      return null;
    }
  }
  if (t.startsWith(")]}'")) t = t.slice(4);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

const at = (node, ...path) => {
  for (const k of path) {
    if (!Array.isArray(node) || node.length <= k) return undefined;
    node = node[k];
  }
  return node ?? undefined;
};

const isPlace = (a) =>
  Array.isArray(a) && a.length > 78 && typeof a[11] === 'string' && typeof a[10] === 'string' && FEATURE_ID.test(a[10]);

// Walks the whole tree instead of trusting a fixed top-level index, because the
// list position differs between search, pagination and place-detail responses.
export function findPlaceNodes(root) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!Array.isArray(node)) continue;
    if (isPlace(node)) {
      found.push(node);
      continue;
    }
    for (let i = node.length - 1; i >= 0; i--) if (Array.isArray(node[i])) stack.push(node[i]);
  }
  return found;
}

export function cidFromFeatureId(featureId) {
  const hex = featureId?.split(':')[1];
  if (!hex) return '';
  try {
    return BigInt(hex).toString();
  } catch {
    return '';
  }
}

export function cleanWebsite(url) {
  if (typeof url !== 'string' || !url) return '';
  if (url.startsWith('/url?')) url = new URLSearchParams(url.slice(5)).get('q') || '';
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|y_source)/i.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

const SOCIAL_PROFILES = {
  facebook: /^https?:\/\/(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\/(?:profile\.php\?id=\d+|[^?#\s]+)/i,
  instagram: /^https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i,
  linkedin: /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/[^?#\s/]+/i,
  twitter: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]{1,15}(?=[/?#]|$)/i,
  youtube: /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:channel\/|c\/|user\/|@)[^?#\s/]+/i,
  tiktok: /^https?:\/\/(?:www\.)?tiktok\.com\/@[^?#\s/]+/i,
};

// Many small businesses list a social profile as their website on Maps.
export function socialsFromWebsite(url) {
  for (const [network, pattern] of Object.entries(SOCIAL_PROFILES)) {
    const m = url?.match(pattern);
    if (m) return { [network]: m[0].replace(/^http:/i, 'https:').replace(/\/+$/, '') };
  }
  return {};
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function formatHours(days) {
  if (!Array.isArray(days)) return '';
  return days
    .filter((d) => typeof d?.[0] === 'string')
    .map((d) => `${d[0]}: ${(at(d, 3) || []).map((slot) => slot?.[0]).filter(Boolean).join(', ') || '-'}`)
    .join(' | ');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function toRecord(p) {
  const name = p[11];
  const placeId = at(p, 78) || '';
  const featureId = p[10];
  const parts = at(p, 183, 1) || [];
  const website = cleanWebsite(at(p, 7, 0));
  const fullAddress = at(p, 18);
  return {
    key: placeId || featureId,
    placeId,
    featureId,
    cid: cidFromFeatureId(featureId),
    name,
    category: at(p, 13, 0) || '',
    categories: at(p, 13) || [],
    address:
      at(p, 39) ||
      (typeof fullAddress === 'string' && fullAddress.startsWith(`${name}, `) ? fullAddress.slice(name.length + 2) : fullAddress) ||
      (at(p, 2) || []).join(', '),
    neighborhood: parts[0] || at(p, 14) || '',
    street: parts[1] || '',
    city: parts[3] || '',
    postalCode: parts[4] || '',
    state: parts[5] || '',
    countryCode: parts[6] || at(p, 243) || '',
    phone: at(p, 178, 0, 0) || '',
    phoneIntl: at(p, 178, 0, 3) || '',
    website,
    domain: website ? domainOf(website) : '',
    socials: socialsFromWebsite(website),
    rating: num(at(p, 4, 7)),
    reviews: num(at(p, 4, 8)),
    lat: num(at(p, 9, 2)),
    lng: num(at(p, 9, 3)),
    hours: formatHours(at(p, 203, 0)),
    timezone: at(p, 30) || '',
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}${
      placeId ? `&query_place_id=${placeId}` : ''
    }`,
  };
}

export function parseMapsResponse(text) {
  const root = decodeMapsBody(text);
  if (!root) return [];
  const seen = new Set();
  const records = [];
  for (const node of findPlaceNodes(root)) {
    const rec = toRecord(node);
    if (seen.has(rec.key)) continue;
    seen.add(rec.key);
    records.push(rec);
  }
  return records;
}

// Search query from a Maps URL like /maps/search/dentists+near+ankara/@39.9,32.8,13z
export function queryFromMapsUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\/maps\/search\/([^/@]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  } catch {
    return '';
  }
}
