/**
 * Backfill Script: KitchenConfig.weekStartsOn
 *
 * Adds the new `weekStartsOn` field (defaulting to `"monday"`) to any
 * existing `KitchenConfig` documents that predate the
 * per-location-week-start feature. Mongoose schema-level defaults do not
 * retroactively populate existing rows, so this one-shot migration is
 * what guarantees every tenant has the field after the change ships.
 *
 * The script is **idempotent** — re-running it after success reports zero
 * updates because the `$exists: false` filter no longer matches.
 *
 * Two run modes:
 *
 *   npx tsx scripts/backfill-week-starts-on.ts             # dry-run (default)
 *   npx tsx scripts/backfill-week-starts-on.ts --apply     # writes
 *
 * Required env (read from `apps/web/.env.local`):
 *   - MONGODB_URI            Mongo Atlas connection string
 *
 * IMPORTANT: Back your database up before passing `--apply`.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ENV_PATH = path.resolve(__dirname, "..", "apps", "web", ".env.local");
dotenv.config({ path: WEB_ENV_PATH });

import mongoose from "mongoose";
import KitchenConfig from "../apps/web/src/server/models/KitchenConfig";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set. Add it to apps/web/.env.local before running.",
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to ${maskUri(uri)}`);
  console.log(APPLY ? "Mode: APPLY (writes)" : "Mode: DRY-RUN (no writes)");

  const candidateCount = await KitchenConfig.countDocuments({
    weekStartsOn: { $exists: false },
  });

  console.log(
    `Found ${candidateCount} KitchenConfig document(s) without weekStartsOn.`,
  );

  if (candidateCount === 0) {
    console.log("Nothing to backfill — schema is already aligned.");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log(
      "Re-run with --apply to set weekStartsOn=\"monday\" on those documents.",
    );
    await mongoose.disconnect();
    return;
  }

  const result = await KitchenConfig.updateMany(
    { weekStartsOn: { $exists: false } },
    { $set: { weekStartsOn: "monday" } },
  );

  console.log(
    `Backfill complete — matched: ${result.matchedCount}, modified: ${result.modifiedCount}.`,
  );

  // Sanity check: re-count to confirm zero rows still missing the field.
  const remaining = await KitchenConfig.countDocuments({
    weekStartsOn: { $exists: false },
  });
  if (remaining !== 0) {
    console.error(
      `Backfill incomplete: ${remaining} document(s) still missing weekStartsOn.`,
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  await mongoose.disconnect();
}

function maskUri(uri: string): string {
  return uri.replace(/:[^:@/]+@/, ":***@");
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore disconnect errors during failure path */
  }
  process.exit(1);
});
