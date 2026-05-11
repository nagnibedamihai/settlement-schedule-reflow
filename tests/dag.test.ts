import { describe, it, expect } from 'vitest';
import { TaskDAG } from '../src/reflow/dag.js';

describe('TaskDAG', () => {
  it('topological sort returns valid ordering for linear chain', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'C');
    dag.addEdge('C', 'D');

    const sorted = dag.topologicalSort();
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
  });

  it('topological sort handles diamond dependencies', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('A', 'C');
    dag.addEdge('B', 'D');
    dag.addEdge('C', 'D');

    const sorted = dag.topologicalSort();
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
  });

  it('detects cycle and returns cycle path', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'C');
    dag.addEdge('C', 'A');

    const result = dag.detectCycle();
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toBeDefined();
    expect(result.cycle!.length).toBeGreaterThanOrEqual(3);
    // Cycle should contain A, B, C
    expect(result.cycle!).toContain('A');
    expect(result.cycle!).toContain('B');
    expect(result.cycle!).toContain('C');
  });

  it('topological sort throws on cycle with descriptive message', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'A');

    expect(() => dag.topologicalSort()).toThrow('Circular dependency detected');
  });

  it('returns no cycle for valid DAG', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'C');

    const result = dag.detectCycle();
    expect(result.hasCycle).toBe(false);
    expect(result.cycle).toBeUndefined();
  });

  it('handles isolated nodes', () => {
    const dag = new TaskDAG();
    dag.addNode('X');
    dag.addNode('Y');
    dag.addNode('Z');

    const sorted = dag.topologicalSort();
    expect(sorted).toHaveLength(3);
    expect(new Set(sorted)).toEqual(new Set(['X', 'Y', 'Z']));
  });

  it('getDependents returns transitive downstream', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'C');
    dag.addEdge('B', 'D');

    const deps = dag.getDependents('A');
    expect(deps).toEqual(new Set(['B', 'C', 'D']));
  });

  it('getAncestors returns transitive upstream', () => {
    const dag = new TaskDAG();
    dag.addEdge('A', 'C');
    dag.addEdge('B', 'C');
    dag.addEdge('C', 'D');

    const ancestors = dag.getAncestors('D');
    expect(ancestors).toEqual(new Set(['A', 'B', 'C']));
  });
});
