// Timezone-aware date primitives used by the streak system (services/streak.ts)
// and anywhere else that needs "what calendar day is it for this user" 
// never derive that from server-local time or device time, only from here.
//
// No tz library dependency: Node ships with full ICU, so Intl.DateTimeFormat
// already knows every IANA zone  these are just the handful of primitives
// that library would otherwise give us (local calendar date, local hour, and
// converting a target local wall-clock time back to a UTC instant).

// The user's local calendar date (YYYY-MM-DD) at `date`, in `timezone`.
// "en-CA" is the one built-in locale that formats as YYYY-MM-DD directly.
export function localDateStr(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// The user's local hour (0-23) at `date`, in `timezone`.
export function localHour(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(date);
  return parseInt(formatted, 10);
}

// Pure calendar-date arithmetic on a "YYYY-MM-DD" string  not a real
// timezone conversion, just adding/subtracting whole days off the label
// itself (anchored to UTC purely so setUTCDate never falls into a local-TZ
// DST edge case on the machine running this code).
export function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// The timezone's offset from UTC (in minutes, positive = ahead of UTC) at
// the given instant  used by zonedTimeToUtc's iterative solve below.
function offsetMinutesAt(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Converts a local wall-clock time ("YYYY-MM-DD" + hour:minute, in
// `timezone`) to the UTC instant it represents. Two iterations of
// offset-guessing is the standard Intl-only technique for this and is
// accurate through DST transitions  good enough here since the result is
// only ever used to schedule a client-side "check the streak again" timer,
// never as the authoritative streak calculation itself (that's always
// recomputed fresh from the real current time on the next request).
export function zonedTimeToUtc(dateStr: string, hour: number, minute: number, timezone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  let guessMs = Date.UTC(y, m - 1, d, hour, minute, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = offsetMinutesAt(new Date(guessMs), timezone);
    guessMs = Date.UTC(y, m - 1, d, hour, minute, 0) - offset * 60000;
  }
  return new Date(guessMs);
}

// The next occurrence of 1:00 AM local time (in `timezone`) strictly after
// `now`  the streak system's daily reset boundary.
export function nextBoundaryUtc(now: Date, timezone: string): Date {
  const today = localDateStr(now, timezone);
  const targetDateStr = localHour(now, timezone) < 1 ? today : addDaysToDateStr(today, 1);
  return zonedTimeToUtc(targetDateStr, 1, 0, timezone);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
