// Vapi tools Elliot can use during a call:
//   check_availability { date: "YYYY-MM-DD" }
//   book_job { name, phone, address, job, start_time: "YYYY-MM-DDTHH:mm", duration_minutes? }
// Times are the business's local time. Replies are short sentences Elliot can read out.

import {
  DEFAULT_TZ,
  formatDayInZone,
  formatTimeInZone,
  freeSlots,
  parseDateOnly,
  zonedParts,
  zonedToUtc,
} from '../../src/lib/time.js';

const normaliseName = (name) => String(name ?? '').toLowerCase().replace(/[^a-z]/g, '');
export const TOOL_NAMES = {
  checkavailability: 'check_availability',
  getavailability: 'check_availability',
  bookjob: 'book_job',
  bookappointment: 'book_job',
  createbooking: 'book_job',
  // The existing "Send Text" tool: point it here and the lead goes to the portal instead of an SMS.
  sendtext: 'save_lead',
  sendsms: 'save_lead',
  sms: 'save_lead',
  textowner: 'save_lead',
  savelead: 'save_lead',
};

// Up to `max` times spread across the day, so callers hear morning and afternoon options.
function listTimes(slots, tz, max = 6) {
  const picked = slots.length <= max ? slots : Array.from({ length: max }, (_, i) => slots[Math.round((i * (slots.length - 1)) / (max - 1))]);
  const times = picked.map((s) => formatTimeInZone(s, tz));
  if (times.length <= 1) return times.join('');
  return `${times.slice(0, -1).join(', ')} or ${times[times.length - 1]}`;
}

// Bookings overlapping [dayStart, dayEnd) are needed for a date; this gives that window.
export function dayWindow(date, tz = DEFAULT_TZ) {
  const start = zonedToUtc({ ...date, hour: 0 }, tz);
  return { from: new Date(start.getTime() - 86400000), to: new Date(start.getTime() + 2 * 86400000) };
}

const dayKey = (d) => d.year * 10000 + d.month * 100 + d.day;

// "2026-09-30" as a date. AI models often get the year wrong (a past year), so that day is
// moved to the next time it comes round. A past day in *this* year is left alone ("already passed").
export function readDate(text, tz = DEFAULT_TZ, now = new Date()) {
  const date = parseDateOnly(text);
  if (!date) return null;
  const today = zonedParts(now, tz);
  if (date.year >= today.year) return date;
  for (const year of [today.year, today.year + 1]) {
    if (dayKey({ ...date, year }) >= dayKey(today)) return { ...date, year };
  }
  return date;
}

// The booking start as a real moment in time, read as the business's local time.
// Copes with what models actually send: "2026-09-30T09:00", "...T09:00:00.000Z", "2026-09-30 2:30 PM",
// or the date and time as separate fields. A trailing Z/offset is ignored: Elliot always means local time.
export function readStartTime(args, tz = DEFAULT_TZ, now = new Date()) {
  let text = String(args.start_time ?? args.startTime ?? args.start ?? args.datetime ?? args.time ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) && (args.date ?? args.day)) text = `${args.date ?? args.day} ${text}`;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T\s]+(\d{1,2})(?:[:.](\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*([ap])?\.?m?\.?)?/i.exec(text);
  if (!m || m[2] === undefined) return null;
  const date = readDate(m[1], tz, now);
  let hour = Number(m[2]);
  const minute = Number(m[3] ?? 0);
  const half = m[4]?.toLowerCase();
  if (half === 'p' && hour < 12) hour += 12;
  if (half === 'a' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return zonedToUtc({ ...date, hour, minute }, tz);
}

// Which local day a tool call is about (for looking up that day's bookings).
export function toolDate(args, tz = DEFAULT_TZ, now = new Date()) {
  const start = readStartTime(args, tz, now);
  if (start) {
    const p = zonedParts(start, tz);
    return { year: p.year, month: p.month, day: p.day };
  }
  return readDate(args.date ?? args.day ?? args.start_time, tz, now);
}

export function checkAvailability({ args, client, bookings, now = new Date() }) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const date = toolDate(args, tz, now);
  if (!date) return 'Sorry, I need a date to check, like 2026-09-25.';
  const duration = Number(args.duration_minutes) || 60;
  const slots = freeSlots({ date, businessHours: client.business_hours, timeZone: tz, bookings, durationMinutes: duration, now });
  const label = formatDayInZone(zonedToUtc({ ...date, hour: 12 }, tz), tz);
  if (slots.length === 0) return `There are no free times on ${label}. Please offer another day.`;
  return `Free times on ${label}: ${listTimes(slots, tz)}.`;
}

// Returns { reply, booking? } — booking is the row to insert when the time is free.
export function planBooking({ args, client, bookings, now = new Date(), vapiCallId, customerNumber }) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const start = readStartTime(args, tz, now);
  if (!start) return { reply: 'Sorry, I need a date and time for the booking, like 2026-09-25T09:00.' };
  if (start <= now) return { reply: 'That time has already passed. Please pick a time in the future.' };
  const duration = Number(args.duration_minutes ?? args.durationMinutes) || 60;
  const job = String(args.job ?? args.issue ?? args.reason ?? '').trim() || 'Job';

  const p = zonedParts(start, tz);
  const date = { year: p.year, month: p.month, day: p.day };
  const slotsThatDay = freeSlots({ date, businessHours: client.business_hours, timeZone: tz, bookings, durationMinutes: duration, stepMinutes: 15, now });
  const fits = slotsThatDay.some((s) => s.getTime() === start.getTime());
  if (!fits) {
    const hourly = freeSlots({ date, businessHours: client.business_hours, timeZone: tz, bookings, durationMinutes: duration, now });
    const day = formatDayInZone(start, tz);
    return {
      reply: hourly.length
        ? `That time isn't free. Free times on ${day}: ${listTimes(hourly, tz)}.`
        : `There are no free times on ${day}. Please offer another day.`,
    };
  }

  return {
    reply: `Booked for ${formatDayInZone(start, tz)} at ${formatTimeInZone(start, tz)}.`,
    booking: {
      client_id: client.id,
      vapi_call_id: vapiCallId ?? null,
      customer_name: String(args.name ?? args.customer_name ?? '').trim() || null,
      phone: String(args.phone ?? args.callback_number ?? customerNumber ?? '').trim() || null,
      address: String(args.address ?? '').trim() || null,
      job,
      starts_at: start.toISOString(),
      duration_minutes: duration,
      notes: String(args.notes ?? args.details ?? '').trim() || null,
      source: 'elliot',
    },
  };
}

export const toolName = (name) => TOOL_NAMES[normaliseName(name)] ?? null;
