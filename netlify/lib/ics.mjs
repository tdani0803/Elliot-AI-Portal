// Builds an iCalendar (.ics) feed of bookings for "subscribe" in Apple/Google/Outlook calendars.

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Lines longer than 75 bytes must be folded (continuation lines start with a space).
export function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + ch, 'utf8') > limit) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs({ businessName, bookings, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ElliotAI//Jobs//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`ElliotAI jobs – ${businessName}`)}`,
    'X-PUBLISHED-TTL:PT15M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
  ];
  for (const b of bookings) {
    const start = new Date(b.starts_at);
    const end = new Date(start.getTime() + (b.duration_minutes ?? 60) * 60000);
    const description = [
      b.phone && `Phone: ${b.phone}`,
      b.assigned_to && `Who: ${b.assigned_to}`,
      b.notes,
      b.source === 'elliot' ? 'Booked by Elliot' : null,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@elliotai`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText([b.status === 'done' ? '✓' : null, b.job, b.customer_name && `– ${b.customer_name}`].filter(Boolean).join(' '))}`,
      ...(b.address ? [`LOCATION:${escapeText(b.address)}`] : []),
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      `STATUS:${b.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
