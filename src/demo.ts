import { ReflowService } from './reflow/reflow.service.js';
import { getDelayCascadeScenario } from './data/scenario-delay-cascade.js';
import { getBlackoutScenario } from './data/scenario-blackout.js';
import { getMultiConstraintScenario } from './data/scenario-multi-constraint.js';
import { getImpossibleScenario } from './data/scenario-impossible.js';
import { getPrepTimeScenario } from './data/scenario-prep-time.js';
import type { ReflowResult, TaskChange, OptimizationMetrics } from './reflow/types.js';

const service = new ReflowService();

const scenarios = [
  { name: '1. Delay Cascade', get: getDelayCascadeScenario, expectError: false },
  { name: '2. Market Hours + Blackout', get: getBlackoutScenario, expectError: false },
  { name: '3. Multi-Constraint', get: getMultiConstraintScenario, expectError: false },
  { name: '4. Impossible Schedule (Circular Dependency)', get: getImpossibleScenario, expectError: true },
  { name: '5. Prep Time Handling', get: getPrepTimeScenario, expectError: false },
];

function divider(title: string): void {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

function printChanges(changes: TaskChange[]): void {
  if (changes.length === 0) {
    console.log('  No changes — schedule was already valid.');
    return;
  }
  console.log('\n  Changes:');
  console.log('  ' + '-'.repeat(66));
  for (const c of changes) {
    console.log(`  ${c.taskReference}`);
    console.log(`    Original: ${c.originalStartDate} → ${c.originalEndDate}`);
    console.log(`    New:      ${c.newStartDate} → ${c.newEndDate}`);
    console.log(`    Delay:    ${Math.round(c.delayMinutes)} min`);
    console.log(`    Reason:   ${c.reason}`);
  }
}

function printMetrics(metrics: OptimizationMetrics): void {
  console.log('\n  Metrics:');
  console.log(`    Total delay:    ${metrics.totalDelayMinutes} min`);
  console.log(`    Tasks affected: ${metrics.tasksAffected}`);

  if (metrics.slaBreaches.length > 0) {
    console.log(`    SLA breaches:   ${metrics.slaBreaches.length}`);
    for (const b of metrics.slaBreaches) {
      console.log(`      - ${b.taskReference}: exceeds ${b.targetSettlementDate} by ${Math.round(b.breachMinutes)} min`);
    }
  } else {
    console.log('    SLA breaches:   none');
  }

  if (metrics.channelUtilization.length > 0) {
    console.log('    Channel utilization:');
    for (const u of metrics.channelUtilization) {
      console.log(`      - ${u.channelName}: ${u.totalProcessingMinutes} min processed, ${u.utilizationPercent}% utilization`);
    }
  }
}

for (const scenario of scenarios) {
  divider(scenario.name);

  try {
    const input = scenario.get();
    const result = service.reflow(input);

    console.log(`\n  ${result.explanation.split('\n').join('\n  ')}`);
    printChanges(result.changes);
    printMetrics(result.metrics);

    // Show final schedule
    console.log('\n  Final Schedule:');
    for (const task of result.updatedTasks) {
      console.log(`    ${task.data.taskReference} [${task.data.taskType}] on ${task.data.settlementChannelId}`);
      console.log(`      ${task.data.startDate} → ${task.data.endDate} (${task.data.durationMinutes} min)`);
    }
  } catch (err) {
    if (scenario.expectError) {
      console.log(`\n  Expected error: ${(err as Error).message}`);
    } else {
      console.error(`\n  UNEXPECTED ERROR: ${(err as Error).message}`);
      console.error((err as Error).stack);
    }
  }
}

console.log('\n' + '═'.repeat(70));
console.log('  Demo complete.');
console.log('═'.repeat(70) + '\n');
