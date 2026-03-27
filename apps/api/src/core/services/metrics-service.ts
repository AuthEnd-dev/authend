import { getRealtimeDiagnostics } from "./realtime-service";

export type MetricsFlow = "auth" | "crud" | "storage" | "realtime" | "webhook";

type FlowMetric = {
  requestsTotal: number;
  errorsTotal: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

const flowMetrics: Record<MetricsFlow, FlowMetric> = {
  auth: { requestsTotal: 0, errorsTotal: 0, totalDurationMs: 0, maxDurationMs: 0 },
  crud: { requestsTotal: 0, errorsTotal: 0, totalDurationMs: 0, maxDurationMs: 0 },
  storage: { requestsTotal: 0, errorsTotal: 0, totalDurationMs: 0, maxDurationMs: 0 },
  realtime: { requestsTotal: 0, errorsTotal: 0, totalDurationMs: 0, maxDurationMs: 0 },
  webhook: { requestsTotal: 0, errorsTotal: 0, totalDurationMs: 0, maxDurationMs: 0 },
};

const webhookMetrics = {
  dispatchesTotal: 0,
  deliveriesSucceeded: 0,
  deliveriesFailed: 0,
};

function averageDuration(metric: FlowMetric) {
  if (metric.requestsTotal === 0) {
    return 0;
  }
  return Math.round(metric.totalDurationMs / metric.requestsTotal);
}

export function classifyMetricsFlow(path: string): MetricsFlow | null {
  if (path.startsWith("/api/auth") || path.startsWith("/api/admin/auth")) {
    return "auth";
  }
  if (path.startsWith("/api/data") || path.startsWith("/api/admin/data")) {
    return "crud";
  }
  if (path.startsWith("/api/storage")) {
    return "storage";
  }
  if (path.startsWith("/api/realtime") || path.startsWith("/api/admin/realtime")) {
    return "realtime";
  }
  if (path.startsWith("/api/admin/webhooks")) {
    return "webhook";
  }
  return null;
}

export function recordFlowRequestMetric(flow: MetricsFlow, status: number, durationMs: number) {
  const metric = flowMetrics[flow];
  metric.requestsTotal += 1;
  metric.totalDurationMs += durationMs;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
  if (status >= 400) {
    metric.errorsTotal += 1;
  }
}

export function recordWebhookDispatchMetric(result: "attempt" | "success" | "failure") {
  if (result === "attempt") {
    webhookMetrics.dispatchesTotal += 1;
    return;
  }
  if (result === "success") {
    webhookMetrics.deliveriesSucceeded += 1;
    return;
  }
  webhookMetrics.deliveriesFailed += 1;
}

export function getRuntimeMetrics() {
  const realtime = getRealtimeDiagnostics();

  return {
    flows: {
      auth: { ...flowMetrics.auth, averageDurationMs: averageDuration(flowMetrics.auth) },
      crud: { ...flowMetrics.crud, averageDurationMs: averageDuration(flowMetrics.crud) },
      storage: { ...flowMetrics.storage, averageDurationMs: averageDuration(flowMetrics.storage) },
      realtime: {
        ...flowMetrics.realtime,
        averageDurationMs: averageDuration(flowMetrics.realtime),
        connections: realtime.connections,
        subscriptions: realtime.subscriptions,
        eventsSentTotal: realtime.eventsSentTotal,
      },
      webhook: {
        ...flowMetrics.webhook,
        averageDurationMs: averageDuration(flowMetrics.webhook),
        dispatchesTotal: webhookMetrics.dispatchesTotal,
        deliveriesSucceeded: webhookMetrics.deliveriesSucceeded,
        deliveriesFailed: webhookMetrics.deliveriesFailed,
      },
    },
  };
}
