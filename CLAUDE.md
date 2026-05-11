# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Settlement Schedule Reflow — a TypeScript system that reschedules settlement tasks when disruptions occur (delayed trades, regulatory holds, channel maintenance). The algorithm respects dependencies between tasks, market operating hours, blackout windows, and channel availability.

## Commands

- **Install dependencies:** `yarn install`
- **Type-check:** `npx tsc --noEmit`
- **Run a file:** `npx ts-node --esm <file>`

No test framework, linter, or formatter is currently configured.

## Architecture

### Module system
ESM with `nodenext` module resolution. TypeScript strict mode is enabled along with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

### Key types (`src/reflow/types.ts`)
All entities use a `Document<T>` wrapper (`docId`, `docType`, `data`). Core domain types:
- **SettlementTask** — individual processing unit with scheduled times, channel assignment, dependencies (`dependsOnTaskIds`), duration, and regulatory hold flag
- **SettlementChannel** — processing lane with operating hours (per day-of-week) and blackout windows
- **TradeOrder** — parent trade linking tasks to a settlement date
- **ReflowResult** — algorithm output containing updated tasks, change list, explanation text, and optimization metrics

### Date/time handling (`src/utils/date-utils.ts`)
Uses **Luxon** (`DateTime`) for all date operations. Key design: window-jumping algorithm (advances to next valid operating window rather than iterating minute-by-minute). All times are ISO 8601 strings in the type system, converted to Luxon `DateTime` internally.

### Hard constraints the reflow algorithm must respect
- Tasks pause outside channel operating hours and resume in the next window
- No overlapping tasks on the same channel
- All upstream dependencies must complete before a downstream task starts
- Tasks with `isRegulatoryHold: true` cannot be rescheduled
- No processing during blackout windows
