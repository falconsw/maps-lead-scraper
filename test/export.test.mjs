import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMapsResponse } from '../extension/src/lib/parser.js';
import { toCsv, exportFileName, FILTERS } from '../extension/src/lib/export.js';

const places = parseMapsResponse(readFileSync(new URL('./fixtures/search-dentists-dc.txt', import.meta.url), 'utf8'));

test('csv has a BOM, a header and one line per place', () => {
  const csv = toCsv(places);
  assert.ok(csv.startsWith('﻿Name,Category,'));
  assert.equal(csv.split('\r\n').length, places.length + 1);
  assert.ok(csv.includes('Arlington Dental Team,Dentist,Dentist,+1 703-524-0288,+17035240288,'));
});

test('csv quotes commas and neutralises formulas but keeps phone numbers', () => {
  const csv = toCsv([{ name: '=HYPERLINK("x")', address: 'A, B', phone: '+90 312 000 00 00' }]);
  const row = csv.split('\r\n')[1];
  assert.ok(row.startsWith(`"'=HYPERLINK(""x"")"`));
  assert.ok(row.includes('"A, B"'));
  assert.ok(row.includes(',+90 312 000 00 00,'));
});

test('filters and file names', () => {
  assert.equal(places.filter(FILTERS.website.test).length, 20);
  assert.equal(places.filter(FILTERS.noWebsite.test).length, 0);
  assert.match(exportFileName('Diş hekimi Ankara', 'phone'), /^diş-hekimi-ankara-\d{4}-\d{2}-\d{2}-phone\.csv$/);
});
