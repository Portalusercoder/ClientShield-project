/**
 * Shared security-oriented Zod helpers (Phase 6P3).
 */
import { z } from "zod";

/** CUID-like / Prisma id (loose but bounded). */
export const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid identifier");

export const entityIdObjectSchema = z.object({
  id: entityIdSchema,
});

/** Safe relative filename — no path traversal. */
export const safeFilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9._-]+$/, "Invalid filename")
  .refine((v) => !v.includes(".."), "Invalid filename");

/** Absolute http(s) URL with length bound. */
export const safeHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    "URL must be http or https"
  );

export const boundedString = (max: number) =>
  z.string().trim().min(1).max(max);

export const optionalBoundedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));
