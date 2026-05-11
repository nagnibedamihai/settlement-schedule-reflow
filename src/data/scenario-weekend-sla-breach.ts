/**
 * Scenario 7: Weekend Spill + SLA Breach
 *
 * A chain of tasks starts late Friday afternoon and cannot complete before the
 * weekend. The T+1 settlement date (Monday) is breached because the tasks spill
 * into Monday and consume most of the operating window.
 *
 * Channel: International Wire Desk (Mon-Fri 07:00–15:00 UTC — shorter window)
 *
 * Tasks (Trade order TRD-FRI-001, settlementDate = Monday Jan 15):
 *   complianceScreen (90min, Fri 13:00) → fundTransfer (120min) → disbursement (60min) → reconciliation (45min)
 *
 * Timeline:
 *   Fri: complianceScreen starts 13:00, 120 min available → 90 min done by 14:30
 *        fundTransfer starts 14:30, only 30 min before close → pauses at 15:00
 *   Sat/Sun: no operating hours
 *   Mon: fundTransfer resumes 07:00, 90 min remaining → completes 08:30
 *        disbursement 08:30–09:30
 *        reconciliation 09:30–10:15
 *
 * The trade's settlement date is Mon Jan 15 (end of day). Tasks finish at 10:15
 * so no SLA breach on the trade itself. BUT we'll set a second trade order with
 * a tighter Friday settlement date to show a breach.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getWeekendSlaBreachScenario(): ReflowInput {
  return {
    settlementChannels: [
      {
        docId: 'ch-intl',
        docType: 'settlementChannel',
        data: {
          name: 'International Wire Desk',
          operatingHours: [
            { dayOfWeek: 1, startHour: 7, endHour: 15 },
            { dayOfWeek: 2, startHour: 7, endHour: 15 },
            { dayOfWeek: 3, startHour: 7, endHour: 15 },
            { dayOfWeek: 4, startHour: 7, endHour: 15 },
            { dayOfWeek: 5, startHour: 7, endHour: 15 },
          ],
          blackoutWindows: [],
        },
      },
    ],
    settlementTasks: [
      // Trade 1 chain — spills over the weekend
      {
        docId: 'task-fri-comp',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-FRI-001',
          tradeOrderId: 'order-fri-1',
          settlementChannelId: 'ch-intl',
          startDate: '2024-01-12T13:00:00.000Z', // Friday 13:00
          endDate: '2024-01-12T14:30:00.000Z',
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'complianceScreen',
        },
      },
      {
        docId: 'task-fri-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-FRI-002',
          tradeOrderId: 'order-fri-1',
          settlementChannelId: 'ch-intl',
          startDate: '2024-01-12T14:30:00.000Z',
          endDate: '2024-01-12T16:30:00.000Z', // naive end — wrong
          durationMinutes: 120,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-fri-comp'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-fri-disburse',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-FRI-003',
          tradeOrderId: 'order-fri-1',
          settlementChannelId: 'ch-intl',
          startDate: '2024-01-12T16:30:00.000Z',
          endDate: '2024-01-12T17:30:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-fri-fund'],
          taskType: 'disbursement',
        },
      },
      {
        docId: 'task-fri-recon',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-FRI-004',
          tradeOrderId: 'order-fri-1',
          settlementChannelId: 'ch-intl',
          startDate: '2024-01-12T17:30:00.000Z',
          endDate: '2024-01-12T18:15:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-fri-disburse'],
          taskType: 'reconciliation',
        },
      },
      // Trade 2 — single task, also Friday, tight SLA
      {
        docId: 'task-fri-t2',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-FRI-005',
          tradeOrderId: 'order-fri-2',
          settlementChannelId: 'ch-intl',
          startDate: '2024-01-12T13:30:00.000Z',
          endDate: '2024-01-12T14:30:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-fri-1',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240112-090',
          instrumentId: 'BRK.B',
          quantity: 50,
          settlementDate: '2024-01-15T00:00:00.000Z', // T+1 = Monday
        },
      },
      {
        docId: 'order-fri-2',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240112-091',
          instrumentId: 'V',
          quantity: 800,
          // Tight SLA: must settle by end of Friday — will breach!
          settlementDate: '2024-01-12T00:00:00.000Z',
        },
      },
    ],
  };
}
