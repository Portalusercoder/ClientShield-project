import { z } from "zod";

export const wazuhEnrollmentPlatformSchema = z.enum([
  "MACOS",
  "WINDOWS",
  "LINUX",
]);

export const wazuhEnrollmentArchSchema = z.enum(["ARM64", "X64"]);

const hostnameSchema = z
  .string()
  .trim()
  .min(1, "Hostname is required")
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid hostname");

const agentNameSchema = z
  .string()
  .trim()
  .min(1, "Agent name is required")
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid agent name");

export const prepareEnrollmentSchema = z.object({
  assetId: z.string().cuid("Invalid asset ID"),
  agentName: agentNameSchema,
  expectedHostname: hostnameSchema,
  platform: wazuhEnrollmentPlatformSchema,
  architecture: wazuhEnrollmentArchSchema,
  /** Non-secret connectivity hint only. */
  connectionHint: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export const enrollmentIdSchema = z.object({
  id: z.string().cuid("Invalid enrollment ID"),
});

export const mapEnrollmentAgentSchema = z.object({
  enrollmentId: z.string().cuid(),
  wazuhAgentId: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[0-9]+$/, "Agent ID must be numeric")
    .refine((v) => v !== "000", {
      message: "Manager agent 000 cannot be mapped",
    }),
  /** Required when remapping an agent already linked to another asset/client. */
  confirmRemap: z.boolean().optional().default(false),
});

export type PrepareEnrollmentInput = z.infer<typeof prepareEnrollmentSchema>;
export type MapEnrollmentAgentInput = z.infer<typeof mapEnrollmentAgentSchema>;
