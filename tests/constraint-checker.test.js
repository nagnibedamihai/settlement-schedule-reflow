import { describe, it, expect } from 'vitest';
import { checkChannelOverlaps, checkDependencies, checkBlackoutWindows, checkRegulatoryHolds, validateSchedule, } from '../src/reflow/constraint-checker.js';
function makeTask(overrides) {
    const { docId, ...dataOverrides } = overrides;
    return {
        docId: docId ?? 'task-1',
        docType: 'settlementTask',
        data: {
            taskReference: 'STL-001',
            tradeOrderId: 'order-1',
            settlementChannelId: 'ch-1',
            startDate: '2024-01-15T08:00:00.000Z',
            endDate: '2024-01-15T09:00:00.000Z',
            durationMinutes: 60,
            isRegulatoryHold: false,
            dependsOnTaskIds: [],
            taskType: 'fundTransfer',
            ...dataOverrides,
        },
    };
}
function makeChannel() {
    return {
        docId: 'ch-1',
        docType: 'settlementChannel',
        data: {
            name: 'Domestic Wire Desk',
            operatingHours: [
                { dayOfWeek: 1, startHour: 8, endHour: 16 },
                { dayOfWeek: 2, startHour: 8, endHour: 16 },
                { dayOfWeek: 3, startHour: 8, endHour: 16 },
                { dayOfWeek: 4, startHour: 8, endHour: 16 },
                { dayOfWeek: 5, startHour: 8, endHour: 16 },
            ],
            blackoutWindows: [],
        },
    };
}
describe('constraint-checker', () => {
    describe('checkChannelOverlaps', () => {
        it('detects overlap between two tasks on the same channel', () => {
            const tasks = [
                makeTask({ docId: 'a', taskReference: 'A', startDate: '2024-01-15T08:00:00.000Z', endDate: '2024-01-15T10:00:00.000Z' }),
                makeTask({ docId: 'b', taskReference: 'B', startDate: '2024-01-15T09:00:00.000Z', endDate: '2024-01-15T11:00:00.000Z' }),
            ];
            const violations = checkChannelOverlaps(tasks);
            expect(violations).toHaveLength(1);
            expect(violations[0].type).toBe('CHANNEL_OVERLAP');
        });
        it('no violation for non-overlapping tasks', () => {
            const tasks = [
                makeTask({ docId: 'a', startDate: '2024-01-15T08:00:00.000Z', endDate: '2024-01-15T09:00:00.000Z' }),
                makeTask({ docId: 'b', startDate: '2024-01-15T09:00:00.000Z', endDate: '2024-01-15T10:00:00.000Z' }),
            ];
            expect(checkChannelOverlaps(tasks)).toHaveLength(0);
        });
    });
    describe('checkDependencies', () => {
        it('detects dependency violation', () => {
            const tasks = [
                makeTask({ docId: 'a', taskReference: 'A', startDate: '2024-01-15T08:00:00.000Z', endDate: '2024-01-15T10:00:00.000Z' }),
                makeTask({
                    docId: 'b', taskReference: 'B',
                    startDate: '2024-01-15T09:00:00.000Z', endDate: '2024-01-15T11:00:00.000Z',
                    dependsOnTaskIds: ['a'],
                }),
            ];
            const violations = checkDependencies(tasks);
            expect(violations).toHaveLength(1);
            expect(violations[0].type).toBe('DEPENDENCY_VIOLATED');
        });
        it('no violation when dependency satisfied', () => {
            const tasks = [
                makeTask({ docId: 'a', endDate: '2024-01-15T09:00:00.000Z' }),
                makeTask({ docId: 'b', startDate: '2024-01-15T09:00:00.000Z', dependsOnTaskIds: ['a'] }),
            ];
            expect(checkDependencies(tasks)).toHaveLength(0);
        });
    });
    describe('checkBlackoutWindows', () => {
        it('detects task starting during blackout', () => {
            const channel = makeChannel();
            channel.data.blackoutWindows = [
                { startDate: '2024-01-15T08:00:00.000Z', endDate: '2024-01-15T12:00:00.000Z', reason: 'maintenance' },
            ];
            const tasks = [
                makeTask({ startDate: '2024-01-15T10:00:00.000Z', endDate: '2024-01-15T11:00:00.000Z' }),
            ];
            const violations = checkBlackoutWindows(tasks, new Map([['ch-1', channel]]));
            expect(violations).toHaveLength(1);
            expect(violations[0].type).toBe('BLACKOUT_VIOLATED');
        });
    });
    describe('checkRegulatoryHolds', () => {
        it('detects moved regulatory hold', () => {
            const original = [makeTask({ isRegulatoryHold: true, startDate: '2024-01-15T08:00:00.000Z' })];
            const updated = [makeTask({ isRegulatoryHold: true, startDate: '2024-01-15T10:00:00.000Z' })];
            const violations = checkRegulatoryHolds(original, updated);
            expect(violations).toHaveLength(1);
            expect(violations[0].type).toBe('REGULATORY_HOLD_MOVED');
        });
        it('no violation when hold unchanged', () => {
            const task = makeTask({ isRegulatoryHold: true });
            expect(checkRegulatoryHolds([task], [task])).toHaveLength(0);
        });
    });
    describe('validateSchedule', () => {
        it('returns empty for valid schedule', () => {
            const tasks = [
                makeTask({ docId: 'a', startDate: '2024-01-15T08:00:00.000Z', endDate: '2024-01-15T09:00:00.000Z' }),
                makeTask({ docId: 'b', startDate: '2024-01-15T09:00:00.000Z', endDate: '2024-01-15T10:00:00.000Z', dependsOnTaskIds: ['a'] }),
            ];
            const violations = validateSchedule(tasks, [makeChannel()]);
            expect(violations).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=constraint-checker.test.js.map