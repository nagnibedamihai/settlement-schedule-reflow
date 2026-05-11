import { DateTime } from 'luxon';
import { ReflowService } from './reflow/reflow.service.js';
import { validateSchedule } from './reflow/constraint-checker.js';
import { getDelayCascadeScenario } from './data/scenario-delay-cascade.js';
import { getBlackoutScenario } from './data/scenario-blackout.js';
import { getMultiConstraintScenario } from './data/scenario-multi-constraint.js';
import { getImpossibleScenario } from './data/scenario-impossible.js';
import { getPrepTimeScenario } from './data/scenario-prep-time.js';
import { getRegulatoryHoldScenario } from './data/scenario-regulatory-hold.js';
import { getWeekendSlaBreachScenario } from './data/scenario-weekend-sla-breach.js';
import { getBusyDayScenario } from './data/scenario-busy-day.js';
import type { ReflowInput, ReflowResult, TaskChange, OptimizationMetrics, SettlementTask } from './reflow/types.js';

const service = new ReflowService();

interface Scenario {
  name: string;
  description: string;
  get: () => ReflowInput;
  expectError: boolean;
}

const scenarios: Scenario[] = [
  {
    name: '1. Delay Cascade',
    description: 'Fund transfer delayed 2h → cascades through marginCheck → fundTransfer → disbursement → reconciliation',
    get: getDelayCascadeScenario,
    expectError: false,
  },
  {
    name: '2. Market Hours + Blackout',
    description: '90-min task at 15:00, market closes 16:00, Tue blackout 08:00–12:00 → resumes after blackout',
    get: getBlackoutScenario,
    expectError: false,
  },
  {
    name: '3. Multi-Constraint',
    description: '2 channels, cross-channel deps, channel conflict, FX blackout — all constraints at once',
    get: getMultiConstraintScenario,
    expectError: false,
  },
  {
    name: '4. Impossible Schedule (Circular Dependency)',
    description: 'Task A depends on B, B depends on A → algorithm detects cycle and reports error',
    get: getImpossibleScenario,
    expectError: true,
  },
  {
    name: '5. Prep Time Handling',
    description: '30-min prep + 60-min processing = 90 min total, starts 15:00 → spans overnight',
    get: getPrepTimeScenario,
    expectError: false,
  },
  {
    name: '6. Regulatory Hold + Channel Contention',
    description: 'AML freeze (immovable) blocks 09:00–11:00 → all other tasks must schedule around it',
    get: getRegulatoryHoldScenario,
    expectError: false,
  },
  {
    name: '7. Weekend Spill + SLA Breach',
    description: 'Friday afternoon chain spills over weekend into Monday → SLA breach on tight-deadline trade',
    get: getWeekendSlaBreachScenario,
    expectError: false,
  },
  {
    name: '8. High-Volume Multi-Trade Day',
    description: '3 trades, 10 tasks, 3 channels, diamond deps, blackout — production-scale realism',
    get: getBusyDayScenario,
    expectError: false,
  },
];

// ─── Formatting helpers ──────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function header(title: string, desc: string): void {
  console.log(`\n${BOLD}${'═'.repeat(78)}${RESET}`);
  console.log(`${BOLD}  ${title}${RESET}`);
  console.log(`${DIM}  ${desc}${RESET}`);
  console.log(`${BOLD}${'═'.repeat(78)}${RESET}`);
}

function formatTime(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: 'UTC' });
  return dt.toFormat('EEE MMM dd HH:mm');
}

