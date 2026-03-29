/**
 * Task dependency graph resolution — topological sort with parallel batch grouping.
 */

export interface TaskDep {
  taskId: string;
  dependencies: string[];
  agent: string;
}

/**
 * Resolves a set of tasks into execution batches.
 * Each batch contains tasks that can run in parallel.
 * Batches are ordered: batch N must complete before batch N+1 starts.
 */
export class DependencyResolver {
  resolve(tasks: TaskDep[]): string[][] {
    const taskMap = new Map<string, TaskDep>();
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Build graph
    for (const task of tasks) {
      taskMap.set(task.taskId, task);
      inDegree.set(task.taskId, task.dependencies.length);
      adjList.set(task.taskId, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependencies) {
        const dependents = adjList.get(dep);
        if (dependents) {
          dependents.push(task.taskId);
        }
      }
    }

    // Kahn's algorithm with batch grouping
    const batches: string[][] = [];
    let queue = Array.from(inDegree.entries())
      .filter(([_, degree]) => degree === 0)
      .map(([id]) => id);

    while (queue.length > 0) {
      batches.push([...queue]);

      const nextQueue: string[] = [];
      for (const taskId of queue) {
        const dependents = adjList.get(taskId) || [];
        for (const dep of dependents) {
          const degree = (inDegree.get(dep) || 0) - 1;
          inDegree.set(dep, degree);
          if (degree === 0) {
            nextQueue.push(dep);
          }
        }
      }
      queue = nextQueue;
    }

    // Detect cycles
    const resolved = batches.flat();
    if (resolved.length !== tasks.length) {
      const unresolved = tasks.filter((t) => !resolved.includes(t.taskId)).map((t) => t.taskId);
      throw new Error(`Circular dependency detected among tasks: ${unresolved.join(', ')}`);
    }

    return batches;
  }
}
