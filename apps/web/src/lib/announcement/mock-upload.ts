/**
 * Phase 2 — Announcement Composer
 * Replace with real signed-URL upload flow in later phases.
 */
export async function mockUploadAttachment(file: File): Promise<{
  url: string;
  filename: string;
  size: number;
}> {
  await new Promise((resolve) =>
    setTimeout(resolve, 250 + Math.floor(Math.random() * 401))
  );

  return {
    url: `https://mock-uploads.sous.local/${crypto.randomUUID()}/${encodeURIComponent(file.name)}`,
    filename: file.name,
    size: file.size,
  };
}
