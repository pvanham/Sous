import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLocationContext } from "@/lib/auth/get-location-context";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  generateAttachmentKey,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/storage/keys";
import { buildPublicUrl, createUploadUrl } from "@/lib/storage/r2";

const requestBodySchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES),
    size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const json = (await req.json().catch(() => null)) as unknown;
    const parsed = requestBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request body.",
        },
        { status: 400 }
      );
    }

    const ctx = await getLocationContext(userId);

    const key = generateAttachmentKey({
      orgId: ctx.orgId,
      filename: parsed.data.filename,
    });

    const [uploadUrl, publicUrl] = await Promise.all([
      createUploadUrl({
        key,
        contentType: parsed.data.contentType,
        expiresInSeconds: 300,
      }),
      Promise.resolve(buildPublicUrl(key)),
    ]);

    return NextResponse.json({
      uploadUrl,
      publicUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/attachments/upload-url POST] failed:", message);
    return NextResponse.json(
      { error: "Failed to create upload URL." },
      { status: 500 }
    );
  }
}
