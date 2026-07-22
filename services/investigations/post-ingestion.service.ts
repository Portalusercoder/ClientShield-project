import { expirePendingCandidates } from "@/services/investigations/investigation-quality.service";
import { generateCandidatesForEvent } from "@/services/investigations/correlation.service";
import { suggestGroupsFromPendingCandidates } from "@/services/investigations/investigation.service";
import { extractAndLinkObservablesFromSecurityEvent } from "@/services/investigations/observable.service";
import { serverEnv } from "@/lib/env";

function logPost(
  level: "info" | "warn" | "error",
  message: string,
  meta?: object
) {
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "post-ingestion.service",
      level,
      message,
      ...meta,
    })
  );
}

/**
 * Post-ingestion hooks for investigation observables + cross-event correlation.
 *
 * MUST NEVER throw to the worker/sync caller in a way that breaks sync.
 * Does NOT create incidents. Does NOT auto-confirm campaigns/investigations.
 * Does NOT touch Wazuh occurrence correlation / checkpoints.
 */
export async function runPostIngestionInvestigationHooks(
  organizationId: string,
  options: { createdEventIds: string[] }
): Promise<void> {
  try {
    const createdEventIds = [...new Set(options.createdEventIds.filter(Boolean))];

    for (const eventId of createdEventIds) {
      try {
        await extractAndLinkObservablesFromSecurityEvent(eventId);
      } catch (error) {
        logPost("warn", "Observable extraction failed (isolated)", {
          organizationId,
          eventId,
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      }

      if (serverEnv.INVESTIGATION_CORRELATION_ENABLED) {
        try {
          await generateCandidatesForEvent(organizationId, eventId);
        } catch (error) {
          logPost("warn", "Correlation candidate generation failed (isolated)", {
            organizationId,
            eventId,
            error:
              error instanceof Error ? error.message.slice(0, 200) : "unknown",
          });
        }
      }
    }

    // Optionally suggest OPEN SYSTEM_SUGGESTED groups for quality-qualified clusters.
    // Never auto-CONFIRMED. Never creates incidents.
    if (
      serverEnv.INVESTIGATION_CORRELATION_ENABLED &&
      createdEventIds.length > 0
    ) {
      try {
        await expirePendingCandidates(organizationId);
      } catch (error) {
        logPost("warn", "expirePendingCandidates failed (isolated)", {
          organizationId,
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      }
      try {
        await suggestGroupsFromPendingCandidates(organizationId);
      } catch (error) {
        logPost("warn", "suggestGroupsFromPendingCandidates failed (isolated)", {
          organizationId,
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      }
    }
  } catch (error) {
    // Absolute outer guard — never propagate to sync worker
    logPost("error", "runPostIngestionInvestigationHooks failed (swallowed)", {
      organizationId,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
}
