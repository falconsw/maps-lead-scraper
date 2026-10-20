import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMapsResponse, decodeMapsBody, cidFromFeatureId, cleanWebsite, queryFromMapsUrl, socialsFromWebsite } from '../extension/src/lib/parser.js';

const fixture = readFileSync(new URL('./fixtures/search-dentists-dc.txt', import.meta.url), 'utf8');

test('parses all 20 results of a search page', () => {
  const places = parseMapsResponse(fixture);
  assert.equal(places.length, 20);
  assert.ok(places.every((p) => p.name && p.placeId.startsWith('ChIJ')));
});

test('maps the first result fields', () => {
  const [p] = parseMapsResponse(fixture);
  assert.equal(p.name, 'Arlington Dental Team');
  assert.equal(p.placeId, 'ChIJNdu9ul62t4kRl6LVCH3uouw');
  assert.equal(p.category, 'Dentist');
  assert.equal(p.address, '1600 Wilson Blvd #620, Arlington, VA 22209, United States');
  assert.equal(p.city, 'Arlington');
  assert.equal(p.postalCode, '22209');
  assert.equal(p.phone, '+1 703-524-0288');
  assert.equal(p.phoneIntl, '+17035240288');
  assert.equal(p.website, 'https://www.arlingtondentalteam.com/');
  assert.equal(p.domain, 'arlingtondentalteam.com');
  assert.equal(p.rating, 4.9);
  assert.equal(p.reviews, 783);
  assert.ok(Math.abs(p.lat - 38.894029) < 1e-5);
  assert.ok(p.hours.startsWith('Tuesday: 7:30'));
});

test('decodes the wrapped {"d": ...} variant', () => {
  const wrapped = JSON.stringify({ c: 0, d: fixture }) + '/*""*/';
  assert.equal(parseMapsResponse(wrapped).length, 20);
  assert.equal(decodeMapsBody('not json'), null);
});

test('helpers', () => {
  assert.equal(cidFromFeatureId('0x89b7b65ebabddb35:0xeca2ee7d08d5a297'), '17051453359964660375');
  assert.equal(cleanWebsite('/url?q=https%3A%2F%2Fa.com%2F%3Futm_source%3Dgmb%26x%3D1&opi=1'), 'https://a.com/?x=1');
  assert.equal(queryFromMapsUrl('https://www.google.com/maps/search/di%C5%9F+hekimi+ankara/@39.9,32.8,13z'), 'diş hekimi ankara');
});

test('a social profile listed as the website becomes a social link', () => {
  assert.deepEqual(socialsFromWebsite('http://instagram.com/kuafor_ankara/?hl=tr'), { instagram: 'https://instagram.com/kuafor_ankara' });
  assert.deepEqual(socialsFromWebsite('https://www.facebook.com/profile.php?id=1000123'), { facebook: 'https://www.facebook.com/profile.php?id=1000123' });
  assert.deepEqual(socialsFromWebsite('https://www.arlingtondentalteam.com/'), {});
  assert.deepEqual(parseMapsResponse(fixture)[0].socials, {});
});
