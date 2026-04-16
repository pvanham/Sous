/**
 * Generate a random 24-character hex string that passes the
 * server-side `/^[a-f\d]{24}$/i` ObjectId validation.
 *
 * Uses `crypto.getRandomValues` (available in all modern browsers
 * and Node 19+) so no server-only imports are needed.
 */
export function generateObjectId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
