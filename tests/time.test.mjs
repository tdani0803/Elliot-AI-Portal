import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeSlots, isAfterHours, parseLocalDateTime, zonedParts, zonedToUtc } from '../src/lib/time.js';

const TZ = 'Australia/Sydney';
const HOURS = { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'], sat: null, sun: null };

test('zonedToUtc handles Sydney standard and daylight time', () => {
  // 25 Sep 2026 is AEST (+10); 25 Nov 2026 is AEDT (+11).
  assert.equal(zonedToUtc({ year: 2026, month: 9, day: 25, hour: 9 }, TZ).toISOString(), '2026-09-24T23:00:00.000Z');
  assert.equal(zonedToUtc({ year: 2026, month: 11, day: 25, hour: 9 }, TZ).toISOString(), '2026-11-24T22:00:00.000Z');
});

test('zonedParts reads wall-clock time and weekday in the zone', () => {
  const p = zonedParts(new Date('2026-09-24T23:30:00Z'), TZ);
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute, p.dayIndex], [2026, 9, 25, 9, 30, 5]);
});

test('parseLocalDateTime reads naive times as business-local, keeps explicit offsets', () => {
  assert.equal(parseLocalDateTime('2026-09-25T09:00', TZ).toISOString(), '2026-09-24T23:00:00.000Z');
  assert.equal(parseLocalDateTime('2026-09-25T09:00:00Z', TZ).toISOString(), '2026-09-25T09:00:00.000Z');
  assert.equal(parseLocalDateTime('next tuesday', TZ), null);
});

test('isAfterHours: evenings, early mornings and weekends count', () => {
  const at = (iso) => isAfterHours(parseLocalDateTime(iso, TZ), HOURS, TZ);
  assert.equal(at('2026-09-25T10:00'), false); // Friday 10am
  assert.equal(at('2026-09-25T17:00'), true); // closing time
  assert.equal(at('2026-09-25T06:59'), true);
  assert.equal(at('2026-09-26T11:00'), true); // Saturday
});

test('freeSlots skips booked, past and closed times', () => {
  const date = { year: 2026, month: 9, day: 25 };
  const bookings = [{ starts_at: parseLocalDateTime('2026-09-25T09:00', TZ).toISOString(), duration_minutes: 120, status: 'booked' }];
  const now = parseLocalDateTime('2026-09-25T07:30', TZ);
  const slots = freeSlots({ date, businessHours: HOURS, timeZone: TZ, bookings, now }).map((d) => zonedParts(d, TZ).hour);
  assert.deepEqual(slots, [8, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(freeSlots({ date: { year: 2026, month: 9, day: 26 }, businessHours: HOURS, timeZone: TZ, now }), []);
});
