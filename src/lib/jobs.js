// Turn whatever Elliot wrote down ("water's been coming through the ceiling since the storm…")
// into a short job name a tradie gets at a glance ("Roof leak"). Works for every trade.
// Order matters: the first rule that matches wins, so specific jobs sit above general ones.

const RULES = [
  [/hot water|water heater|no hot/, 'Hot water'],

  // Roofing
  [/restor/, 'Roof restoration'],
  [/gutter.*(clean|clear)|(clean|clear).*gutter/, 'Gutter clean'],
  [/gutter|downpipe|fascia/, 'Gutter job'],
  [/re-?point|ridge ?cap|bedding/, 'Roof repointing'],
  [/(roof|ceiling).*(leak|drip|water)|(leak|drip|water).*(roof|ceiling)/, 'Roof leak'],
  [/(roof|tile|\btin\b).*(paint|spray)|(paint|spray).*(roof|tile|\btin\b)/, 'Roof painting'],
  [/(roof|tile|\btin\b).*(clean|wash)|(clean|wash).*(roof|tile|\btin\b)/, 'Roof clean'],
  [/re-?roof|new roof|roof replace|replace.*roof/, 'New roof'],
  [/skylight|whirly ?bird|roof vent/, 'Skylight / vent'],
  [/(roof|tile).*(inspect|check|report)|(inspect|check).*roof/, 'Roof inspection'],
  [/storm|hail|tree.*roof|roof.*damage/, 'Storm damage'],
  [/(broken|cracked|slipped|missing|loose).*tile|tile.*(broken|cracked|slipped|missing|loose)/, 'Roof tile repair'],
  [/tin roof|metal roof|colorbond|iron roof/, 'Tin roof job'],

  // Plumbing
  [/block|clog|drain|sewer|overflow/, 'Blocked drain'],
  [/burst|pipe/, 'Burst / leaking pipe'],
  [/toilet|cistern/, 'Toilet repair'],
  [/\btaps?\b|faucet|mixer/, 'Tap repair'],
  [/gas (leak|fit|line|smell)|smell.*gas|gas appliance/, 'Gas job'],

  // Electrical
  [/no power|power (out|cut|outage)|blackout|lost power/, 'Power out'],
  [/switch ?board|\bfuse|safety switch|tripp|rcd|breaker/, 'Switchboard / tripping'],
  [/smoke (alarm|detector)/, 'Smoke alarms'],
  [/ev charg|car charg/, 'EV charger'],
  [/solar|battery|inverter/, 'Solar'],
  [/power ?point|outlet|socket/, 'Power points'],
  [/ceiling fan|fan install/, 'Ceiling fan'],
  [/\blights?\b|lighting|downlight|\blamp/, 'Lighting'],
  [/rewir|wiring|electric/, 'Electrical job'],

  // Air con / heating
  [/air ?con|a\/c|split system|ducted|heat pump|cooling|heating/, 'Air con'],

  // Building and outdoor trades
  [/bathroom|ensuite|shower/, 'Bathroom job'],
  [/kitchen|benchtop|cabinet/, 'Kitchen job'],
  [/tiling|tiler|floor tile|wall tile|splashback|re-?grout|grout/, 'Tiling'],
  [/deck/, 'Decking'],
  [/fenc|\bgates?\b/, 'Fencing'],
  [/concret|driveway|slab|\bpath/, 'Concreting'],
  [/retaining wall/, 'Retaining wall'],
  [/\btrees?\b|stump|lopp|prun/, 'Tree job'],
  [/lawn|mow|turf|garden|landscap|hedge/, 'Garden / lawn'],
  [/pressure (clean|wash)|high pressure|soft wash/, 'Pressure clean'],
  [/window clean/, 'Window clean'],
  [/glass|glaz|window|mirror/, 'Glass / windows'],
  [/lock(ed)? out|locksmith|\block|\bkeys?\b/, 'Locks / keys'],
  [/termite|\bpests?\b|rodent|\brats?\b|\bmice\b|cockroach|spider|\bants?\b/, 'Pest control'],
  [/paint/, 'Painting'],
  [/plaster|gyprock|ceiling|wall (crack|hole)/, 'Plastering'],
  [/floor|carpet|timber|vinyl|lino/, 'Flooring'],
  [/\bdoors?\b/, 'Doors'],
  [/renovat|extension|build|granny flat/, 'Building / reno'],
  [/clean/, 'Cleaning'],
  [/leak|drip|water/, 'Leak'],
  [/roof|tile/, 'Roof repair'],
  [/plumb/, 'Plumbing job'],

  // Not a job type, but still worth knowing
  [/quote|price|cost|how much/, 'Quote / price'],
  [/maintenance|service|general repair|handyman|odd job/, 'Maintenance'],
];

export const OTHER_JOB = 'Other job';

export function classifyJob(text) {
  const t = ` ${String(text ?? '').toLowerCase()} `;
  if (!t.trim()) return null;
  for (const [re, label] of RULES) if (re.test(t)) return label;
  return null;
}

const tidy = (text) => {
  const s = String(text).trim().replace(/\s+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

// The short job name for a call. Looks at the tagged job type first, then what they
// said, then the summary. A short tag Elliot wrote itself is kept as-is if no rule fits.
export function jobLabel(call) {
  const sources = [call.job_type, call.issue, call.details, call.summary];
  for (const text of sources) {
    const hit = classifyJob(text);
    if (hit) return hit;
  }
  for (const text of [call.job_type, call.issue]) {
    if (text && String(text).trim().split(/\s+/).length <= 3) return tidy(text);
  }
  return sources.some(Boolean) ? OTHER_JOB : null;
}

// One short line about the call: the first sentence of what they said, cut to fit a phone.
export function shortDetails(call, max = 90) {
  const raw = [call.details, call.summary, call.issue].find((t) => t && String(t).trim());
  if (!raw) return '';
  let s = String(raw).trim().replace(/\s+/g, ' ');
  // Drop the "Sarah Mitchell needs help with:" style lead-in some summaries start with.
  s = s.replace(/^(the )?(caller|customer|[A-Z][a-z]+( [A-Z][a-z]+)?) (called|rang|needs help with|is calling about|wants|needs)( about| to)?:?\s*/, '');
  const first = s.split(/(?<=[.!?])\s/)[0];
  const out = first.length <= max ? first : `${first.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
