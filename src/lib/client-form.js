// The "add / edit a client" form: one set of checks, used by the owner page (instant feedback)
// and the server (the real gatekeeper).
export const STATES = ['QLD', 'NSW', 'VIC', 'TAS', 'ACT', 'SA', 'NT', 'WA'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const num = (v, fallback) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : fallback);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

export function checkClientForm(input = {}) {
  const errors = {};
  const row = {
    business_name: text(input.business_name),
    owner_email: text(input.owner_email)?.toLowerCase() ?? null,
    state: text(input.state)?.toUpperCase() ?? null,
    alert_phone: text(input.alert_phone),
    business_phone: text(input.business_phone),
    review_url: text(input.review_url),
    vapi_assistant_id: text(input.vapi_assistant_id),
    callback_urgent_minutes: Math.round(num(input.callback_urgent_minutes, 60)),
    callback_standard_minutes: Math.round(num(input.callback_standard_minutes, 240)),
    avg_job_value: num(input.avg_job_value, 0),
    monthly_fee: num(input.monthly_fee, 0),
  };
  if (!row.business_name) errors.business_name = 'Type the business name.';
  if (!row.owner_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.owner_email)) errors.owner_email = 'Type the email they log in with.';
  if (!STATES.includes(row.state)) errors.state = 'Pick their state.';
  if (row.review_url && !/^https?:\/\//i.test(row.review_url)) errors.review_url = 'The review link should start with https://';
  if (!(row.callback_urgent_minutes > 0)) errors.callback_urgent_minutes = 'Pick a call-back time.';
  if (!(row.callback_standard_minutes > 0)) errors.callback_standard_minutes = 'Pick a call-back time.';
  if (row.avg_job_value < 0) errors.avg_job_value = "Can't be less than 0.";
  if (row.monthly_fee < 0) errors.monthly_fee = "Can't be less than 0.";

  const hours = {};
  for (const day of DAYS) {
    const span = input.business_hours?.[day];
    if (!span) {
      hours[day] = null;
      continue;
    }
    const [open, close] = span;
    if (!TIME.test(open ?? '') || !TIME.test(close ?? '') || open >= close) {
      errors.business_hours = `Check the hours for ${day.charAt(0).toUpperCase()}${day.slice(1)}: opening must be before closing.`;
    }
    hours[day] = [open, close];
  }
  row.business_hours = hours;
  return { row, errors, ok: Object.keys(errors).length === 0 };
}

