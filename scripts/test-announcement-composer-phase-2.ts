/**
 * Phase 2 — Announcement Composer helper smoke test.
 *
 * Covers helper contracts and schema alignment used by the composer UI.
 */

import { createAnnouncementSchema } from "../apps/web/src/lib/validations/announcement.schema";
import {
  composerDefaultValues,
  coerceDateTimeLocal,
  normalizeTag,
} from "../apps/web/src/lib/announcement/composer-defaults";
import { mockUploadAttachment } from "../apps/web/src/lib/announcement/mock-upload";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  console.log("Phase 2 announcement composer smoke test\n");

  const defaults = composerDefaultValues();
  assert(defaults.priority === "Standard", "defaults priority to Standard");
  assert(defaults.targetAudience[0] === "Global", "defaults audience to Global");
  assert(defaults.publishDate === null, "defaults publishDate to null");
  assert(defaults.attachments.length === 0, "defaults attachments to empty array");

  const validPayload = {
    ...defaults,
    title: "New prep checklist",
    body: "<p>Prep station updates for this weekend.</p>",
    priority: "Standard" as const,
    targetAudience: ["Global"],
    publishDate: new Date("2026-06-01T09:30:00.000Z"),
  };
  const parsedValid = createAnnouncementSchema.safeParse(validPayload);
  assert(parsedValid.success, "valid payload parses against createAnnouncementSchema");

  const invalidChronology = createAnnouncementSchema.safeParse({
    ...validPayload,
    expirationDate: new Date("2026-06-01T08:30:00.000Z"),
  });
  assert(
    !invalidChronology.success,
    "rejects expirationDate <= publishDate"
  );

  assert(
    normalizeTag(" Front of House ") === "front of house",
    "normalizeTag trims/lowercases/collapses whitespace"
  );
  assert(normalizeTag("") === null, "normalizeTag rejects empty values");
  assert(
    normalizeTag("a".repeat(33)) === null,
    "normalizeTag rejects values longer than 32 chars"
  );

  const coerced = coerceDateTimeLocal("2026-06-01T09:30");
  assert(
    Boolean(coerced) &&
      coerced instanceof Date &&
      !Number.isNaN(coerced.getTime()),
    "coerceDateTimeLocal parses datetime-local strings"
  );
  assert(
    coerceDateTimeLocal("") === null && coerceDateTimeLocal(null) === null,
    "coerceDateTimeLocal returns null for empty inputs"
  );

  const file = new File(["x"], "menu.pdf");
  const upload = await mockUploadAttachment(file);
  assert(upload.size === 1, "mockUploadAttachment returns file size");
  assert(upload.filename === "menu.pdf", "mockUploadAttachment returns file name");
  assert(
    upload.url.includes("menu.pdf") && upload.url.startsWith("https://"),
    "mockUploadAttachment returns a valid mock URL"
  );

  console.log(
    `\nResults: ${passed} passed, ${failed} failed`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
