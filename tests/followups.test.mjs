import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bookedNotification,
  buildCallerText,
  buildReminderText,
  buildWeeklySummary,
  isAuMobile,
  lastWeek,
  reminderDue,
  summaryDue,
} from '../netlify/lib/followups.mjs';

const client = { business_name: 'Tysons Roofing', timezone: 'Australia/Brisbane', callback_urgent_minutes: 60, callback_standard_minutes: 240, business_phone: '07 3000 0000' };

test('isAuMobile: only mobiles get texts', () => {
  assert.equal(isAuMobile('0412 345 678'), true);
  assert.equal(isAuMobile('+61 412 345 678'), true);
  assert.equal(isAuMobile('07 3000 0000'), false);
  assert.equal(isAuMobile(null), false);
});

test('caller text: promise when not booked, time when booked', () => {
  const call = { caller_name: 'Dani Smith', urgency: 'non_urgent', issue: 'Roof repair' };
  assert.equal(
    buildCallerText(call, client),
    "Hi Dani, thanks for calling Tysons Roofing. We've got your roof repair request and the team will call you back within 4 hours.",
  );
  const booked = buildCallerText(call, client, { starts_at: '2026-09-28T23:00:00Z' });
  assert.match(booked, /You're booked in for Tuesday 29 September at 9am for your roof repair\./);
  assert.match(booked, /Call us on 07 3000 0000\./);
  assert.match(buildCallerText({ urgency: 'urgent' }, client), /^Hi, thanks for calling Tysons Roofing\. We've got your request .* within 1 hour\.$/);
});

test('booked notification and reminder text read naturally', () => {
  const booking = { job: 'Roof repair', customer_name: 'Dani', address: '12 Smith St, Ipswich QLD 4305', starts_at: '2026-09-28T23:00:00Z' };
  assert.deepEqual(bookedNotification(booking, client).title, 'New job booked');
  assert.match(bookedNotification(booking, client).body, /^Roof repair in Ipswich, Tuesday 29 September at 9am/);
  assert.equal(
    buildReminderText(booking, client),
    "Hi Dani, a reminder from Tysons Roofing: we're coming tomorrow (Tuesday 29 September) at 9am for your roof repair at 12 Smith St, Ipswich QLD 4305. Need to change anything? Call us on 07 3000 0000.",
  );
});

test('reminderDue: the afternoon before, in the business time zone', () => {
  const booking = { starts_at: '2026-09-28T23:00:00Z' }; // Tue 9am Brisbane
  assert.equal(reminderDue(booking, client, new Date('2026-09-28T06:30:00Z')), true); // Mon 4:30pm
  assert.equal(reminderDue(booking, client, new Date('2026-09-28T02:00:00Z')), false); // Mon noon
  assert.equal(reminderDue(booking, client, new Date('2026-09-28T11:00:00Z')), false); // Mon 9pm
  assert.equal(reminderDue(booking, client, new Date('2026-09-27T07:00:00Z')), false); // Sun 5pm, 2 days out
});

test('weekly summary: Monday from 7am, covering last Mon–Sun', () => {
  assert.equal(summaryDue(client, new Date('2026-09-27T21:30:00Z')), true); // Mon 7:30am Brisbane
  assert.equal(summaryDue(client, new Date('2026-09-27T19:00:00Z')), false); // Mon 5am
  assert.equal(summaryDue(client, new Date('2026-09-28T21:30:00Z')), false); // Tue
  const week = lastWeek(new Date('2026-09-27T21:30:00Z'), 'Australia/Brisbane');
  assert.equal(week.from.toISOString(), '2026-09-20T14:00:00.000Z'); // Mon 21 Sep 00:00 Brisbane
  assert.equal(week.to.toISOString(), '2026-09-27T14:00:00.000Z');
  assert.equal(week.localDate, '2026-09-28');
  const msg = buildWeeklySummary({
    calls: [{ urgency: 'urgent' }, { urgency: 'non_urgent' }, { urgency: 'irrelevant' }],
    wonCalls: [{ won_value: 3000 }, { won_value: 5400 }],
    waiting: 2,
  });
  assert.equal(msg.body, 'Last week Elliot took 3 calls, 2 leads and 2 jobs won ($8,400). 2 people are still waiting on a call back. Tap for your report.');
});
