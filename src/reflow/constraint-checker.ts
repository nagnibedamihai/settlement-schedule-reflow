/**
 * Post-hoc constraint validator — verifies a completed schedule independently
 * of the scheduling algorithm. Catches bugs in the scheduler and can validate
 * externally-provided schedules.
 */

import { DateTime } from 'luxon';
import { isWithinOperatingHours, isWithinBlackout } from '../utils/date-utils.js';
import type { SettlementTask, SettlementChannel } from './types.js';

export interface ConstraintViolation {
  type:
    | 'CHANNEL_OVERLAP'
    | 'DEPENDENCY_VIOLATED'
    | 'OUTSIDE_OPERATING_HOURS'
    | 'BLACKOUT_VIOLATED'
    | 'REGULATORY_HOLD_MOVED';
  taskId: string;
  taskReference: string;
  description: string;
}

export function validateSchedule(
  tasks: SettlementTask[],
  channels: SettlementChannel[],
  originalTasks?: SettlementTask[],
): ConstraintViolation[] {
  const channelMap = new Map(channels.map((c) => [c.docId, c]));
  return [
    ...checkChannelOverlaps(tasks),
    ...checkDependencies(tasks),
    ...checkOperatingHours(tasks, channelMap),
    ...checkBlackoutWindows(tasks, channelMap),
    ...(originalTasks ? checkRegulatoryHolds(originalTasks, tasks) : []),
  ];
}

/** No two tasks on the same channel should have overlapping time ranges. */
export function checkChannelOverlaps(tasks: SettlementTask[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const byChannel = new Map<string, SettlementTask[]>();

  for (const task of tasks) {
    const list = byChannel.get(task.data.settlementChannelId) ?? [];
    list.push(task);
    byChannel.set(task.data.settlementChannelId, list);
  }

  for (const [, channelTasks] of byChannel) {
    const sorted = [...channelTasks].sort((a, b) => a.data.startDate.localeCompare(b.data.startDate));
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;
      if (current.data.endDate > next.data.startDate) {
        violations.push({
          type: 'CHANNEL_OVERLAP',
          taskId: next.docId,
          taskReference: next.data.taskReference,
          description: `${current.data.taskReference} [${current.data.startDate} – ${current.data.endDate}] overlaps with ${next.data.taskReference} [${next.data.startDate} – ${next.data.endDate}]`,
        });
      }
    }
  }

  return violations;
}

/** All dependency end dates must be ≤ the dependent task's start date. */
export function checkDependencies(tasks: SettlementTask[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const taskMap = new Map(tasks.map((t) => [t.docId, t]));

  for (const task of tasks) {
    for (const depId of task.data.dependsOnTaskIds) {
      const dep = taskMap.get(depId);
      if (!dep) continue;
      if (dep.data.endDate > task.data.startDate) {
        violations.push({
          type: 'DEPENDENCY_VIOLATED',
          taskId: task.docId,
          taskReference: task.data.taskReference,
          description: `Dependency ${dep.data.taskReference} ends at ${dep.data.endDate} but ${task.data.taskReference} starts at ${task.data.startDate}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Check that each task's start and end times fall within operating hours.
 * We sample at the boundaries of each operating window the task spans.
 *
 * @upgrade: validate the full span by walking each operating window the task
 * crosses, not just start/end. Also verify duration consistency: that the
 * elapsed wall-clock time equals duration + prep + paused hours.
 */
export function checkOperatingHours(
  tasks: SettlementTask[],
  channelMap: Map<string, SettlementChannel>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const task of tasks) {
    const channel = channelMap.get(task.data.settlementChannelId);
    if (!channel) continue;

    const start = DateTime.fromISO(task.data.startDate, { zone: 'UTC' });
    const end = DateTime.fromISO(task.data.endDate, { zone: 'UTC' });

    // Check that start is within operating hours
    if (!isWithinOperatingHours(start, channel.data.operatingHours)) {
      violations.push({
        type: 'OUTSIDE_OPERATING_HOURS',
        taskId: task.docId,
        taskReference: task.data.taskReference,
        description: `Task starts at ${task.data.startDate} which is outside operating hours`,
      });
    }

    // Check that end is within operating hours (or exactly at window boundary)
    const endMinusEpsilon = end.minus({ minutes: 1 });
    if (end > start && !isWithinOperatingHours(endMinusEpsilon, channel.data.operatingHours)) {
      violations.push({
        type: 'OUTSIDE_OPERATING_HOURS',
        taskId: task.docId,
        taskReference: task.data.taskReference,
        description: `Task ends at ${task.data.endDate} which is outside operating hours`,
      });
    }
  }

  return violations;
}

/** No task's processing window should overlap any blackout on its channel. */
export function checkBlackoutWindows(
  tasks: SettlementTask[],
  channelMap: Map<string, SettlementChannel>,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const task of tasks) {
    const channel = channelMap.get(task.data.settlementChannelId);
    if (!channel) continue;

    const taskStart = DateTime.fromISO(task.data.startDate, { zone: 'UTC' });
    const taskEnd = DateTime.fromISO(task.data.endDate, { zone: 'UTC' });

    for (const bw of channel.data.blackoutWindows) {
      const bwStart = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
      const bwEnd = DateTime.fromISO(bw.endDate, { zone: 'UTC' });

      // Check for overlap: task and blackout overlap if taskStart < bwEnd && taskEnd > bwStart
      // But tasks can span blackouts (they pause during them), so we only flag
      // if the task's actual start or end falls within a blackout
      if (isWithinBlackout(taskStart, channel.data.blackoutWindows)) {
        violations.push({
          type: 'BLACKOUT_VIOLATED',
          taskId: task.docId,
          taskReference: task.data.taskReference,
          description: `Task starts during blackout: ${bw.reason ?? 'maintenance'} (${bw.startDate} – ${bw.endDate})`,
        });
        break;
      }
      if (taskEnd > bwStart && taskEnd <= bwEnd && isWithinBlackout(taskEnd.minus({ minutes: 1 }), channel.data.blackoutWindows)) {
        violations.push({
          type: 'BLACKOUT_VIOLATED',
          taskId: task.docId,
          taskReference: task.data.taskReference,
          description: `Task ends during blackout: ${bw.reason ?? 'maintenance'} (${bw.startDate} – ${bw.endDate})`,
        });
        break;
      }
    }
  }

  return violations;
}

/** Regulatory hold tasks must not have their dates changed. */
export function checkRegulatoryHolds(
  originalTasks: SettlementTask[],
  updatedTasks: SettlementTask[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const updatedMap = new Map(updatedTasks.map((t) => [t.docId, t]));

  for (const orig of originalTasks) {
    if (!orig.data.isRegulatoryHold) continue;
    const updated = updatedMap.get(orig.docId);
    if (!updated) continue;
    if (orig.data.startDate !== updated.data.startDate || orig.data.endDate !== updated.data.endDate) {
      violations.push({
        type: 'REGULATORY_HOLD_MOVED',
        taskId: orig.docId,
        taskReference: orig.data.taskReference,
        description: `Regulatory hold task was moved from ${orig.data.startDate}–${orig.data.endDate} to ${updated.data.startDate}–${updated.data.endDate}`,
      });
    }
  }

  return violations;
}
