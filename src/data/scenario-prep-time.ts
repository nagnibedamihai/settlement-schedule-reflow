/**
 * Scenario 5: Prep Time Handling
 *
 * A fundTransfer task with 30min prepTimeMinutes and 60min durationMinutes
 * starts at 15:00 on Domestic Wire Desk (closes at 16:00).
 *
 * Total work = 90 min. Only 60 min available Monday (15:00-16:00).
 * Expected: processes 60 min Monday, resumes Tuesday 08:00, completes 08:30.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getPrepTimeScenario(): ReflowInput {
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
        docId: 'task-prep',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-PREP-001',
          tradeOrderId: 'order-prep',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T15:00:00.000Z', // Monday 15:00
          endDate: '2024-01-15T16:30:00.000Z',   // naive end
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'fundTransfer',
          prepTimeMinutes: 30,
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-prep',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-PREP-001',
          instrumentId: 'AMZN',
          quantity: 300,
          settlementDate: '2024-01-17T00:00:00.000Z',
        },
      },
    ],
  };
}
