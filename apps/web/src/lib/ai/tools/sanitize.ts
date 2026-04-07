const OPEN_TAG = "<untrusted_user_text>";
const CLOSE_TAG = "</untrusted_user_text>";

/**
 * Wraps user-generated text in XML delimiters to prevent prompt injection.
 * Returns the original text wrapped in <untrusted_user_text> tags.
 * Returns an empty string if input is null/undefined/empty.
 *
 * Strips any pre-existing tags before wrapping to prevent nested injection
 * (double-wrapping attack).
 */
export function sanitizeUserText(text: string | null | undefined): string {
  if (text == null || text === "") {
    return "";
  }

  const stripped = text.replaceAll(OPEN_TAG, "").replaceAll(CLOSE_TAG, "");

  if (stripped === "") {
    return "";
  }

  return `${OPEN_TAG}${stripped}${CLOSE_TAG}`;
}

/**
 * Sanitizes all string fields in an object that are flagged as user-generated.
 * Takes a record and a list of field names to sanitize.
 * Non-string fields are left untouched.
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  obj: T,
  fieldNames: (keyof T)[]
): T {
  const copy = { ...obj };

  for (const field of fieldNames) {
    const value = copy[field];
    if (typeof value === "string") {
      (copy as Record<string, unknown>)[field as string] = sanitizeUserText(
        value
      );
    }
  }

  return copy;
}
