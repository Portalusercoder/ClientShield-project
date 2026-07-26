/**
 * Request / correlation context via AsyncLocalStorage (Phase 6P2).
 * Node.js server only — do not import from Edge middleware or Client Components.
 */
import { AsyncLocalStorage } from "async_hooks";
import type { ObservabilityContext } from "./types";

const storage = new AsyncLocalStorage<ObservabilityContext>();

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

export function requireObservabilityContext(): ObservabilityContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("Observability context is not established");
  }
  return ctx;
}

export function createObservabilityContext(
  partial?: Partial<ObservabilityContext>
): ObservabilityContext {
  const requestId = partial?.requestId?.trim() || newId();
  const correlationId = partial?.correlationId?.trim() || requestId;
  return {
    requestId,
    correlationId,
    organizationId: partial?.organizationId,
    userId: partial?.userId,
    service: partial?.service ?? "clientshield",
    action: partial?.action,
    securityEventId: partial?.securityEventId,
    investigationId: partial?.investigationId,
    findingId: partial?.findingId,
    incidentId: partial?.incidentId,
    workerId: partial?.workerId,
    meta: partial?.meta,
  };
}

/** Run fn inside a new (or merged) context. */
export function runWithObservabilityContext<T>(
  partial: Partial<ObservabilityContext> | undefined,
  fn: () => T
): T {
  const parent = storage.getStore();
  const next = createObservabilityContext({
    ...parent,
    ...partial,
    requestId: partial?.requestId ?? parent?.requestId,
    correlationId:
      partial?.correlationId ?? parent?.correlationId ?? partial?.requestId,
    meta: { ...parent?.meta, ...partial?.meta },
  });
  return storage.run(next, fn);
}

/**
 * Establish context for the rest of the current async chain (Server Actions).
 * Prefer runWithObservabilityContext when you control the call boundary.
 */
export function bindObservabilityContext(
  partial?: Partial<ObservabilityContext>
): ObservabilityContext {
  const parent = storage.getStore();
  if (parent) {
    if (partial?.organizationId) parent.organizationId = partial.organizationId;
    if (partial?.userId) parent.userId = partial.userId;
    if (partial?.action) parent.action = partial.action;
    if (partial?.service) parent.service = partial.service;
    if (partial?.securityEventId) parent.securityEventId = partial.securityEventId;
    if (partial?.investigationId) parent.investigationId = partial.investigationId;
    if (partial?.findingId) parent.findingId = partial.findingId;
    if (partial?.incidentId) parent.incidentId = partial.incidentId;
    if (partial?.workerId) parent.workerId = partial.workerId;
    if (partial?.correlationId) parent.correlationId = partial.correlationId;
    if (partial?.meta) parent.meta = { ...parent.meta, ...partial.meta };
    return parent;
  }
  const ctx = createObservabilityContext(partial);
  storage.enterWith(ctx);
  return ctx;
}

export function updateObservabilityContext(
  partial: Partial<ObservabilityContext>
): void {
  bindObservabilityContext(partial);
}

/** Derive a child correlation id for a workflow entity (stable, readable). */
export function workflowCorrelationId(
  kind: "se" | "inv" | "finding" | "incident" | "notif" | "worker",
  id: string
): string {
  const parent = storage.getStore()?.correlationId;
  const short = id.slice(0, 12);
  return parent ? `${parent}:${kind}:${short}` : `${kind}:${short}`;
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
