import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bookingFinder,
  busiestTimes,
  callbackList,
  callsPerPhone,
  customersFrom,
  isLead,
  monthlyTotals,
  feeForRange,
  jobTypeOf,
  suburbOf,
  summariseRange,
  topCounts,
} from '../src/lib/insights.js';

const client = { avg_job_value: 2000, conversion_rate: 0.3, monthly_fee: 750, timezone: 'Australia/Sydney' };
const call = (over) => ({ call_started_at: '2026-09-22T00:00:00Z', duration_seconds: 120, urgency: 'non_urgent', lead_status: 'new', ...over });

test('summariseRange: real money won, open estimate and times back', () => {
  const calls = [
    call({ id: 1, lead_status: 'won', won_value: 3000, status_updated_at: '2026-09-22T05:00:00Z' }),
    call({ id: 2, lead_status: 'won', won_value: 1500, status_updated_at: '2026-08-01T05:00:00Z' }), // won last month
    call({ id: 3, lead_status: 'quoted' }),
    call({ id: 4, lead_status: 'new', urgency: 'urgent' }),
    call({ id: 5, lead_status: 'lost' }),
    call({ id: 6, urgency: 'irrelevant' }),
  ];
  const s = summariseRange({ calls, client, since: new Date('2026-09-01T00:00:00Z'), range: 'month', now: new Date('2026-09-23T00:00:00Z') });
  assert.equal(s.calls, 6);
  assert.equal(s.leads, 5);
  assert.deepEqual(s.won, { count: 1, value: 3000 });
  assert.equal(s.open.count, 2);
  assert.equal(s.open.estimate, 2 * 2000 * 0.3);
  assert.equal(s.fee, 750);
  assert.equal(s.timesBack, 4);
  // called_back is cumulative: a won job was also called back. Old "quoted" counts as called.
  assert.deepEqual(s.funnel, { leads: 5, called_back: 3, won: 2, lost: 1 });
});

test('feeForRange never under-charges: part months count as full months', () => {
  assert.equal(feeForRange('month', 750), 750);
  assert.equal(Math.round(feeForRange('week', 750)), 173);
  const now = new Date('2026-09-23T00:00:00Z');
  assert.equal(feeForRange('all', 750, [{ call_started_at: '2026-07-20T00:00:00Z' }], now), 750 * 3);
  assert.equal(feeForRange('month', null), 0);
});

test('callbackList: urgent first, then oldest; flags overdue', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const list = callbackList(
    [
      call({ id: 'a', call_started_at: '2026-09-22T11:00:00Z', urgency: 'non_urgent' }),
      call({ id: 'b', call_started_at: '2026-09-22T11:30:00Z', urgency: 'urgent' }),
      call({ id: 'c', call_started_at: '2026-09-22T08:00:00Z', urgency: 'urgent' }),
      call({ id: 'd', lead_status: 'called_back', urgency: 'urgent' }),
      call({ id: 'e', urgency: 'irrelevant' }),
    ],
    now,
  );
  assert.deepEqual(list.map((c) => c.id), ['c', 'b', 'a']);
  assert.deepEqual(list.map((c) => c.overdue), [true, false, false]);
});

test('suburbOf pulls the suburb out of Australian addresses', () => {
  assert.equal(suburbOf('14 Banksia St, Newtown NSW 2042'), 'Newtown');
  assert.equal(suburbOf('7/22 Ocean Pde, coogee'), 'Coogee');
  assert.equal(suburbOf('3 Kurrajong Ave, Epping, NSW, 2121'), 'Epping');
  assert.equal(suburbOf('14 Banksia St'), null);
  assert.equal(suburbOf(null), null);
});

test('jobTypeOf prefers the tagged job type and tidies text', () => {
  assert.equal(jobTypeOf({ job_type: 'ROOF LEAK', issue: 'water everywhere' }), 'Roof leak');
  assert.equal(jobTypeOf({ issue: '  cracked   tiles on the roof ' }), 'Roof tile repair');
  assert.equal(jobTypeOf({ issue: 'Skirting boards' }), 'Skirting boards');
  assert.equal(topCounts(['A', 'B', 'A', null]).map((x) => `${x.label}${x.count}`).join(), 'A2,B1');
});

