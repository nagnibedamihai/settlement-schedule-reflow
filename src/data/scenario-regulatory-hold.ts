/**
 * Scenario 6: Regulatory Hold + Channel Contention
 *
 * A regulatory hold (AML compliance freeze) occupies the Domestic Wire Desk from
 * 09:00–11:00 on Monday. Two other trade orders have tasks competing for the same
 * channel around that window.
 *
 * Channel: Domestic Wire Desk (Mon-Fri 08:00–16:00 UTC)
 *
 * Tasks:
 *   Trade 1: marginCheck (45min, 08:00) → fundTransfer (60min, 08:45)
 *   Regulatory Hold: AML freeze (120min, 09:00–11:00, IMMOVABLE)
 *   Trade 2: complianceScreen (30min, 09:30) → disbursement (45min, 10:00)
 *
 * Expected:
 *   - marginCheck runs at 08:00–08:45 (fits before the hold)
 *   - Regulatory hold stays pinned at 09:00–11:00
 *   - fundTransfer is pushed past the hold → 11:00
 *   - complianceScreen is pushed past the hold → 12:00 (after fundTransfer)
 *   - disbursement follows complianceScreen
 *
 * Demonstrates: immovable tasks forcing others to reschedule around them.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getRegulatoryHoldScenario(): ReflowInput {
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
        docId: 'task-t1-margin',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-RH-001',
          tradeOrderId: 'order-rh-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:00:00.000Z',
          endDate: '2024-01-15T08:45:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
      {
        docId: 'task-aml-hold',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-RH-HOLD',
          tradeOrderId: 'order-rh-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T09:00:00.000Z',
          endDate: '2024-01-15T11:00:00.000Z',
          durationMinutes: 120,
          isRegulatoryHold: true,
          dependsOnTaskIds: [],
          taskType: 'regulatoryHold',
        },
      },
      {
        docId: 'task-t1-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-RH-002',
          tradeOrderId: 'order-rh-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:45:00.000Z',
          endDate: '2024-01-15T09:45:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t1-margin'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-t2-compliance',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-RH-003',
          tradeOrderId: 'order-rh-2',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T09:30:00.000Z',
          endDate: '2024-01-15T10:00:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'complianceScreen',
        },
      },
      {
        docId: 'task-t2-disburse',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-RH-004',
          tradeOrderId: 'order-rh-2',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T10:00:00.000Z',
          endDate: '2024-01-15T10:45:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t2-compliance'],
          taskType: 'disbursement',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-rh-1',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-080',
          instrumentId: 'JPM',
          quantity: 500,
          settlementDate: '2024-01-16T00:00:00.000Z',
        },
      },
      {
        docId: 'order-rh-2',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-081',
          instrumentId: 'GS',
          quantity: 300,
          settlementDate: '2024-01-16T00:00:00.000Z',
        },
      },
    ],
  };
}
