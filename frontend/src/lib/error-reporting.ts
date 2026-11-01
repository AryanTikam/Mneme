/**
 * Application error reporting utility.
 */

export function reportApplicationError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[Mneme Error]", error, context);
}
