/**
 * Scenario 2: Market Hours + Blackout
 *
 * A 90-min complianceScreen task starts at 15:00 Monday on Domestic Wire Desk
 * (operating hours Mon-Fri 08:00-16:00 UTC). It can only process 60 min before
 * the market closes at 16:00. The next morning (Tuesday) there is a Fedwire
 * maintenance blackout from 08:00 to 12:00.
 *
 * Expected: processes 60 min Monday (15:00-16:00), pauses overnight, skips
 * blackout, resumes Tuesday 12:00, completes Tuesday 12:30.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getBlackoutScenario(): ReflowInput {
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
          blackoutWindows: [
            {
              startDate: '2024-01-16T08:00:00.000Z', // Tuesday 08:00
              endDate: '2024-01-16T12:00:00.000Z',   // Tuesday 12:00
              reason: 'Fed settlement system maintenance',
            },
          ],
        },
      },
    ],
    settlementTasks: [
      {
        docId: 'task-compliance',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-20240115-010',
          tradeOrderId: 'order-2',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T15:00:00.000Z', // Monday 15:00
          endDate: '2024-01-15T16:30:00.000Z',   // "naive" end — wrong
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'complianceScreen',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-2',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-055',
          instrumentId: 'MSFT',
          quantity: 500,
          settlementDate: '2024-01-17T00:00:00.000Z', // T+2
        },
      },
    ],
  };
}
