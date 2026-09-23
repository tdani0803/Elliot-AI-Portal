// Sample data for VITE_DEMO_MODE=true — lets you preview the portal without Supabase.

const SAMPLES = [
  ['Sarah Mitchell', '0412 345 678', '14 Banksia St, Newtown NSW 2042', 'Roof leak over kitchen', 'Roof leak', 'Water coming through the ceiling since last night\'s storm. Bucket under it.', 'urgent', 248],
  ['Dave Nguyen', '0438 221 904', '7/22 Ocean Pde, Coogee', 'Cracked bathroom tiles', 'Tiling', 'About 6 floor tiles cracked near the shower. Wants a quote.', 'non_urgent', 171],
  ['Priya Sharma', '0400 118 552', '3 Kurrajong Ave, Epping', 'Gutter replacement', 'Gutters', 'Gutters overflowing at the back of the house, some rust. Before winter ideally.', 'somewhat_urgent', 203],
  ['Unknown caller', null, null, 'Asked about car insurance', null, 'Wrong number — looking for an insurance company.', 'irrelevant', 42],
  ['Mark Thompson', '0421 777 310', '88 Parramatta Rd, Annandale', 'Full kitchen splashback', 'Tiling', 'New kitchen, needs splashback tiled. Tiles already bought.', 'non_urgent', 305],
  ['Jenny Lee', '0415 903 226', '12 Wattle Cres, Ryde', 'Broken ridge capping', 'Roof repair', 'Ridge capping came loose in the wind, pieces in the yard.', 'urgent', 189],
  ['Tom Walsh', '0407 664 019', '5 Kent St, Balmain', 'Re-grout shower', 'Tiling', 'Grout going black and mouldy in the ensuite shower.', 'somewhat_urgent', 156],
  ['Robocall', null, null, 'Solar panel sales pitch', null, 'Automated sales call.', 'irrelevant', 25],
  ['Emma Clarke', '0433 210 887', '41 Fig Tree Ln, Castle Hill', 'Roof restoration quote', 'Roof restoration', 'Tiled roof, faded and some moss. Getting three quotes.', 'non_urgent', 274],
  ['Chris Papadopoulos', '0419 552 740', '9 Station St, Petersham', 'Leaking skylight', 'Roof leak', 'Skylight drips when it rains heavy. Been going a couple of weeks.', 'somewhat_urgent', 222],
  ['Sarah Mitchell', '0412 345 678', '14 Banksia St, Newtown NSW 2042', 'Follow-up on roof leak quote', 'Roof leak', 'Wants to know when the quote will be ready.', 'non_urgent', 95],
];

// Status by position: recent calls are mostly new, older ones have moved along.
function statusFor(i, urgency) {
  if (urgency === 'irrelevant') return 'new';
  if (i < 5) return 'new';
  const cycle = ['called_back', 'quoted', 'won', 'won', 'lost', 'quoted', 'won'];
  return cycle[i % cycle.length];
}

function buildCalls() {
  const now = Date.now();
  const calls = [];
  for (let i = 0; i < 60; i++) {
    const [caller_name, callback_number, address, issue, job_type, details, urgency, duration] = SAMPLES[i % SAMPLES.length];
    const hoursAgo = Math.round(3 + i * i * 0.5 + (i % 5) * 7);
    const started = now - hoursAgo * 3600_000;
    const lead_status = statusFor(i, urgency);
    calls.push({
      id: `demo-${i}`,
      call_started_at: new Date(started).toISOString(),
      duration_seconds: duration + ((i * 37) % 60),
      caller_name,
      callback_number,
      address,
      issue,
      job_type,
      details,
      urgency,
      summary: urgency === 'irrelevant' ? `Not a job: ${details}` : `${caller_name ?? 'Caller'} needs help with: ${issue.toLowerCase()}. ${details}`,
      recording_url: null,
      transcript: `Elliot: G'day, you've reached Harbour City Roofing, this is Elliot. How can I help?\nCaller: Hi, ${details}\nElliot: No worries, I'll get someone to call you back shortly.`,
      lead_status,
      won_value: lead_status === 'won' ? 1800 + ((i * 713) % 4200) : null,
      notes: lead_status === 'quoted' ? 'Quote sent by email.' : null,
      assigned_to: lead_status === 'new' ? null : i % 2 ? 'Jake' : 'Mia',
      status_updated_at: lead_status === 'new' ? null : new Date(started + 26 * 3600_000).toISOString(),
    });
  }
  return calls.sort((a, b) => b.call_started_at.localeCompare(a.call_started_at));
}

function buildBookings() {
  const day = (offset, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  return [
    { id: 'demo-b1', customer_name: 'Sarah Mitchell', phone: '0412 345 678', address: '14 Banksia St, Newtown', job: 'Fix roof leak over kitchen', starts_at: day(0, 14), duration_minutes: 120, status: 'booked', source: 'elliot', assigned_to: 'Jake' },
    { id: 'demo-b2', customer_name: 'Jenny Lee', phone: '0415 903 226', address: '12 Wattle Cres, Ryde', job: 'Replace ridge capping', starts_at: day(1, 8), duration_minutes: 180, status: 'booked', source: 'manual', assigned_to: 'Mia' },
    { id: 'demo-b3', customer_name: 'Emma Clarke', phone: '0433 210 887', address: '41 Fig Tree Ln, Castle Hill', job: 'Measure up for roof restoration quote', starts_at: day(2, 10), duration_minutes: 60, status: 'booked', source: 'elliot' },
    { id: 'demo-b4', customer_name: 'Tom Walsh', phone: '0407 664 019', address: '5 Kent St, Balmain', job: 'Re-grout ensuite shower', starts_at: day(-2, 9), duration_minutes: 240, status: 'done', source: 'manual' },
  ];
}

export const demoClient = {
  id: 'demo-client',
  business_name: 'Harbour City Roofing (Demo)',
  avg_job_value: 2500,
  conversion_rate: 0.3,
  monthly_fee: 750,
  timezone: 'Australia/Sydney',
  business_hours: { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'], sat: null, sun: null },
  review_url: 'https://g.page/r/example/review',
  callback_urgent_minutes: 60,
  callback_standard_minutes: 240,
  calendar_token: '00000000-0000-4000-8000-000000000000',
};
export const demoMembers = [{ display_name: 'Jake' }, { display_name: 'Mia' }];
export const demoCalls = buildCalls();
export const demoBookings = buildBookings();
