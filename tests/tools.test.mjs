import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAvailability, planBooking, toolName } from '../netlify/lib/tools.mjs';
import { parseToolCalls, parseWebhook } from '../netlify/lib/parse-call.mjs';
import { parseLocalDateTime } from '../src/lib/time.js';

const TZ = 'Australia/Sydney';
const client = {
  id: 'client-1',
  timezone: TZ,
  business_hours: { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '12:00'], sat: null, sun: null },
};
const now = parseLocalDateTime('2026-09-24T12:00', TZ); // Thursday midday
const booked = [{ starts_at: parseLocalDateTime('2026-09-25T09:00', TZ).toISOString(), duration_minutes: 60, status: 'booked' }];

test('toolName accepts common spellings', () => {
  assert.equal(toolName('check_availability'), 'check_availability');
  assert.equal(toolName('checkAvailability'), 'check_availability');
  assert.equal(toolName('Book Job'), 'book_job');
  assert.equal(toolName('send_text'), null);
});

test('checkAvailability lists free times Elliot can read out', () => {
  const reply = checkAvailability({ args: { date: '2026-09-25' }, client, bookings: booked, now });
  assert.equal(reply, 'Free times on Friday 25 September: 7am, 8am, 10am or 11am.');
  assert.match(checkAvailability({ args: { date: '2026-09-26' }, client, bookings: [], now }), /no free times on Saturday/);
  assert.match(checkAvailability({ args: {}, client, bookings: [], now }), /need a date/);
});

test('planBooking books a free slot in local time', () => {
  const plan = planBooking({
    args: { name: 'Sarah', phone: '0412 345 678', address: '14 Banksia St', job: 'Roof leak', start_time: '2026-09-25T10:00' },
    client,
    bookings: booked,
    now,
    vapiCallId: 'call_1',
  });
  assert.equal(plan.reply, 'Booked for Friday 25 September at 10am.');
  assert.equal(plan.booking.starts_at, '2026-09-25T00:00:00.000Z');
  assert.equal(plan.booking.source, 'elliot');
  assert.equal(plan.booking.client_id, 'client-1');
  assert.equal(plan.booking.vapi_call_id, 'call_1');
});

test('planBooking refuses taken, past and closed times with alternatives', () => {
  const taken = planBooking({ args: { job: 'x', start_time: '2026-09-25T09:00' }, client, bookings: booked, now });
  assert.equal(taken.booking, undefined);
  assert.match(taken.reply, /isn't free\. Free times on Friday 25 September: 7am, 8am, 10am or 11am/);
  assert.match(planBooking({ args: { start_time: '2026-09-20T09:00' }, client, bookings: [], now }).reply, /already passed/);
  assert.match(planBooking({ args: { start_time: '2026-09-25T11:30', duration_minutes: 60 }, client, bookings: [], now }).reply, /isn't free/);
});

test('parseWebhook routes Vapi tool-calls and parses JSON-string arguments', () => {
  const parsed = parseWebhook({
    message: {
      type: 'tool-calls',
      call: { id: 'call_1', assistantId: 'asst_1', customer: { number: '+61412345678' } },
      toolCallList: [{ id: 'tc_1', function: { name: 'book_job', arguments: '{"job":"Roof leak"}' } }],
    },
  });
  assert.deepEqual(parsed.toolCalls, {
    assistantId: 'asst_1',
    vapiCallId: 'call_1',
    customerNumber: '+61412345678',
    calls: [{ id: 'tc_1', name: 'book_job', args: { job: 'Roof leak' } }],
  });
  assert.equal(parseToolCalls({ toolCallList: [{ function: { name: 'x' } }] }).calls.length, 0); // no id
});

test('end-of-call report keeps recording, transcript, summary and job type', () => {
  const { row } = parseWebhook({
    message: {
      type: 'end-of-call-report',
      call: { id: 'c', assistantId: 'a' },
      artifact: { recordingUrl: 'https://rec/1.wav', transcript: 'AI: hi' },
      analysis: { summary: 'Roof leak, wants quote', structuredData: { urgency: 'Urgent', job_type: 'Roof leak' } },
    },
  });
  assert.equal(row.recording_url, 'https://rec/1.wav');
  assert.equal(row.transcript, 'AI: hi');
  assert.equal(row.summary, 'Roof leak, wants quote');
  assert.equal(row.job_type, 'Roof leak');
});
