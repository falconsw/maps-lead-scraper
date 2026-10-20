export const FILTERS = {
  all: { label: 'All', test: () => true },
  website: { label: 'Website', test: (r) => !!r.website },
  noWebsite: { label: 'No web', test: (r) => !r.website },
  phone: { label: 'Phone', test: (r) => !!r.phone },
  socials: { label: 'Socials', test: (r) => !!r.socials && Object.keys(r.socials).length > 0 },
};

const SOCIALS = ['facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'tiktok'];

const COLUMNS = [
  ['Name', (r) => r.name],
  ['Category', (r) => r.category],
  ['All categories', (r) => (r.categories || []).join('; ')],
  ['Phone', (r) => r.phone],
  ['Phone (intl)', (r) => r.phoneIntl],
  ['Website', (r) => r.website],
  ...SOCIALS.map((s) => [s[0].toUpperCase() + s.slice(1), (r) => r.socials?.[s] || '']),
  ['Rating', (r) => r.rating ?? ''],
  ['Reviews', (r) => r.reviews ?? ''],
  ['Address', (r) => r.address],
  ['Street', (r) => r.street],
  ['Neighborhood', (r) => r.neighborhood],
  ['City', (r) => r.city],
  ['Postal code', (r) => r.postalCode],
  ['State', (r) => r.state],
  ['Country', (r) => r.countryCode],
  ['Latitude', (r) => r.lat ?? ''],
  ['Longitude', (r) => r.lng ?? ''],
  ['Opening hours', (r) => r.hours],
  ['Place ID', (r) => r.placeId],
  ['CID', (r) => r.cid],
  ['Google Maps URL', (r) => r.mapsUrl],
  ['Captured at', (r) => (r.capturedAt ? new Date(r.capturedAt).toISOString() : '')],
];

const PHONE_COLUMNS = new Set(['Phone', 'Phone (intl)']);

function cell(header, value) {
  let s = value == null ? '' : String(value);
  // Neutralise spreadsheet formulas; phone numbers legitimately start with "+".
  if (!PHONE_COLUMNS.has(header) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  const lines = [COLUMNS.map(([h]) => cell('', h)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([h, get]) => cell(h, get(r))).join(','));
  return '﻿' + lines.join('\r\n');
}

export function exportFileName(query, filterKey) {
  const slug = (query || 'maps').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${date}${filterKey && filterKey !== 'all' ? `-${filterKey}` : ''}.csv`;
}

export function downloadText(text, fileName, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
