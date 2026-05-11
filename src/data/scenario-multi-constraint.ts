/**
 * Scenario 3: Multi-Constraint
 *
 * Two channels, cross-channel dependencies, channel conflict, and a blackout — all combined.
 *
 * Channel 1: Domestic Wire Desk (Mon-Fri 08:00-16:00 UTC)
 * Channel 2: FX Settlement (Mon-Fri 06:00-14:00 UTC), blackout Tue 10:00-12:00
 *
 * Tasks:
 *   A (marginCheck, 60min, Ch1) → B (fundTransfer, 120min, Ch2) → C (disbursement, 45min, Ch1)
 *   D (complianceScreen, 90min, Ch1) — no deps, original slot overlaps with A
 *
 * Expected:
 *   - A runs at 08:00 on Ch1
 *   - D is pushed after A on Ch1 (conflict resolution) → starts 09:00
 *   - B starts after A completes, on Ch2 — may hit blackout
 *   - C starts after B completes, back on Ch1 — must not conflict with D
 */

import type { ReflowInput } from '../reflow/types.js';

export function getMultiConstraintScenario(): ReflowInput {
  return {
    settlementChannels: [
      {
        docId: 'ch-domestic',
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
      },
      {
        docId: 'ch-fx',
        docType: 'settlementChannel',
        data: {
          name: 'FX Settlement',
          operatingHours: [
            { dayOfWeek: 1, startHour: 6, endHour: 14 },
            { dayOfWeek: 2, startHour: 6, endHour: 14 },
            { dayOfWeek: 3, startHour: 6, endHour: 14 },
            { dayOfWeek: 4, startHour: 6, endHour: 14 },
            { dayOfWeek: 5, startHour: 6, endHour: 14 },
          ],
          blackoutWindows: [
            {
              startDate: '2024-01-16T10:00:00.000Z', // Tuesday 10:00
              endDate: '2024-01-16T12:00:00.000Z',   // Tuesday 12:00
              reason: 'FX system upgrade',
            },
          ],
        },
      },
    ],
    settlementTasks: [
      {
        docId: 'task-A',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-MC-001',
          tradeOrderId: 'order-mc-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:00:00.000Z', // Monday 08:00
          endDate: '2024-01-15T09:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
      {
        docId: 'task-D',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-MC-004',
          tradeOrderId: 'order-mc-2',
          settlementChannelId: 'ch-domestic',
          // Overlaps with A's original slot
          startDate: '2024-01-15T08:00:00.000Z',
          endDate: '2024-01-15T09:30:00.000Z',
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'complianceScreen',
        },
      },
      {
        docId: 'task-B',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-MC-002',
          tradeOrderId: 'order-mc-1',
          settlementChannelId: 'ch-fx',
          startDate: '2024-01-15T09:00:00.000Z',
          endDate: '2024-01-15T11:00:00.000Z',
          durationMinutes: 120,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-A'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-C',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-MC-003',
          tradeOrderId: 'order-mc-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T11:00:00.000Z',
          endDate: '2024-01-15T11:45:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-B'],
          taskType: 'disbursement',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-mc-1',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-070',
          instrumentId: 'TSLA',
          quantity: 200,
          settlementDate: '2024-01-17T00:00:00.000Z',
        },
      },
      {
        docId: 'order-mc-2',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-071',
          instrumentId: 'GOOG',
          quantity: 100,
          settlementDate: '2024-01-17T00:00:00.000Z',
        },
      },
    ],
  };
}
