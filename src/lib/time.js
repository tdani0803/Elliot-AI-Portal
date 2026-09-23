// Timezone-aware helpers shared by the dashboard and the Netlify functions.
// Uses Intl only — no date library.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DEFAULT_TZ = 'Australia/Sydney';
export const DEFAULT_HOURS = {
  mon: ['07:00', '17:00'],
  tue: ['07:00', '17:00'],
  wed: ['07:00', '17:00'],
  thu: ['07:00', '17:00'],
  fri: ['07:00', '17:00'],
  sat: null,
  sun: null,
};

const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }
  return formatters.get(timeZone);
}

// Wall-clock parts of `date` in `timeZone`. dayIndex: 0 = Sunday.
export function zonedParts(date, timeZone = DEFAULT_TZ) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayIndex: DAY_KEYS.indexOf(parts.weekday.toLowerCase().slice(0, 3)),
  };
}

// The UTC instant for a wall-clock time in `timeZone` (handles daylight saving).
export function zonedToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone = DEFAULT_TZ) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms) => {
    const p = zonedParts(new Date(ms), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  let result = guess - offsetAt(guess);
  const second = guess - offsetAt(result);
  if (second !== result) result = second;
  return new Date(result);
}

// "2026-09-25" -> { year, month, day } (null if it isn't a date)
export function parseDateOnly(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text ?? '').trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

// "2026-09-25T09:30" (no offset) is read as local time in `timeZone`;
// anything with an offset or Z is taken as-is.
export function parseLocalDateTime(text, timeZone = DEFAULT_TZ) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return zonedToUtc({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] }, timeZone);
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

// Opening hours for a weekday as [openMinutes, closeMinutes], or null if closed.
export function hoursFor(dayIndex, businessHours = DEFAULT_HOURS) {
  const span = (businessHours ?? DEFAULT_HOURS)[DAY_KEYS[dayIndex]];
  if (!Array.isArray(span) || span.length !== 2) return null;
  const open = toMinutes(span[0]);
  const close = toMinutes(span[1]);
  return close > open ? [open, close] : null;
}

// True when the call came in outside business hours (evenings, weekends, closed days).
export function isAfterHours(date, businessHours = DEFAULT_HOURS, timeZone = DEFAULT_TZ) {
  const p = zonedParts(new Date(date), timeZone);
  const span = hoursFor(p.dayIndex, businessHours);
  if (!span) return true;
  const mins = p.hour * 60 + p.minute;
  return mins < span[0] || mins >= span[1];
}

// Free start times on a date, given existing bookings. Returns Date[].
export function freeSlots({ date, businessHours, timeZone = DEFAULT_TZ, bookings = [], durationMinutes = 60, stepMinutes = 60, now = new Date() }) {
  const noon = zonedToUtc({ ...date, hour: 12 }, timeZone);
  const span = hoursFor(zonedParts(noon, timeZone).dayIndex, businessHours);
  if (!span) return [];
  const busy = bookings
    .filter((b) => (b.status ?? 'booked') === 'booked')
    .map((b) => {
      const start = new Date(b.starts_at).getTime();
      return [start, start + (b.duration_minutes ?? 60) * 60000];
    });
  const slots = [];
  for (let m = span[0]; m + durationMinutes <= span[1]; m += stepMinutes) {
    const start = zonedToUtc({ ...date, hour: Math.floor(m / 60), minute: m % 60 }, timeZone).getTime();
    const end = start + durationMinutes * 60000;
    if (start <= now.getTime()) continue;
    if (busy.some(([b0, b1]) => start < b1 && end > b0)) continue;
    slots.push(new Date(start));
  }
  return slots;
}

export function formatTimeInZone(date, timeZone = DEFAULT_TZ) {
  return new Date(date)
    .toLocaleTimeString('en-AU', { timeZone, hour: 'numeric', minute: '2-digit' })
    .replace(':00', '')
    .replace(/\s*([ap])\.?m\.?/i, (_, x) => `${x.toLowerCase()}m`); // "7 am" / "7 a.m." -> "7am"
}

export function formatDayInZone(date, timeZone = DEFAULT_TZ) {
  return new Date(date).toLocaleDateString('en-AU', { timeZone, weekday: 'long', day: 'numeric', month: 'long' });
}
