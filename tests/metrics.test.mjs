import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateCalls, estimatedValue, rangeStart, summarise } from '../src/lib/metrics.js';
import { formatDuration } from '../src/lib/format.js';

test('rangeStart: week starts Monday, month starts on the 1st, all time is null', () => {
  const wed = new Date(2026, 8, 23, 15, 30); // Wed 23 Sep 2026
  assert.deepEqual(rangeStart('week', wed), new Date(2026, 8, 21));
  assert.deepEqual(rangeStart('month', wed), new Date(2026, 8, 1));
  assert.equal(rangeStart('all', wed), null);
  const sun = new Date(2026, 8, 27, 9);
  assert.deepEqual(rangeStart('week', sun), new Date(2026, 8, 21));
});

test('estimated value = leads × average job value × conversion rate', () => {
  assert.equal(estimatedValue(10, 2500, 0.3), 7500);
});

test('aggregateCalls counts leads excluding irrelevant and untagged calls', () => {
  const calls = [
    { call_started_at: '2026-09-22T00:00:00Z', duration_seconds: 120, urgency: 'urgent' },
    { call_started_at: '2026-09-22T00:00:00Z', duration_seconds: 60, urgency: 'non_urgent' },
    { call_started_at: '2026-09-22T00:00:00Z', duration_seconds: 30, urgency: 'irrelevant' },
    { call_started_at: '2026-09-22T00:00:00Z', duration_seconds: 30, urgency: null },
    { call_started_at: '2026-08-01T00:00:00Z', duration_seconds: 200, urgency: 'somewhat_urgent' },
  ];
  assert.deepEqual(aggregateCalls(calls, new Date('2026-09-01T00:00:00Z')), {
    calls_handled: 4,
    total_seconds: 240,
    leads_captured: 2,
    urgent: 1,
    somewhat_urgent: 0,
    non_urgent: 1,
  });
  assert.equal(aggregateCalls(calls).leads_captured, 3);
});

test('summarise derives averages and value; no value until a job value is set', () => {
  const stats = { calls_handled: 4, total_seconds: '600', leads_captured: 2, urgent: 1, somewhat_urgent: 1, non_urgent: 0 };
  const m = summarise(stats, { avg_job_value: '2000.00', conversion_rate: '0.300' });
  assert.equal(m.avgSeconds, 150);
  assert.equal(m.value, 1200);
  assert.equal(summarise(stats, { avg_job_value: 0, conversion_rate: 0.3 }).value, null);
  assert.equal(summarise({ calls_handled: 0, total_seconds: 0 }, { avg_job_value: 1 }).avgSeconds, 0);
});

test('formatDuration reads naturally', () => {
  assert.equal(formatDuration(42), '42 sec');
  assert.equal(formatDuration(95), '1 min 35 sec');
  assert.equal(formatDuration(180), '3 min');
  assert.equal(formatDuration(3725), '62 min');
});

test('formatDurationShort fits a stat tile', async () => {
  const { formatDurationShort } = await import('../src/lib/format.js');
  assert.equal(formatDurationShort(213), '3m 33s');
  assert.equal(formatDurationShort(40), '40s');
  assert.equal(formatDurationShort(720), '12m');
});
