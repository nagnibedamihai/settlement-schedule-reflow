/**
 * Scenario 8: High-Volume Multi-Trade Day
 *
 * A busy Monday morning with 3 trade orders across 3 channels, 10 total tasks,
 * diamond dependencies, and overlapping blackout windows. This is the "production
 * realism" scenario showing the algorithm handling real-world volume.
 *
 * Channels:
 *   - Domestic Wire Desk   (Mon-Fri 08:00–16:00 UTC)
 *   - FX Settlement         (Mon-Fri 06:00–14:00 UTC), blackout Mon 10:00–10:30
 *   - Treasury Operations   (Mon-Fri 09:00–17:00 UTC)
 *
 * Trade 1 (AAPL, T+2): marginCheck(Ch1) → fundTransfer(Ch2) → disbursement(Ch1) → reconciliation(Ch3)
 * Trade 2 (NVDA, T+1): complianceScreen(Ch3) → fundTransfer(Ch1) → disbursement(Ch3)
 * Trade 3 (MSFT, T+2): marginCheck(Ch2) → fundTransfer(Ch2) → reconciliation(Ch1)
 *
 * Note: Trade 3's two tasks on Ch2 create a same-channel chain + conflict with Trade 1's FX task.
 * Trade 2's tight T+1 deadline will trigger SLA breach warnings.
 */

import type { ReflowInput } from '../reflow/types.js';

export function getBusyDayScenario(): ReflowInput {
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
              startDate: '2024-01-15T10:00:00.000Z',
              endDate: '2024-01-15T10:30:00.000Z',
              reason: 'CLS settlement cycle maintenance',
            },
          ],
        },
      },
      {
        docId: 'ch-treasury',
        docType: 'settlementChannel',
        data: {
          name: 'Treasury Operations',
          operatingHours: [
            { dayOfWeek: 1, startHour: 9, endHour: 17 },
            { dayOfWeek: 2, startHour: 9, endHour: 17 },
            { dayOfWeek: 3, startHour: 9, endHour: 17 },
            { dayOfWeek: 4, startHour: 9, endHour: 17 },
            { dayOfWeek: 5, startHour: 9, endHour: 17 },
          ],
          blackoutWindows: [],
        },
      },
    ],
    settlementTasks: [
      // ── Trade 1 (AAPL): Ch1 → Ch2 → Ch1 → Ch3 ──
      {
        docId: 'task-t1-margin',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-001',
          tradeOrderId: 'order-bd-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:00:00.000Z',
          endDate: '2024-01-15T08:30:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
      {
        docId: 'task-t1-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-002',
          tradeOrderId: 'order-bd-1',
          settlementChannelId: 'ch-fx',
          startDate: '2024-01-15T08:30:00.000Z',
          endDate: '2024-01-15T10:00:00.000Z',
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t1-margin'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-t1-disburse',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-003',
          tradeOrderId: 'order-bd-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T10:00:00.000Z',
          endDate: '2024-01-15T10:45:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t1-fund'],
          taskType: 'disbursement',
        },
      },
      {
        docId: 'task-t1-recon',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-004',
          tradeOrderId: 'order-bd-1',
          settlementChannelId: 'ch-treasury',
          startDate: '2024-01-15T10:45:00.000Z',
          endDate: '2024-01-15T11:15:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t1-disburse'],
          taskType: 'reconciliation',
        },
      },
      // ── Trade 2 (NVDA): Ch3 → Ch1 → Ch3 ──
      {
        docId: 'task-t2-compliance',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-005',
          tradeOrderId: 'order-bd-2',
          settlementChannelId: 'ch-treasury',
          startDate: '2024-01-15T09:00:00.000Z',
          endDate: '2024-01-15T10:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'complianceScreen',
        },
      },
      {
        docId: 'task-t2-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-006',
          tradeOrderId: 'order-bd-2',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T10:00:00.000Z',
          endDate: '2024-01-15T11:30:00.000Z',
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t2-compliance'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-t2-disburse',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-007',
          tradeOrderId: 'order-bd-2',
          settlementChannelId: 'ch-treasury',
          startDate: '2024-01-15T11:30:00.000Z',
          endDate: '2024-01-15T12:15:00.000Z',
          durationMinutes: 45,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t2-fund'],
          taskType: 'disbursement',
        },
      },
      // ── Trade 3 (MSFT): Ch2 → Ch2 → Ch1 (same-channel chain on FX) ──
      {
        docId: 'task-t3-margin',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-008',
          tradeOrderId: 'order-bd-3',
          settlementChannelId: 'ch-fx',
          startDate: '2024-01-15T06:00:00.000Z',
          endDate: '2024-01-15T07:00:00.000Z',
          durationMinutes: 60,
          isRegulatoryHold: false,
          dependsOnTaskIds: [],
          taskType: 'marginCheck',
        },
      },
      {
        docId: 'task-t3-fund',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-009',
          tradeOrderId: 'order-bd-3',
          settlementChannelId: 'ch-fx',
          startDate: '2024-01-15T07:00:00.000Z',
          endDate: '2024-01-15T08:30:00.000Z',
          durationMinutes: 90,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t3-margin'],
          taskType: 'fundTransfer',
        },
      },
      {
        docId: 'task-t3-recon',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-BD-010',
          tradeOrderId: 'order-bd-3',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T08:30:00.000Z',
          endDate: '2024-01-15T09:00:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: false,
          dependsOnTaskIds: ['task-t3-fund'],
          taskType: 'reconciliation',
        },
      },
    ],
    tradeOrders: [
      {
        docId: 'order-bd-1',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-100',
          instrumentId: 'AAPL',
          quantity: 1000,
          settlementDate: '2024-01-17T00:00:00.000Z', // T+2
        },
      },
      {
        docId: 'order-bd-2',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-101',
          instrumentId: 'NVDA',
          quantity: 250,
          // T+1 — tight deadline, may breach depending on schedule
          settlementDate: '2024-01-15T00:00:00.000Z',
        },
      },
      {
        docId: 'order-bd-3',
        docType: 'tradeOrder',
        data: {
          tradeOrderNumber: 'TRD-20240115-102',
          instrumentId: 'MSFT',
          quantity: 500,
          settlementDate: '2024-01-17T00:00:00.000Z', // T+2
        },
      },
    ],
  };
}
