/**
 * Scenario 4: Impossible Schedule (Circular Dependency)
 *
 * Task A depends on Task B, and Task B depends on Task A.
 * The algorithm should throw a descriptive error with the cycle path.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getImpossibleScenario(): ReflowInput {
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
    ],
    settlementTasks: [
      {
        docId: 'task-X',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-CYCLE-001',
          tradeOrderId: 'order-cycle',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:00:00.000Z',
          endDate: '2024-01-15T09:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-Y'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-Y',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-CYCLE-002',
          tradeOrderId: 'order-cycle',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T09:00:00.000Z',
          endDate: '2024-01-15T10:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-X'],
          taskType: 'disbursement',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-cycle',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-CYCLE-001',
          instrumentId: 'NFLX',
          quantity: 50,
          settlementDate: '2024-01-16T00:00:00.000Z',
        },
      },
    ],
  };
}