test('busiestTimes buckets by local weekday and time block', () => {
  // Friday 25 Sep 2026, 10am Sydney = 00:00Z
  const grid = busiestTimes([{ call_started_at: '2026-09-25T00:00:00Z' }], 'Australia/Sydney');
  assert.equal(grid[4][1], 1);
  assert.equal(grid.flat().reduce((a, b) => a + b), 1);
});

test('customersFrom groups by phone (+61 and 0 forms), skips spam, totals won', () => {
  const customers = customersFrom([
    call({ caller_name: 'Sarah', callback_number: '0412 345 678', lead_status: 'won', won_value: 2000 }),
    call({ caller_name: 'Sarah M', callback_number: '+61412345678', call_started_at: '2026-09-23T00:00:00Z' }),
    call({ caller_name: 'Spam', callback_number: '0400000000', urgency: 'irrelevant' }),
  ]);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].calls.length, 2);
  assert.equal(customers[0].name, 'Sarah M'); // most recent name wins
  assert.equal(customers[0].wonValue, 2000);
  assert.equal(customers[0].repeat, true);
});

test('isLead: untagged calls count when real, not hang-ups or spam', () => {
  assert.equal(isLead(call({ urgency: null, duration_seconds: 40 })), true);
  assert.equal(isLead(call({ urgency: null, duration_seconds: 5, caller_name: 'Sam' })), true);
  assert.equal(isLead(call({ urgency: null, duration_seconds: 5 })), false);
  assert.equal(isLead(call({ urgency: 'irrelevant' })), false);
});

test('callsPerPhone: counts leads per number, +61 and 0 are the same', () => {
  const counts = callsPerPhone([
    call({ callback_number: '+61412345678' }),
    call({ callback_number: '0412 345 678' }),
    call({ callback_number: '0400000000', urgency: 'irrelevant' }),
  ]);
  assert.equal(counts.get('0412345678'), 2);
  assert.equal(counts.has('0400000000'), false);
});

test('monthlyTotals: 12 months oldest first, with won money in the month it was won', () => {
  const now = new Date(2026, 8, 24, 12);
  const rows = monthlyTotals(
    [
      call({ call_started_at: new Date(2026, 8, 3).toISOString() }),
      call({ call_started_at: new Date(2026, 6, 10).toISOString(), lead_status: 'won', won_value: 900, status_updated_at: new Date(2026, 7, 2).toISOString() }),
      call({ call_started_at: new Date(2024, 0, 1).toISOString() }), // too old
    ],
    now,
  );
  assert.equal(rows.length, 12);
  assert.equal(rows[11].calls, 1);
  assert.equal(rows[9].calls, 1);
  assert.equal(rows[10].won, 1);
  assert.equal(rows[10].wonValue, 900);
  assert.equal(rows.reduce((n, r) => n + r.calls, 0), 2);
});

test('bookingFinder / callbackList: booked callers leave the call-back list', () => {
  const calls = [call({ id: 'a', vapi_call_id: 'v1', urgency: 'urgent' }), call({ id: 'b', urgency: 'urgent' }), call({ id: 'c' })];
  const bookings = [
    { id: 'x', vapi_call_id: 'v1', status: 'booked', starts_at: '2026-09-30T00:00:00Z' },
    { id: 'y', call_id: 'c', status: 'cancelled', starts_at: '2026-09-30T00:00:00Z' },
  ];
  const bookingOf = bookingFinder(bookings);
  assert.equal(bookingOf(calls[0])?.id, 'x');
  assert.equal(bookingOf(calls[2]), null); // cancelled doesn't count
  const list = callbackList(calls, new Date('2026-09-22T01:00:00Z'), client, bookings).map((c) => c.id);
  assert.deepEqual(list, ['b', 'c']);
});
