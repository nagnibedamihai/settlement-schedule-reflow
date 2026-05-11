# Settlement Schedule Reflow

A settlement schedule reflow system for financial operations. When disruptions occur (delayed trades, counterparty failures, regulatory holds), the system intelligently reschedules settlement tasks while respecting dependencies, channel constraints, operating hours, and blackout windows.

## Quick Start

```bash
yarn install
yarn build          # compile TypeScript
yarn demo           # run all 5 scenarios
yarn test           # run test suite (41 tests)
yarn typecheck      # TypeScript type checking
```

## Algorithm Approach

### High-Level

The reflow algorithm is a **greedy constraint-based topological scheduler**. It processes tasks in dependency order and assigns each task the earliest feasible start time in a single forward pass.

### Steps

1. **Build a DAG** from task `dependsOnTaskIds`. Detect circular dependencies (DFS three-color marking). Topologically sort using Kahn's BFS algorithm.
2. **Schedule each task in topo order**:
   - Regulatory hold tasks are pinned (never moved)
   - Compute earliest start = max(all dependency end dates, original start)
   - Resolve channel conflicts (push past overlapping bookings)
   - Calculate actual end date respecting operating hours, blackout windows, and prep time
   - **Stabilization loop**: recalculate if wall-clock expansion creates new channel overlaps
3. **Compute optimization metrics**: total delay, SLA breaches, channel utilization
4. **Post-hoc validation** via independent constraint checker

### Why Greedy Works Here

The problem has a natural topological ordering. Tasks can only move forward in time, and we process in dependency order, so a single forward pass is sufficient. There is no optimization objective requiring exploration of alternative orderings — we want the *earliest feasible* time for each task.

### Constraint Resolution Order

1. **Dependencies** — via topological ordering
2. **Channel conflicts** — no overlapping tasks on same channel
3. **Operating hours** — processing pauses outside market windows, resumes in next
4. **Blackout windows** — skipped entirely, handled by `calculateEndDate`

## Architecture

```
src/
├── reflow/
│   ├── types.ts              # All type definitions (Document wrapper, entities, I/O)
│   ├── dag.ts                # DAG with topological sort and cycle detection
│   ├── constraint-checker.ts # Post-hoc schedule validation (independent of scheduler)
│   └── reflow.service.ts     # Main reflow algorithm
├── utils/
│   └── date-utils.ts         # Luxon-based date helpers (window-jumping, calculateEndDate)
├── data/
│   ├── scenario-delay-cascade.ts
│   ├── scenario-blackout.ts
│   ├── scenario-multi-constraint.ts
│   ├── scenario-impossible.ts
│   ├── scenario-prep-time.ts
│   ├── scenario-regulatory-hold.ts
│   ├── scenario-weekend-sla-breach.ts
│   └── scenario-busy-day.ts
└── demo.ts                   # Runner script for all scenarios
tests/                        # Vitest test suite (51 tests)
```

### Data Flow

```
ReflowInput (tasks, channels, tradeOrders)
  → DAG construction + cycle detection
  → Topological sort
  → Per-task scheduling loop (dependencies → conflicts → operating hours → blackouts)
  → Metrics computation (delay, SLA breaches, utilization)
  → Post-hoc constraint validation
  → ReflowResult (updatedTasks, changes, explanation, metrics)
```

## Sample Scenarios

| # | Scenario | What It Tests |
|---|----------|---------------|
| 1 | Delay Cascade | 4-task chain, fundTransfer delayed 2h → downstream cascade |
| 2 | Market Hours + Blackout | 90-min task at 15:00, Tue blackout 08:00-12:00 → resumes 12:00 |
| 3 | Multi-Constraint | 2 channels, cross-channel deps, channel conflict, blackout |
| 4 | Impossible Schedule | Circular dependency → descriptive error message |
| 5 | Prep Time | 30-min prep + 60-min processing spanning overnight |
| 6 | Regulatory Hold + Contention | AML freeze (immovable) blocks channel, others route around it |
| 7 | Weekend Spill + SLA Breach | Friday chain spills to Monday, tight-deadline trade triggers SLA breach |
| 8 | High-Volume Multi-Trade Day | 3 trades, 10 tasks, 3 channels — production-scale realism |

## Bonus Features

- **DAG implementation** with topological sort (Kahn's) and cycle detection (DFS three-color)
- **Prep time handling** (`prepTimeMinutes` counted as working time within operating hours)
- **Optimization metrics**: total delay, tasks affected, SLA breach detection, channel utilization %
- **Automated test suite**: 51 tests across 4 files (Vitest)
- **8 sample scenarios** (3 required + 5 bonus) with ASCII Gantt timeline visualization
- **AI prompts documentation** in `prompts/`

## Trade-offs & Known Limitations

- **No multi-channel optimization**: tasks stay on their assigned channel. A future improvement could reassign tasks to less-loaded channels. `// @upgrade: add channel reassignment optimization`
- **Greedy scheduling**: produces the earliest feasible schedule but doesn't globally minimize total delay. For most real-world cases this is optimal, but pathological configurations with competing channel demands might benefit from backtracking. `// @upgrade: consider ILP solver for global optimization`
- **Channel utilization metric** uses a simple ratio of processing time to available time in the schedule's time span — doesn't account for fragmentation.
- **Operating hours are hour-granular**: no support for minute-level operating windows (e.g., 8:30-15:45).
