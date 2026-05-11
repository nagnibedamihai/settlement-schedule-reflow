import { describe, it, expect } from 'vitest';
import { ReflowService } from '../src/reflow/reflow.service.js';
import { validateSchedule } from '../src/reflow/constraint-checker.js';
import { getDelayCascadeScenario } from '../src/data/scenario-delay-cascade.js';
import { getBlackoutScenario } from '../src/data/scenario-blackout.js';
import { getMultiConstraintScenario } from '../src/data/scenario-multi-constraint.js';
import { getImpossibleScenario } from '../src/data/scenario-impossible.js';
import { getPrepTimeScenario } from '../src/data/scenario-prep-time.js';

const service = new ReflowService();

describe('ReflowService', () => {
  describe('Scenario 1: Delay Cascade', () => {
    const input = getDelayCascadeScenario();
    const result = service.reflow(input);

    it('rescheduled downstream tasks', () => {
      expect(result.changes.length).toBeGreaterThanOrEqual(2);
    });

    it('disbursement starts after fundTransfer ends', () => {
      const fund = result.updatedTasks.find((t) => t.docId === 'task-fund')!;
      const disburse = result.updatedTasks.find((t) => t.docId === 'task-disburse')!;
      expect(disburse.data.startDate >= fund.data.endDate).toBe(true);
    });

    it('reconciliation starts after disbursement ends', () => {
      const disburse = result.updatedTasks.find((t) => t.docId === 'task-disburse')!;
      const recon = result.updatedTasks.find((t) => t.docId === 'task-recon')!;
      expect(recon.data.startDate >= disburse.data.endDate).toBe(true);
    });

    it('no channel overlaps', () => {
      const violations = validateSchedule(result.updatedTasks, input.settlementChannels, input.settlementTasks);
      const overlaps = violations.filter((v) => v.type === 'CHANNEL_OVERLAP');
      expect(overlaps).toHaveLength(0);
    });

    it('reports total delay correctly', () => {
      expect(result.metrics.totalDelayMinutes).toBe(240);
    });
  });

  describe('Scenario 2: Market Hours + Blackout', () => {
    const input = getBlackoutScenario();
    const result = service.reflow(input);

    it('task starts at Monday 15:00 (unchanged)', () => {
      expect(result.updatedTasks[0]!.data.startDate).toBe('2024-01-15T15:00:00.000Z');
    });

    it('task ends at Tuesday 12:30 (after blackout)', () => {
      expect(result.updatedTasks[0]!.data.endDate).toBe('2024-01-16T12:30:00.000Z');
    });

    it('passes constraint validation', () => {
      const violations = validateSchedule(result.updatedTasks, input.settlementChannels);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Scenario 3: Multi-Constraint', () => {
    const input = getMultiConstraintScenario();
    const result = service.reflow(input);

    it('channel conflict resolved — D pushed after A', () => {
      const a = result.updatedTasks.find((t) => t.docId === 'task-A')!;
      const d = result.updatedTasks.find((t) => t.docId === 'task-D')!;
      expect(d.data.startDate >= a.data.endDate).toBe(true);
    });

    it('cross-channel dependency: B starts after A', () => {
      const a = result.updatedTasks.find((t) => t.docId === 'task-A')!;
      const b = result.updatedTasks.find((t) => t.docId === 'task-B')!;
      expect(b.data.startDate >= a.data.endDate).toBe(true);
    });

    it('C starts after B on different channel', () => {
      const b = result.updatedTasks.find((t) => t.docId === 'task-B')!;
      const c = result.updatedTasks.find((t) => t.docId === 'task-C')!;
      expect(c.data.startDate >= b.data.endDate).toBe(true);
    });

    it('no constraint violations', () => {
      const violations = validateSchedule(result.updatedTasks, input.settlementChannels, input.settlementTasks);
      const overlaps = violations.filter((v) => v.type === 'CHANNEL_OVERLAP');
      const depViolations = violations.filter((v) => v.type === 'DEPENDENCY_VIOLATED');
      expect(overlaps).toHaveLength(0);
      expect(depViolations).toHaveLength(0);
    });
  });

  describe('Scenario 4: Impossible Schedule', () => {
    it('throws descriptive error for circular dependency', () => {
      const input = getImpossibleScenario();
      expect(() => service.reflow(input)).toThrow('Circular dependency detected');
    });
  });

  describe('Scenario 5: Prep Time', () => {
    const input = getPrepTimeScenario();
    const result = service.reflow(input);

    it('task starts at Monday 15:00', () => {
      expect(result.updatedTasks[0]!.data.startDate).toBe('2024-01-15T15:00:00.000Z');
    });

    it('task ends at Tuesday 08:30 (90 min total = 60 Mon + 30 Tue)', () => {
      expect(result.updatedTasks[0]!.data.endDate).toBe('2024-01-16T08:30:00.000Z');
    });
  });

  describe('General invariants', () => {
    it('regulatory hold tasks are not moved', () => {
      const input = getDelayCascadeScenario();
      // Add a regulatory hold task
      input.settlementTasks.push({
        docId: 'task-hold',
        docType: 'settlementTask',
        data: {
          taskReference: 'STL-HOLD-001',
          tradeOrderId: 'order-1',
          settlementChannelId: 'ch-domestic',
          startDate: '2024-01-15T14:00:00.000Z',
          endDate: '2024-01-15T14:30:00.000Z',
          durationMinutes: 30,
          isRegulatoryHold: true,
          dependsOnTaskIds: [],
          taskType: 'regulatoryHold',
        },
      });
      const result = service.reflow(input);
      const hold = result.updatedTasks.find((t) => t.docId === 'task-hold')!;
      expect(hold.data.startDate).toBe('2024-01-15T14:00:00.000Z');
      expect(hold.data.endDate).toBe('2024-01-15T14:30:00.000Z');
    });

    it('metrics: SLA breach detected when task exceeds settlement date', () => {
      const input = getDelayCascadeScenario();
      // Set settlement date to day before so endOf('day') is before tasks finish
      input.tradeOrders[0]!.data.settlementDate = '2024-01-14T00:00:00.000Z';
      const result = service.reflow(input);
      expect(result.metrics.slaBreaches.length).toBeGreaterThan(0);
    });
  });
});
