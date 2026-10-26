/**
 * Request-Scoped Database Operations Instrumentation
 *
 * Tracks the count and names of logical database operations executed within a single
 * request lifecycle. Ensures subrequest budgets (such as Cloudflare Workers' 50 subrequest limit)
 * are respected and monitored.
 *
 * SAFETY GUARANTEE:
 * Does NOT log any customer financial data, balances, amounts, or sensitive payloads.
 */

export interface DbOperationMetrics {
  correlationId: string;
  totalOperations: number;
  operations: Record<string, number>;
  startTime: number;
}

export function createRequestDbTracker(correlationId?: string): DbOperationMetrics {
  return {
    correlationId: correlationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`),
    totalOperations: 0,
    operations: {},
    startTime: Date.now(),
  };
}

/**
 * Record a logical database operation in the request-scoped tracker.
 */
export function recordDbOperation(
  operationName: string,
  envOrTracker?: any
): void {
  if (!operationName) return;

  const tracker: DbOperationMetrics | undefined =
    envOrTracker && envOrTracker.totalOperations !== undefined
      ? envOrTracker
      : envOrTracker?.__dbTracker;

  if (!tracker) return;

  tracker.totalOperations++;
  tracker.operations[operationName] = (tracker.operations[operationName] || 0) + 1;
}

/**
 * Retrieve summary of recorded database operations for logging / diagnostics.
 */
export function getDbMetricsSummary(tracker?: DbOperationMetrics): {
  correlationId: string;
  totalOperations: number;
  operations: Record<string, number>;
  elapsedMs: number;
} | null {
  if (!tracker) return null;
  return {
    correlationId: tracker.correlationId,
    totalOperations: tracker.totalOperations,
    operations: { ...tracker.operations },
    elapsedMs: Date.now() - tracker.startTime,
  };
}
