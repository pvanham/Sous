import {
  viewportContextSchema,
  type ViewportContext,
} from "@/lib/validations/viewport-context.schema";

export interface ValidatedViewportContext {
  /** The parsed viewport data (safe to use as conversational context) */
  viewport: ViewportContext;
  /** Whether the user's access to viewport.locationId was verified */
  accessVerified: false;
}

/**
 * Parse raw input into a ViewportContext.
 * Strips unknown keys and trims strings.
 * Throws a user-friendly error on failure — never leaks Zod internals.
 */
export function parseViewportContext(raw: unknown): ViewportContext {
  if (raw === null || raw === undefined) {
    throw new Error("Viewport context is required but was not provided.");
  }

  const result = viewportContextSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "input";
        return `${path}: ${issue.message}`;
      })
      .join(", ");

    throw new Error(`Invalid viewport context: ${issues}`);
  }

  return result.data;
}
