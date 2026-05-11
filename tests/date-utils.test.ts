import { describe, it, expect } from 'vitest';
import { calculateEndDate, diffMinutes, advanceToNextValidTime } from '../src/utils/date-utils.js';
import { DateTime } from 'luxon';
import type { OperatingHours, BlackoutWindow } from '../src/reflow/types.js';

const weekdayHours: OperatingHours[] = [
  { dayOfWeek: 1, startHour: 8, endHour: 16 },
  { dayOfWeek: 2, startHour: 8, endHour: 16 },
  { dayOfWeek: 3, startHour: 8, endHour: 16 },
  { dayOfWeek: 4, startHour: 8, endHour: 16 },
  { dayOfWeek: 5, startHour: 8, endHour: 16 },
];

describe('date-utils', () => {
  describe('calculateEndDate', () => {
    it('spans overnight correctly', () => {
      // 120 min starting at 15:00 Mon, channel closes at 16:00
      const result = calculateEndDate('2024-01-15T15:00:00.000Z', 120, weekdayHours, []);
      expect(result.startDate).toBe('2024-01-15T15:00:00.000Z');
      // 60 min Monday (15:00-16:00), 60 min Tuesday (08:00-09:00)
      expect(result.endDate).toBe('2024-01-16T09:00:00.000Z');
    });

    it('skips weekends', () => {
      // Friday 15:00, 120 min task
      const result = calculateEndDate('2024-01-19T15:00:00.000Z', 120, weekdayHours, []);
      // 60 min Friday, skip Sat/Sun, 60 min Monday
      expect(result.endDate).toBe('2024-01-22T09:00:00.000Z');
    });

    it('skips blackout window', () => {
      const blackouts: BlackoutWindow[] = [
        { startDate: '2024-01-16T08:00:00.000Z', endDate: '2024-01-16T12:00:00.000Z', reason: 'maintenance' },
      ];
      // 120 min starting at 15:00 Mon
      const result = calculateEndDate('2024-01-15T15:00:00.000Z', 120, weekdayHours, blackouts);
      // 60 min Monday (15:00-16:00), Tue 08-12 blackout, 60 min Tue (12:00-13:00)
      expect(result.endDate).toBe('2024-01-16T13:00:00.000Z');
    });

    it('includes prep time in duration', () => {
      const result = calculateEndDate('2024-01-15T15:00:00.000Z', 60, weekdayHours, [], 30);
      // 90 min total: 60 min Mon, 30 min Tue
      expect(result.endDate).toBe('2024-01-16T08:30:00.000Z');
    });
  });

  describe('advanceToNextValidTime', () => {
    it('jumps past blackout', () => {
      const blackouts: BlackoutWindow[] = [
        { startDate: '2024-01-15T10:00:00.000Z', endDate: '2024-01-15T12:00:00.000Z' },
      ];
      const dt = DateTime.fromISO('2024-01-15T10:30:00.000Z', { zone: 'UTC' });
      const result = advanceToNextValidTime(dt, weekdayHours, blackouts);
      expect(result.toISO()).toBe('2024-01-15T12:00:00.000Z');
    });

    it('advances to next day if past operating hours', () => {
      const dt = DateTime.fromISO('2024-01-15T17:00:00.000Z', { zone: 'UTC' });
      const result = advanceToNextValidTime(dt, weekdayHours, []);
      expect(result.toISO()).toBe('2024-01-16T08:00:00.000Z');
    });
  });

  describe('diffMinutes', () => {
    it('returns positive for later date', () => {
      expect(diffMinutes('2024-01-15T08:00:00.000Z', '2024-01-15T10:00:00.000Z')).toBe(120);
    });

    it('returns negative for earlier date', () => {
      expect(diffMinutes('2024-01-15T10:00:00.000Z', '2024-01-15T08:00:00.000Z')).toBe(-120);
    });
  });
});
