import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OTHER_JOB, jobLabel, shortDetails } from '../src/lib/jobs.js';

test('jobLabel: short job names across trades', () => {
  const cases = [
    [{ issue: 'Roof restoration quote' }, 'Roof restoration'],
    [{ issue: 'water coming through the ceiling since the storm' }, 'Roof leak'],
    [{ issue: 'gutters overflowing everywhere' }, 'Gutter job'],
    [{ issue: 'need the gutters cleaned' }, 'Gutter clean'],
    [{ issue: 'hot water system died' }, 'Hot water'],
    [{ issue: 'kitchen sink is blocked' }, 'Blocked drain'],
    [{ issue: 'power keeps tripping' }, 'Switchboard / tripping'],
    [{ job_type: 'Solar panel install' }, 'Solar'],
    [{ issue: 'getting the house painted' }, 'Painting'],
    [{ issue: 'split system not cooling' }, 'Air con'],
    [{ issue: 'cracked tiles on roof' }, 'Roof tile repair'],
    [{ issue: 'how much for a quote' }, 'Quote / price'],
  ];
  for (const [call, want] of cases) assert.equal(jobLabel(call), want, JSON.stringify(call));
});

test('jobLabel: words inside other words do not trip rules', () => {
  assert.equal(jobLabel({ issue: 'I want to talk to someone' }), OTHER_JOB); // "want" isn't ants
  assert.equal(jobLabel({ issue: 'I would rather not say' }), OTHER_JOB); // "rather" isn't rats
});

test('jobLabel: falls back to a short tag, the summary, or nothing', () => {
  assert.equal(jobLabel({ issue: 'skirting boards' }), 'Skirting boards');
  assert.equal(jobLabel({ issue: 'something', summary: 'Caller has a leaking roof.' }), 'Roof leak');
  assert.equal(jobLabel({}), null);
});

test('shortDetails: first sentence, lead-in dropped, cut to fit', () => {
  assert.equal(
    shortDetails({ summary: 'Sarah Mitchell needs help with: roof leak over kitchen. Water coming through.' }),
    'Roof leak over kitchen.',
  );
  const long = shortDetails({ details: 'a '.repeat(80) }, 20);
  assert.ok(long.length <= 21 && long.endsWith('…'));
  assert.equal(shortDetails({}), '');
});

test('jobLabel: the job named first wins, not Elliot chatter later on', () => {
  assert.equal(jobLabel({ summary: 'Caller Dani needs a roof repair. Elliot tried to lock in Tuesday at 9am but the booking failed.' }), 'Roof repair');
  assert.equal(jobLabel({ issue: 'I need a quote for a roof restoration' }), 'Roof restoration');
  assert.equal(jobLabel({ issue: 'locked out of the house' }), 'Locks / keys');
  assert.equal(jobLabel({ issue: 'gutters overflowing, water in the ceiling' }), 'Gutter job');
});
