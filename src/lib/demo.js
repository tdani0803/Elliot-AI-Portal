// Sample data for VITE_DEMO_MODE=true — lets you preview the portal without Supabase.

const SAMPLES = [
  ['Sarah Mitchell', '0412 345 678', '14 Banksia St, Newtown', 'Roof leak over kitchen', 'Water coming through the ceiling since last night\'s storm. Bucket under it.', 'urgent', 248],
  ['Dave Nguyen', '0438 221 904', '7/22 Ocean Pde, Coogee', 'Cracked bathroom tiles', 'About 6 floor tiles cracked near the shower. Wants a quote.', 'non_urgent', 171],
  ['Priya Sharma', '0400 118 552', '3 Kurrajong Ave, Epping', 'Gutter replacement', 'Gutters overflowing at the back of the house, some rust. Before winter ideally.', 'somewhat_urgent', 203],
  ['Unknown caller', null, null, 'Asked about car insurance', 'Wrong number — looking for an insurance company.', 'irrelevant', 42],
  ['Mark Thompson', '0421 777 310', '88 Parramatta Rd, Annandale', 'Full kitchen splashback', 'New kitchen, needs splashback tiled. Tiles already bought.', 'non_urgent', 305],
  ['Jenny Lee', '0415 903 226', '12 Wattle Cres, Ryde', 'Broken ridge capping', 'Ridge capping came loose in the wind, pieces in the yard.', 'urgent', 189],
  ['Tom Walsh', '0407 664 019', '5 Kent St, Balmain', 'Re-grout shower', 'Grout going black and mouldy in the ensuite shower.', 'somewhat_urgent', 156],
  ['Robocall', null, null, 'Solar panel sales pitch', 'Automated sales call.', 'irrelevant', 25],
  ['Emma Clarke', '0433 210 887', '41 Fig Tree Ln, Castle Hill', 'Roof restoration quote', 'Tiled roof, faded and some moss. Getting three quotes.', 'non_urgent', 274],
  ['Chris Papadopoulos', '0419 552 740', '9 Station St, Petersham', 'Leaking skylight', 'Skylight drips when it rains heavy. Been going a couple of weeks.', 'somewhat_urgent', 222],
];

function buildCalls() {
  const now = Date.now();
  const calls = [];
  // Spread ~60 calls over the last ~75 days, denser recently.
  for (let i = 0; i < 60; i++) {
    const [caller_name, callback_number, address, issue, details, urgency, duration] = SAMPLES[i % SAMPLES.length];
    const hoursAgo = Math.round(3 + i * i * 0.5 + (i % 5) * 7);
    calls.push({
      id: `demo-${i}`,
      call_started_at: new Date(now - hoursAgo * 3600_000).toISOString(),
      duration_seconds: duration + ((i * 37) % 60),
      caller_name,
      callback_number,
      address,
      issue,
      details,
      urgency,
    });
  }
  return calls.sort((a, b) => b.call_started_at.localeCompare(a.call_started_at));
}

export const demoClient = { business_name: 'Harbour City Roofing (Demo)', avg_job_value: 2500, conversion_rate: 0.3 };
export const demoCalls = buildCalls();