function printChanges(changes: TaskChange[]): void {
  if (changes.length === 0) {
    console.log(`\n  ${GREEN}No changes — schedule already satisfies all constraints.${RESET}`);
    return;
  }
  console.log(`\n  ${BOLD}Changes:${RESET}`);
  for (const c of changes) {
    const sign = c.delayMinutes >= 0 ? '+' : '';
    const color = c.delayMinutes > 0 ? YELLOW : GREEN;
    console.log(`    ${BOLD}${c.taskReference}${RESET} ${color}${sign}${Math.round(c.delayMinutes)} min${RESET}`);
    console.log(`      ${DIM}${formatTime(c.originalStartDate)} → ${formatTime(c.originalEndDate)}${RESET}  ==>  ${formatTime(c.newStartDate)} → ${formatTime(c.newEndDate)}`);
    console.log(`      ${DIM}Reason: ${c.reason}${RESET}`);
  }
}

function printMetrics(metrics: OptimizationMetrics): void {
  console.log(`\n  ${BOLD}Metrics:${RESET}`);
  console.log(`    Total delay:      ${YELLOW}${metrics.totalDelayMinutes} min${RESET}`);
  console.log(`    Tasks affected:   ${metrics.tasksAffected}`);

  if (metrics.slaBreaches.length > 0) {
    console.log(`    SLA breaches:     ${RED}${metrics.slaBreaches.length}${RESET}`);
    for (const b of metrics.slaBreaches) {
      console.log(`      ${RED}! ${b.taskReference}: exceeds target ${formatTime(b.targetSettlementDate)} by ${Math.round(b.breachMinutes)} min${RESET}`);
    }
  } else {
    console.log(`    SLA breaches:     ${GREEN}none${RESET}`);
  }

  if (metrics.channelUtilization.length > 0) {
    console.log(`    Channel utilization:`);
    for (const u of metrics.channelUtilization) {
      const bar = makeBar(u.utilizationPercent);
      console.log(`      ${u.channelName.padEnd(24)} ${bar} ${u.utilizationPercent}%  (${u.totalProcessingMinutes} min)`);
    }
  }
}

function makeBar(percent: number): string {
  const width = 20;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return `${CYAN}[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]${RESET}`;
}

function printSchedule(tasks: SettlementTask[], channelNames: Map<string, string>): void {
  console.log(`\n  ${BOLD}Final Schedule:${RESET}`);

  // Group by channel
  const byChannel = new Map<string, SettlementTask[]>();
  for (const t of tasks) {
    const list = byChannel.get(t.data.settlementChannelId) ?? [];
    list.push(t);
    byChannel.set(t.data.settlementChannelId, list);
  }

  for (const [chId, chTasks] of byChannel) {
    const name = channelNames.get(chId) ?? chId;
    console.log(`\n    ${BOLD}${CYAN}${name}${RESET}`);
    const sorted = [...chTasks].sort((a, b) => a.data.startDate.localeCompare(b.data.startDate));
    for (const t of sorted) {
      const hold = t.data.isRegulatoryHold ? ` ${RED}[HOLD]${RESET}` : '';
      const prep = t.data.prepTimeMinutes ? ` (+${t.data.prepTimeMinutes}min prep)` : '';
      console.log(`    ${DIM}│${RESET} ${t.data.taskReference.padEnd(18)} ${t.data.taskType.padEnd(18)} ${formatTime(t.data.startDate)} → ${formatTime(t.data.endDate)}  ${DIM}(${t.data.durationMinutes}min${prep})${RESET}${hold}`);
    }
  }
}

