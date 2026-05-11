import { DateTime } from 'luxon';
import { TaskDAG } from './dag.js';
import { calculateEndDate, diffMinutes, laterOf } from '../utils/date-utils.js';
import type {
  ReflowInput,
  ReflowResult,
  SettlementTask,
  SettlementChannel,
  TradeOrder,
  TaskChange,
  ChannelBooking,
  OptimizationMetrics,
  SLABreach,
  ChannelUtilization,
  OperatingHours,
  BlackoutWindow,
} from './types.js';

const MAX_STABILIZATION_ITERATIONS = 100;

export class ReflowService {
  reflow(input: ReflowInput): ReflowResult {
    const taskMap = new Map<string, SettlementTask>();
    const channelMap = new Map<string, SettlementChannel>();
    const tradeOrderMap = new Map<string, TradeOrder>();
    const channelBookings = new Map<string, ChannelBooking[]>();

    for (const ch of input.settlementChannels) {
      channelMap.set(ch.docId, ch);
      channelBookings.set(ch.docId, []);
    }
    for (const t of input.settlementTasks) taskMap.set(t.docId, t);
    for (const o of input.tradeOrders) tradeOrderMap.set(o.docId, o);

    // Phase 1: Build DAG and topological sort
    const dag = new TaskDAG();
    for (const task of input.settlementTasks) {
      dag.addNode(task.docId);
      for (const depId of task.data.dependsOnTaskIds) {
        dag.addEdge(depId, task.docId);
      }
    }
    const sortedIds = dag.topologicalSort();

    // Phase 2a: Pre-book all regulatory holds (immovable, must be visible to all tasks)
    const scheduledTasks = new Map<string, SettlementTask>();
    const changes: TaskChange[] = [];

    for (const task of input.settlementTasks) {
      if (!task.data.isRegulatoryHold) continue;
      scheduledTasks.set(task.docId, task);
      const bookings = channelBookings.get(task.data.settlementChannelId)!;
      insertBooking(bookings, { taskId: task.docId, start: task.data.startDate, end: task.data.endDate });
    }

    // Phase 2b: Schedule each non-hold task in dependency order
    for (const taskId of sortedIds) {
      const task = taskMap.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      // Already booked in phase 2a
      if (task.data.isRegulatoryHold) continue;

      const channel = channelMap.get(task.data.settlementChannelId);
      if (!channel) throw new Error(`Channel ${task.data.settlementChannelId} not found for task ${task.data.taskReference}`);

      const opHours = channel.data.operatingHours;
      const blackouts = channel.data.blackoutWindows;
      const bookings = channelBookings.get(channel.docId)!;

      // Earliest start: max of (original start, all dependency end dates)
      let earliestStart = task.data.startDate;
      for (const depId of task.data.dependsOnTaskIds) {
        const dep = scheduledTasks.get(depId);
        if (!dep) throw new Error(`Dependency ${depId} not yet scheduled for task ${task.data.taskReference}`);
        earliestStart = laterOf(earliestStart, dep.data.endDate);
      }

      // Initial conflict check (without end date — we don't know it yet)
      let candidateStart = resolveChannelConflict(earliestStart, bookings);
      let result = calculateEndDate(
        candidateStart,
        task.data.durationMinutes,
        opHours,
        blackouts,
        task.data.prepTimeMinutes ?? 0,
      );

      // Stabilization: wall-clock expansion or span overlap may create new conflicts
      for (let i = 0; i < MAX_STABILIZATION_ITERATIONS; i++) {
        const newCandidate = resolveChannelConflict(result.startDate, bookings, result.endDate);
        if (newCandidate === result.startDate) break;
        result = calculateEndDate(
          newCandidate,
          task.data.durationMinutes,
          opHours,
          blackouts,
          task.data.prepTimeMinutes ?? 0,
        );
        if (i === MAX_STABILIZATION_ITERATIONS - 1) {
          throw new Error(`Unable to stabilize schedule for task ${task.data.taskReference} on channel ${channel.data.name}`);
        }
      }

      const updatedTask: SettlementTask = {
        ...task,
        data: { ...task.data, startDate: result.startDate, endDate: result.endDate },
      };
      scheduledTasks.set(taskId, updatedTask);
      insertBooking(bookings, { taskId, start: result.startDate, end: result.endDate });

      // Record change if dates moved
      if (result.startDate !== task.data.startDate || result.endDate !== task.data.endDate) {
        changes.push({
          taskId,
          taskReference: task.data.taskReference,
          originalStartDate: task.data.startDate,
          originalEndDate: task.data.endDate,
          newStartDate: result.startDate,
          newEndDate: result.endDate,
          delayMinutes: diffMinutes(task.data.endDate, result.endDate),
          reason: buildReason(task, earliestStart, candidateStart, result.startDate, scheduledTasks, channelMap),
        });
      }
    }

    // Phase 3: Metrics
    const metrics = computeMetrics(
      scheduledTasks,
      changes,
      tradeOrderMap,
      channelMap,
      channelBookings,
    );

    // Phase 4: Explanation
    const explanation = buildExplanation(changes, metrics);

    return {
      updatedTasks: sortedIds.map((id) => scheduledTasks.get(id)!),
      changes,
      explanation,
      metrics,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk through sorted channel bookings. If candidateStart overlaps a booking,
 * push it past that booking's end. Continue checking subsequent bookings.
 * When candidateEnd is provided, also detects cases where the task's span
 * would overlap a booking even though the start doesn't fall inside it.
 */
function resolveChannelConflict(candidateStart: string, bookings: ChannelBooking[], candidateEnd?: string): string {
  let current = candidateStart;
  for (const booking of bookings) {
    // Booking entirely before candidate — skip
    if (booking.end <= current) continue;
    // Candidate start falls within this booking — push past it
    if (current >= booking.start && current < booking.end) {
      current = booking.end;
      continue;
    }
    // Candidate span overlaps this booking (start is before booking but end is after booking start)
    if (candidateEnd && current < booking.start && candidateEnd > booking.start) {
      current = booking.end;
      continue;
    }
    // Candidate is before this booking and doesn't overlap — safe
    if (current < booking.start) break;
  }
  return current;
}

/** Insert a booking into the sorted array, maintaining start-time order. */
function insertBooking(bookings: ChannelBooking[], booking: ChannelBooking): void {
  const idx = bookings.findIndex((b) => b.start > booking.start);
  if (idx === -1) {
    bookings.push(booking);
  } else {
    bookings.splice(idx, 0, booking);
  }
}

function buildReason(
  task: SettlementTask,
  earliestStart: string,
  candidateStart: string,
  actualStart: string,
  scheduledTasks: Map<string, SettlementTask>,
  channelMap: Map<string, SettlementChannel>,
): string {
  const reasons: string[] = [];

  // Check if delayed by dependencies
  if (earliestStart !== task.data.startDate && task.data.dependsOnTaskIds.length > 0) {
    const depRefs = task.data.dependsOnTaskIds
      .map((id) => scheduledTasks.get(id)?.data.taskReference ?? id)
      .join(', ');
    reasons.push(`Delayed by upstream dependency: ${depRefs}`);
  }

  // Check if pushed by channel conflict
  if (candidateStart !== earliestStart) {
    reasons.push('Pushed forward due to channel conflict');
  }

  // Check if adjusted for operating hours or blackouts
  if (actualStart !== candidateStart) {
    const channel = channelMap.get(task.data.settlementChannelId);
    const hitBlackout = channel?.data.blackoutWindows.some((bw) => {
      const bwStart = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
      const bwEnd = DateTime.fromISO(bw.endDate, { zone: 'UTC' });
      const cs = DateTime.fromISO(candidateStart, { zone: 'UTC' });
      return cs >= bwStart && cs < bwEnd;
    });
    if (hitBlackout) {
      reasons.push('Skipped blackout window');
    } else {
      reasons.push('Adjusted to fit within operating hours');
    }
  }

  if (reasons.length === 0) {
    reasons.push('Rescheduled due to constraint resolution');
  }

  return reasons.join('; ');
}

function computeMetrics(
  scheduledTasks: Map<string, SettlementTask>,
  changes: TaskChange[],
  tradeOrderMap: Map<string, TradeOrder>,
  channelMap: Map<string, SettlementChannel>,
  channelBookings: Map<string, ChannelBooking[]>,
): OptimizationMetrics {
  const totalDelayMinutes = changes.reduce((sum, c) => sum + Math.max(0, c.delayMinutes), 0);
  const tasksAffected = changes.length;

  // SLA breach detection
  const slaBreaches: SLABreach[] = [];
  for (const [, task] of scheduledTasks) {
    const order = tradeOrderMap.get(task.data.tradeOrderId);
    if (!order) continue;
    const targetEnd = DateTime.fromISO(order.data.settlementDate, { zone: 'UTC' }).endOf('day');
    const actualEnd = DateTime.fromISO(task.data.endDate, { zone: 'UTC' });
    if (actualEnd > targetEnd) {
      slaBreaches.push({
        taskId: task.docId,
        taskReference: task.data.taskReference,
        tradeOrderId: task.data.tradeOrderId,
        targetSettlementDate: order.data.settlementDate,
        actualEndDate: task.data.endDate,
        breachMinutes: actualEnd.diff(targetEnd, 'minutes').minutes,
      });
    }
  }

  // Channel utilization
  const channelUtilization: ChannelUtilization[] = [];
  for (const [channelId, bookings] of channelBookings) {
    const channel = channelMap.get(channelId);
    if (!channel || bookings.length === 0) continue;

    const totalProcessingMinutes = [...scheduledTasks.values()]
      .filter((t) => t.data.settlementChannelId === channelId)
      .reduce((sum, t) => sum + t.data.durationMinutes + (t.data.prepTimeMinutes ?? 0), 0);

    // Available minutes: from earliest booking start to latest booking end
    const earliest = DateTime.fromISO(bookings[0]!.start, { zone: 'UTC' });
    const latest = DateTime.fromISO(bookings[bookings.length - 1]!.end, { zone: 'UTC' });
    const totalAvailable = computeAvailableMinutes(earliest, latest, channel.data.operatingHours, channel.data.blackoutWindows);

    channelUtilization.push({
      channelId,
      channelName: channel.data.name,
      totalProcessingMinutes,
      utilizationPercent: totalAvailable > 0 ? Math.round((totalProcessingMinutes / totalAvailable) * 100) : 0,
    });
  }

  return { totalDelayMinutes, tasksAffected, slaBreaches, channelUtilization };
}

/** Calculate total available operating minutes between two DateTimes. */
function computeAvailableMinutes(
  from: DateTime,
  to: DateTime,
  operatingHours: OperatingHours[],
  blackoutWindows: BlackoutWindow[],
): number {
  let total = 0;
  let current = from;

  while (current < to) {
    const specDay = current.weekday === 7 ? 0 : current.weekday;
    const oh = operatingHours.find((o) => o.dayOfWeek === specDay);
    if (oh) {
      const dayStart = current.startOf('day').set({ hour: oh.startHour, minute: 0, second: 0, millisecond: 0 });
      const dayEnd = current.startOf('day').set({ hour: oh.endHour, minute: 0, second: 0, millisecond: 0 });

      const windowStart = current > dayStart ? current : dayStart;
      const windowEnd = to < dayEnd ? to : dayEnd;

      if (windowStart < windowEnd) {
        let availableInWindow = windowEnd.diff(windowStart, 'minutes').minutes;

        // Subtract blackout overlap
        for (const bw of blackoutWindows) {
          const bwStart = DateTime.fromISO(bw.startDate, { zone: 'UTC' });
          const bwEnd = DateTime.fromISO(bw.endDate, { zone: 'UTC' });
          const overlapStart = bwStart > windowStart ? bwStart : windowStart;
          const overlapEnd = bwEnd < windowEnd ? bwEnd : windowEnd;
          if (overlapStart < overlapEnd) {
            availableInWindow -= overlapEnd.diff(overlapStart, 'minutes').minutes;
          }
        }

        total += Math.max(0, availableInWindow);
      }
    }
    current = current.startOf('day').plus({ days: 1 });
  }

  return total;
}

function buildExplanation(changes: TaskChange[], metrics: OptimizationMetrics): string {
  if (changes.length === 0) {
    return 'No changes required — all tasks already satisfy constraints.';
  }

  const lines: string[] = [
    `Reflow complete: ${changes.length} task(s) rescheduled.`,
    `Total delay introduced: ${metrics.totalDelayMinutes} minutes.`,
  ];

  if (metrics.slaBreaches.length > 0) {
    lines.push(`WARNING: ${metrics.slaBreaches.length} SLA breach(es) detected.`);
    for (const breach of metrics.slaBreaches) {
      lines.push(`  - ${breach.taskReference}: exceeds settlement date ${breach.targetSettlementDate} by ${Math.round(breach.breachMinutes)} min`);
    }
  }

  lines.push('');
  lines.push('Changes:');
  for (const c of changes) {
    lines.push(`  - ${c.taskReference}: moved ${c.originalStartDate} → ${c.newStartDate} (+${Math.round(c.delayMinutes)} min). Reason: ${c.reason}`);
  }

  return lines.join('\n');
}
