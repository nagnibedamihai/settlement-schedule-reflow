/**
 * Directed Acyclic Graph for settlement task dependency management.
 * Provides topological sorting (Kahn's algorithm) and cycle detection (DFS three-color).
 */

export class TaskDAG {
  private children = new Map<string, Set<string>>(); // node -> direct dependents
  private parents = new Map<string, Set<string>>();   // node -> direct dependencies

  addNode(id: string): void {
    if (!this.children.has(id)) this.children.set(id, new Set());
    if (!this.parents.has(id)) this.parents.set(id, new Set());
  }

  /** Add a dependency edge: `from` must complete before `to` can start. */
  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.children.get(from)!.add(to);
    this.parents.get(to)!.add(from);
  }

  /**
   * DFS three-color cycle detection.
   * Returns the cycle path if one exists, e.g. ["A", "B", "C", "A"].
   */
  detectCycle(): { hasCycle: boolean; cycle?: string[] } {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const id of this.children.keys()) {
      color.set(id, WHITE);
    }

    for (const start of this.children.keys()) {
      if (color.get(start) !== WHITE) continue;

      const stack: string[] = [start];
      while (stack.length > 0) {
        const node = stack[stack.length - 1]!;

        if (color.get(node) === WHITE) {
          color.set(node, GRAY);
          const children = this.children.get(node)!;
          for (const child of children) {
            if (color.get(child) === GRAY) {
              // Found a cycle — reconstruct path
              const cycle = [child];
              let cur = node;
              while (cur !== child) {
                cycle.push(cur);
                cur = parent.get(cur) ?? child;
              }
              cycle.push(child);
              cycle.reverse();
              return { hasCycle: true, cycle };
            }
            if (color.get(child) === WHITE) {
              parent.set(child, node);
              stack.push(child);
            }
          }
        } else {
          color.set(node, BLACK);
          stack.pop();
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Kahn's algorithm: BFS-based topological sort.
   * Throws if the graph contains a cycle.
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    for (const id of this.children.keys()) {
      inDegree.set(id, 0);
    }
    for (const [, children] of this.children) {
      for (const child of children) {
        inDegree.set(child, (inDegree.get(child) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const child of this.children.get(node) ?? []) {
        const newDeg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) queue.push(child);
      }
    }

    if (sorted.length !== this.children.size) {
      const cycleResult = this.detectCycle();
      const cyclePath = cycleResult.cycle?.join(' → ') ?? 'unknown';
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }

    return sorted;
  }

  /** Transitive closure of forward adjacency — all downstream dependents. */
  getDependents(id: string): Set<string> {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const child of this.children.get(node) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          stack.push(child);
        }
      }
    }
    return result;
  }

  /** Transitive closure of reverse adjacency — all upstream ancestors. */
  getAncestors(id: string): Set<string> {
    const result = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const node = stack.pop()!;
      for (const p of this.parents.get(node) ?? []) {
        if (!result.has(p)) {
          result.add(p);
          stack.push(p);
        }
      }
    }
    return result;
  }

  get nodeCount(): number {
    return this.children.size;
  }
}