function printGantt(tasks: SettlementTask[], channelNames: Map<string, string>): void {
  if (tasks.length === 0) return;

  // Find overall time bounds
  const allStarts = tasks.map((t) => DateTime.fromISO(t.data.startDate, { zone: 'UTC' }));
  const allEnds = tasks.map((t) => DateTime.fromISO(t.data.endDate, { zone: 'UTC' }));
  const minTime = allStarts.reduce((a, b) => (a < b ? a : b));
  const maxTime = allEnds.reduce((a, b) => (a > b ? a : b));
  const totalMinutes = maxTime.diff(minTime, 'minutes').minutes;

  if (totalMinutes <= 0) return;

  const chartWidth = 50;
  const minutesPerChar = totalMinutes / chartWidth;

  console.log(`\n  ${BOLD}Timeline:${RESET} ${formatTime(minTime.toISO()!)} — ${formatTime(maxTime.toISO()!)} (${Math.round(totalMinutes)} min span)`);

  // Group by channel
  const byChannel = new Map<string, SettlementTask[]>();
  for (const t of tasks) {
    const list = byChannel.get(t.data.settlementChannelId) ?? [];
    list.push(t);
    byChannel.set(t.data.settlementChannelId, list);
  }

  for (const [chId, chTasks] of byChannel) {
    const name = (channelNames.get(chId) ?? chId).substring(0, 22).padEnd(22);
    const sorted = [...chTasks].sort((a, b) => a.data.startDate.localeCompare(b.data.startDate));

    // Build the line
    const line = Array(chartWidth).fill(' ');
    for (const t of sorted) {
      const tStart = DateTime.fromISO(t.data.startDate, { zone: 'UTC' });
      const tEnd = DateTime.fromISO(t.data.endDate, { zone: 'UTC' });
      const startPos = Math.floor(tStart.diff(minTime, 'minutes').minutes / minutesPerChar);
      const endPos = Math.min(chartWidth, Math.ceil(tEnd.diff(minTime, 'minutes').minutes / minutesPerChar));

      const char = t.data.isRegulatoryHold ? '!' : blockChar(t.data.taskType);
      for (let i = startPos; i < endPos; i++) {
        line[i] = char;
      }
    }
    console.log(`    ${DIM}${name}${RESET} |${CYAN}${line.join('')}${RESET}|`);
  }

  // Legend
  console.log(`    ${DIM}${''.padEnd(22)} M=margin F=fund D=disburse C=compliance R=recon !=hold${RESET}`);
}

function blockChar(taskType: string): string {
  switch (taskType) {
    case 'marginCheck': return 'M';
    case 'fundTransfer': return 'F';
    case 'disbursement': return 'D';
    case 'complianceScreen': return 'C';
    case 'reconciliation': return 'R';
    case 'regulatoryHold': return '!';
    default: return '#';
  }
}

function printValidation(result: ReflowResult, input: ReflowInput): void {
  const violations = validateSchedule(result.updatedTasks, input.settlementChannels, input.settlementTasks);
  if (violations.length === 0) {
    console.log(`\n  ${GREEN}Constraint validation: PASSED (all constraints satisfied)${RESET}`);
  } else {
    console.log(`\n  ${RED}Constraint validation: FAILED (${violations.length} violation(s))${RESET}`);
    for (const v of violations) {
      console.log(`    ${RED}[${v.type}] ${v.description}${RESET}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n${BOLD}${CYAN}  Settlement Schedule Reflow — Demo${RESET}`);
console.log(`${DIM}  ${scenarios.length} scenarios demonstrating constraint-based topological scheduling${RESET}\n`);

for (const scenario of scenarios) {
  header(scenario.name, scenario.description);

  const input = scenario.get();

  try {
    const result = service.reflow(input);

    // Build channel name lookup
    const channelNames = new Map(input.settlementChannels.map((c) => [c.docId, c.data.name]));

    printChanges(result.changes);
    printMetrics(result.metrics);
    printSchedule(result.updatedTasks, channelNames);
    printGantt(result.updatedTasks, channelNames);
    printValidation(result, input);
  } catch (err) {
    if (scenario.expectError) {
      console.log(`\n  ${YELLOW}Expected error:${RESET} ${(err as Error).message}`);
    } else {
      console.error(`\n  ${RED}UNEXPECTED ERROR: ${(err as Error).message}${RESET}`);
      console.error((err as Error).stack);
    }
  }
}

console.log(`\n${BOLD}${'═'.repeat(78)}${RESET}`);
console.log(`${BOLD}  Demo complete.${RESET} ${DIM}${scenarios.length} scenarios executed.${RESET}`);
console.log(`${BOLD}${'═'.repeat(78)}${RESET}\n`);
