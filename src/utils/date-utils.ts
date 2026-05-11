import { DateTime } from 'luxon';
import type { OperatingHours, BlackoutWindow } from '../reflow/types.js';

// Luxon uses 1=Mon...7=Sun, spec uses 0=Sun, 1=Mon...6=Sat
function luxonToSpecDay(luxonDay: number): number {
  return luxonDay === 7 ? 0 : luxonDay;
}

function getOpHoursForDay(
  dt: DateTime,
  operatingHours: OperatingHours[]
): OperatingHours | null {
  const specDay = luxonToSpecDay(dt.weekday);
  return operatingHours.find((oh) => oh.dayOfWeek === specDay) ?? null;
}

export function isWithinOperatingHours(
  dt: DateTime,
  operatingHours: OperatingHours[]
): boolean {
  const oh = getOpHoursForDay(dt, operatingHours);
  if (!oh) return false;
  const minuteOfDay = dt.hour * 60 + dt.minute;
  return minuteOfDay >= oh.startHour * 60 && minuteOfDay < oh.endHour * 60;
}

export function isWithinBlackout(
  dt: DateTime,
  blackoutWindows: BlackoutWindow[]
): boolean {
  return blackoutWindows.some((bw) => {
    const start = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
    const end = DateTime.fromISO(bw.endDate, { zone: 'UTC' });
    return dt >= start && dt < end;
  });
}

export function isUsableTime(
  dt: DateTime,
  operatingHours: OperatingHours[],
  blackoutWindows: BlackoutWindow[]
): boolean {
  return isWithinOperatingHours(dt, operatingHours) && !isWithinBlackout(dt, blackoutWindows);
}

/**
 * Returns the end of the current usable window (capped by any blackout that
 * starts before the operating window closes).
 */
export function getWindowEnd(
  dt: DateTime,
  operatingHours: OperatingHours[],
  blackoutWindows: BlackoutWindow[]
): DateTime {
  const oh = getOpHoursForDay(dt, operatingHours);
  if (!oh) throw new Error(`No operating window for ${dt.toISO()}`);

  let windowEnd = dt.startOf('day').set({ hour: oh.endHour, minute: 0, second: 0, millisecond: 0 });

  // Truncate if a blackout starts before the window closes
  for (const bw of blackoutWindows) {
    const bwStart = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
    if (bwStart > dt && bwStart < windowEnd) {
      windowEnd = bwStart;
    }
  }

  return windowEnd;
}

/**
 * Advance dt forward to the next usable instant (within operating hours, outside blackouts).
 * Uses window-jumping instead of minute-by-minute iteration.
 *
 * @upgrade: make maxDays configurable per-channel or per-call-site. Include
 * encountered blackout/window details in the error when the search exhausts.
 */
export function advanceToNextValidTime(
  dt: DateTime,
  operatingHours: OperatingHours[],
  blackoutWindows: BlackoutWindow[],
  maxDays = 14
): DateTime {
  let current = dt;
  const deadline = dt.plus({ days: maxDays });

  while (current < deadline) {
    if (isUsableTime(current, operatingHours, blackoutWindows)) return current;

    // Inside a blackout? Jump past it
    const activeBlackout = blackoutWindows.find((bw) => {
      const s = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
      const e = DateTime.fromISO(bw.endDate, { zone: 'UTC' });
      return current >= s && current < e;
    });
    if (activeBlackout) {
      current = DateTime.fromISO(activeBlackout.endDate, { zone: 'UTC' });
      continue;
    }

    // Outside operating hours — try today's window start first
    const oh = getOpHoursForDay(current, operatingHours);
    if (oh) {
      const windowStartToday = current.startOf('day').set({ hour: oh.startHour, minute: 0, second: 0, millisecond: 0 });
      if (current < windowStartToday) {
        current = windowStartToday;
        continue;
      }
    }

    // No window today or past it — advance to next day
    current = current.startOf('day').plus({ days: 1 });
  }

  throw new Error(`No valid operating window found within ${maxDays} days from ${dt.toISO()}`);
}

/**
 * Given a start date and required processing minutes, calculate the real
 * wall-clock end date — pausing outside operating hours and blackout windows.
 */
export function calculateEndDate(
  startDate: string,
  durationMinutes: number,
  operatingHours: OperatingHours[],
  blackoutWindows: BlackoutWindow[],
  prepTimeMinutes = 0
): { startDate: string; endDate: string } {
  const totalMinutes = durationMinutes + prepTimeMinutes;

  let current = advanceToNextValidTime(
    DateTime.fromISO(startDate, { zone: 'UTC' }),
    operatingHours,
    blackoutWindows
  );

  const actualStart = current.toISO()!;
  let remaining = totalMinutes;

  while (remaining > 0) {
    const windowEnd = getWindowEnd(current, operatingHours, blackoutWindows);
    const available = windowEnd.diff(current, 'minutes').minutes;

    if (available >= remaining) {
      current = current.plus({ minutes: remaining });
      remaining = 0;
    } else {
      remaining -= available;
      current = advanceToNextValidTime(windowEnd, operatingHours, blackoutWindows);
    }
  }

  return { startDate: actualStart, endDate: current.toISO()! };
}

export function diffMinutes(a: string, b: string): number {
  return DateTime.fromISO(b, { zone: 'UTC' }).diff(DateTime.fromISO(a, { zone: 'UTC' }), 'minutes').minutes;
}

export function laterOf(a: string, b: string): string {
  return DateTime.fromISO(a, { zone: 'UTC' }) >= DateTime.fromISO(b, { zone: 'UTC' }) ? a : b;
}