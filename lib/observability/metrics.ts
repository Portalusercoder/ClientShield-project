/**
 * In-process metrics foundation (Phase 6P2).
 * No Prometheus export yet — counters only.
 */
import { getObservabilityConfig } from "./config";
import type { MetricName } from "./types";

const counters = new Map<MetricName, number>();

function enabled(): boolean {
  return getObservabilityConfig().enableMetrics;
}

export const metrics = {
  inc(name: MetricName, by = 1): void {
    if (!enabled()) return;
    counters.set(name, (counters.get(name) ?? 0) + by);
  },

  get(name: MetricName): number {
    return counters.get(name) ?? 0;
  },

  snapshot(): Record<MetricName, number> {
    const names: MetricName[] = [
      "requests",
      "errors",
      "worker_runs",
      "worker_failures",
      "wazuh_syncs",
      "notifications_produced",
      "investigations_created",
      "findings_created",
      "incidents_created",
    ];
    const out = {} as Record<MetricName, number>;
    for (const n of names) {
      out[n] = counters.get(n) ?? 0;
    }
    return out;
  },

  /** Test helper */
  reset(): void {
    counters.clear();
  },
};
