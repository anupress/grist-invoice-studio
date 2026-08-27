// Converting between Grist's stored date values and the strings this app works with.
//
// Grist stores both Date and DateTime columns as epoch SECONDS, but they mean different things:
//
//   Date                      the instant of UTC midnight on that day. The time carries no
//                             information — the value IS the day.
//   DateTime:America/New_York a real instant. Which calendar day it falls on depends on the zone,
//                             and Grist puts that zone in the column's type string.
//
// Everything here used to go through `new Date(ms).toISOString().slice(0,10)`, i.e. always UTC.
// That is right for Date and wrong for DateTime: an appointment at 23:30 in New York reported as
// the next day, one at 08:00 in Tokyo as the previous one. Since the zone is sitting in the type
// string, no lookup is needed to do this properly.

// 'DateTime:Asia/Tokyo' -> 'Asia/Tokyo'   |   'Date' -> null   |   'Text' -> undefined
// The three results are distinct on purpose: null means "a date, but a zoneless one", while
// undefined means "not a date column at all", and callers act differently on each.
export function zoneOfType(type) {
  const t = String(type || '');
  const dt = /^DateTime(?::(.+))?$/i.exec(t);
  if (dt) return dt[1] || 'UTC';
  return /^Date$/i.test(t) ? null : undefined;
}

export function isDateColumn(type) { return zoneOfType(type) !== undefined; }

// Intl.DateTimeFormat construction is not cheap and this runs per cell, so formatters are reused.
const _fmt = new Map();
function formatter(zone) {
  if (_fmt.has(zone)) return _fmt.get(zone);
  let f = null;
  try {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch { f = null; } // an unrecognised zone falls back to UTC rather than throwing mid-render
  _fmt.set(zone, f);
  return f;
}

function partsIn(ms, zone) {
  const f = formatter(zone);
  if (!f) return null;
  const p = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  return p.year ? p : null;
}

/**
 * A stored Grist value -> 'YYYY-MM-DD' for the day it actually falls on.
 *
 * Deliberately date-only, including for DateTime. Adding the time would change what every
 * downstream consumer sees, and grouping a chart by a DateTime column would then bucket by the
 * minute rather than by the day — thousands of categories where there used to be a handful.
 * Showing times is a feature that needs date-bucketing in the chart layer first; this is the
 * bug fix, which is that the DAY was wrong.
 */
export function toDayString(value, zone) {
  if (value == null || value === '') return null;
  const ms = typeof value === 'number' ? value * 1000 : Date.parse(value);
  if (!isFinite(ms)) return value; // already a string we don't recognise — pass it through untouched
  if (!zone) return new Date(ms).toISOString().slice(0, 10); // Date column: UTC midnight by definition
  const p = partsIn(ms, zone);
  return p ? `${p.year}-${p.month}-${p.day}` : new Date(ms).toISOString().slice(0, 10);
}

// How far the given zone sits from UTC at that instant, in ms. Derived by formatting the instant
// in the zone and reading the wall clock back as if it were UTC — the difference is the offset,
// DST included, with no table of rules to maintain.
function offsetMsAt(ms, zone) {
  const p = partsIn(ms, zone);
  if (!p) return 0;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - ms;
}

/**
 * The inverse: a calendar day -> the epoch SECONDS Grist should store for it.
 *
 * For a Date column that is simply UTC midnight. The old code built `new Date(y, m, d)`, which is
 * LOCAL midnight, so everyone at a positive UTC offset stored an instant that read back as the
 * previous day — dropping an event on the 15th filed it under the 14th across Europe, Asia,
 * Africa east of Greenwich, Australia and New Zealand.
 *
 * For a DateTime column it is the instant of local midnight in that column's own zone, which needs
 * the offset — and the offset depends on the instant, so it is applied and then re-checked. The
 * second pass matters only near a DST transition, where the first guess can land on the wrong side
 * of the jump.
 */
export function dayToEpochSeconds(year, monthIndex, day, zone) {
  const utcMidnight = Date.UTC(year, monthIndex, day);
  if (!zone) return Math.floor(utcMidnight / 1000);
  let ms = utcMidnight - offsetMsAt(utcMidnight, zone);
  ms = utcMidnight - offsetMsAt(ms, zone);
  return Math.floor(ms / 1000);
}
