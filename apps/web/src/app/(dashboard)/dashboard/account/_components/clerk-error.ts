import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

/**
 * Pulls a human-readable message off either a Clerk API error
 * (`errors[].longMessage` is what Clerk recommends surfacing in UI)
 * or a generic `Error`. Falls back to the supplied default so call
 * sites can scope the message to the action they were attempting.
 */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ?? err.errors?.[0]?.message ?? fallback
    );
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
