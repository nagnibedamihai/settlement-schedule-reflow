/**
 * Scenario 1: Delay Cascade
 *
 * A counterparty's fund transfer is delayed by 2 hours, cascading through
 * the entire dependency chain: marginCheck → fundTransfer → disbursement → reconciliation.
 * All tasks on the same channel ("Domestic Wire Desk"), Mon-Fri 08:00-16:00 UTC.
 *
 * The fundTransfer was originally at 09:00 but now starts at 11:00 (simulating late arrival).
 * Expected: all downstream tasks shift forward by at least 2 hours.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getDelayCascadeScenario(): ReflowInput {
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
        docId: 'task-margin',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-20240115-001',
          tradeOrderId: 'order-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:00:00.000Z', // Monday 08:00
          endDate: '2024-01-15T08:30:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
      {
        docId: 'task-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-20240115-002',
          tradeOrderId: 'order-1',
          settlementChannelId: 'ch-domestic',
          // Originally 09:00 but delayed to 11:00 (counterparty late)
          startDate: '2024-01-15T11:00:00.000Z',
          endDate: '2024-01-15T12:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-margin'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-disburse',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-20240115-003',
          tradeOrderId: 'order-1',
          settlementChannelId: 'ch-domestic',
          // Originally at 10:00 but must wait for fund transfer
          startDate: '2024-01-15T10:00:00.000Z',
          endDate: '2024-01-15T10:45:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-fund'],
          taskType: 'disbursement',
        },
      },
      {
        docId: 'task-recon',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-20240115-004',
          tradeOrderId: 'order-1',
          settlementChannelId: 'ch-domestic',
          // Originally at 10:45
          startDate: '2024-01-15T10:45:00.000Z',
          endDate: '2024-01-15T11:15:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-disburse'],
          taskType: 'reconciliation',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-1',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-042',
          instrumentId: 'AAPL',
          quantity: 1000,
          settlementDate: '2024-01-16T00:00:00.000Z', // T+1
        },
      },
    ],
  };
}
