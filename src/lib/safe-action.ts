export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<ActionResponse<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    return { success: false, error: message };
  }
}
