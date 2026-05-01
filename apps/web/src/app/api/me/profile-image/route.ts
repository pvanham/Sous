import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { StaffService } from "@/server/services/staff.service";
import { OrganizationMemberService } from "@/server/services/organization-member.service";

// ─────────────────────────────────────────────────────────────
// POST /api/me/profile-image  — sync the caller's Clerk-hosted
// avatar URL into our local Staff / OrganizationMember rows.
//
// Why this route exists
//   Profile pictures are uploaded directly to Clerk via the
//   `setProfileImage` API on the client (`@clerk/nextjs` for web,
//   `@clerk/clerk-expo` for mobile). Clerk hosts the file and
//   exposes a stable `image_url`. We mirror that URL into Mongo so
//   roster lists / schedules / dashboards can render avatars without
//   a per-row Clerk API call.
//
//   The mirror is intentionally a one-way pull: the client tells us
//   "here is the URL Clerk gave me", we re-fetch the canonical user
//   record from Clerk to verify, then `$set` it on every Staff and
//   OrganizationMember row linked to that Clerk user.
//
// Auth
//   `auth()` resolves the caller's Clerk user. The client never
//   supplies the Clerk user id — we trust only the JWT.
//
// Body
//   No body is required; the route always reads the latest
//   `image_url` from Clerk for the caller. A no-op `{}` body is
//   accepted. Sending `{ "imageUrl": null }` is a request to clear
//   the avatar (e.g. after the user deletes their image in Clerk's
//   account portal); the route then writes `null` instead of the
//   Clerk-supplied URL.
//
// Response
//   `{ imageUrl: string | null }` — the URL that was written to Mongo
//   (or null if the image was cleared).
// ─────────────────────────────────────────────────────────────

const requestBodySchema = z
  .object({
    /**
     * Optional explicit override. When `null`, the route clears the
     * mirrored URL on every Staff / membership row instead of pulling
     * the latest URL from Clerk. When omitted (or a non-empty string),
     * the route ignores the body and pulls Clerk's canonical
     * `image_url` instead.
     */
    imageUrl: z.string().url().nullable().optional(),
  })
  .strict()
  .optional();

export async function POST(req: Request): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    let parsed: z.infer<typeof requestBodySchema> = undefined;
    const rawText = await req.text().catch(() => "");
    if (rawText.trim().length > 0) {
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        return NextResponse.json(
          { error: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
      const result = requestBodySchema.safeParse(json);
      if (!result.success) {
        return NextResponse.json(
          {
            error:
              result.error.issues[0]?.message ?? "Invalid request body.",
          },
          { status: 400 },
        );
      }
      parsed = result.data;
    }

    // Determine the URL to mirror. An explicit `null` clears; any
    // other request pulls the canonical URL from Clerk. We never
    // trust a client-supplied URL string outright — it would let a
    // compromised client point our Mongo record at any host.
    let nextImageUrl: string | null;
    if (parsed && parsed.imageUrl === null) {
      nextImageUrl = null;
    } else {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const clerkImageUrl = user.imageUrl ?? null;
      // Clerk always returns *some* `image_url` (it falls back to the
      // gravatar / initials default). `hasImage` is the bit that
      // tells us whether the user actually uploaded one. When false
      // we mirror null so the UI uses our own initials fallback
      // instead of Clerk's.
      nextImageUrl = user.hasImage ? clerkImageUrl : null;
    }

    await dbConnect();
    await Promise.all([
      StaffService.setImageUrlForClerkUser(userId, nextImageUrl),
      OrganizationMemberService.setImageUrlForClerkUser(userId, nextImageUrl),
    ]);

    return NextResponse.json({ imageUrl: nextImageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/profile-image POST] failed:", message);
    return NextResponse.json(
      { error: "Failed to sync profile image." },
      { status: 500 },
    );
  }
}
