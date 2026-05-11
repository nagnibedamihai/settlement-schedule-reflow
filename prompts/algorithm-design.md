# AI Prompts: Algorithm Design

These prompts document the key AI-assisted decisions made during the design and implementation of the settlement schedule reflow system.

## Prompt 1: Algorithm Selection

**Question**: What scheduling algorithm should be used for rescheduling settlement tasks with dependencies, channel constraints, operating hours, and blackout windows?

**Analysis**: The problem is a constraint-based scheduling problem with:
- DAG dependencies (topological ordering)
- Resource constraints (one task per channel)
- Time windows (operating hours)
- Blocked intervals (blackouts)
- Immovable tasks (regulatory holds)

**Decision**: Greedy topological scheduler (single forward pass). Rationale:
- Tasks form a DAG — topological sort gives a natural processing order
- Tasks can only move forward in time, never backward
- No optimization objective requires exploring alternative orderings
- A single forward pass is provably correct: each task gets the earliest feasible slot
- More complex approaches (ILP, constraint propagation, backtracking) are unnecessary for this problem structure

**Trade-off considered**: Global delay minimization via ILP. Rejected because the greedy approach already minimizes per-task delay, and the problem doesn't have competing optimization objectives.

## Prompt 2: Operating Hours Handling

**Question**: How to efficiently calculate end dates when tasks span multiple operating windows?

**Analysis**: Minute-by-minute iteration would be O(duration × days) and fragile. Window-jumping is O(windows).

**Decision**: Window-jumping algorithm in `calculateEndDate`:
1. Advance to next valid time (skip non-operating hours, blackouts)
2. Calculate available minutes until window end
3. If enough time: done. Otherwise: consume available, jump to next window
4. Repeat until all minutes consumed

This approach is O(number of windows spanned) instead of O(minutes).

## Prompt 3: Channel Conflict Resolution with Stabilization

**Question**: After resolving a channel conflict and calculating the end date (which may expand due to operating hours), the new wall-clock span might overlap the next booking on that channel. How to handle this?

**Decision**: Stabilization loop. After calculating the end date, re-check for channel conflicts. If the start moved, recalculate the end date. Repeat until stable (start doesn't move). Convergence is guaranteed because each iteration pushes the start strictly later, and the number of bookings is finite. Safety cap at 100 iterations.

## Prompt 4: Post-hoc Validation Architecture

**Question**: Should constraint checking be integrated into the scheduler or separate?

**Decision**: Separate `constraint-checker.ts` that independently validates any schedule. Benefits:
- Catches bugs in the scheduler itself
- Can validate externally-provided schedules
- Each check is independently testable
- Separation of concerns: scheduler produces, checker validates

## Prompt 5: Cycle Detection Approach

**Question**: DFS three-color vs Kahn's algorithm for cycle detection?

**Decision**: Use both. Kahn's algorithm for topological sort (if result length < node count, there's a cycle). DFS three-color for *reporting* which tasks form the cycle (better error messages). The DFS cycle detection is only called when Kahn's detects an issue, so it's not on the critical path.

## Prompt 6: Sample Scenario Design

**Question**: What scenarios best demonstrate the algorithm's correctness?

**Scenarios chosen**:
1. **Delay Cascade** — tests dependency propagation (the core use case)
2. **Market Hours + Blackout** — tests the trickiest part (operating hour boundary + blackout avoidance)
3. **Multi-Constraint** — tests all constraints simultaneously (cross-channel deps, conflict, blackout)
4. **Impossible Schedule** — tests error handling (circular dependency detection)
5. **Prep Time** — tests bonus feature (prep time spanning overnight)

Each scenario was designed to test specific constraint interactions rather than just individual constraints.
