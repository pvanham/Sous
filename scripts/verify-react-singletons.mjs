#!/usr/bin/env node
/**
 * Postinstall guard: fail loudly if npm hoisting ever produces
 * more than one copy of React (or its siblings) in the tree.
 *
 * React Native 0.81.5 (Expo SDK 54) ships a renderer pinned to
 * React 19.1.0; any duplicate React instance in apps/mobile's
 * bundle crashes the app with "Incompatible React versions".
 * Duplicates in the web bundle are less catastrophic but still
 * produce subtle hook-identity bugs.
 *
 * We enforce this after every install so the drift surfaces
 * immediately — not three days later when somebody tries to
 * open the mobile app.
 *
 * If this script fails, read the "//overrides" note in the root
 * package.json and the comment block at the top of
 * apps/mobile/metro.config.js before loosening anything.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

const PINNED = {
  react: "19.1.0",
  "react-dom": "19.1.0",
  scheduler: "0.26.0",
};

// Hard stop on these dirs so we don't descend into vendored test
// fixtures (e.g. @expo/cli/static/canary-full/node_modules/react),
// which intentionally ship their own React copies and are never
// bundled into our apps.
const VENDOR_FIXTURE_SEGMENTS = [
  `${sep}static${sep}`,
  `${sep}__fixtures__${sep}`,
  `${sep}test${sep}fixtures${sep}`,
  `${sep}dist${sep}fixtures${sep}`,
];

const MAX_DEPTH = 6;

function collectNodeModulesDirs(dir, depth, acc) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (VENDOR_FIXTURE_SEGMENTS.some((seg) => full.includes(seg))) continue;
    if (entry.name === "node_modules") {
      acc.push(full);
      collectNodeModulesDirs(full, depth + 1, acc);
    } else {
      collectNodeModulesDirs(full, depth + 1, acc);
    }
  }
}

function readVersion(pkgDir) {
  const pkgPath = join(pkgDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")).version;
  } catch {
    return null;
  }
}

const nodeModulesDirs = [];
collectNodeModulesDirs(REPO_ROOT, 0, nodeModulesDirs);

let failed = false;

for (const [pkg, expected] of Object.entries(PINNED)) {
  const copies = [];
  for (const nm of nodeModulesDirs) {
    const candidate = join(nm, pkg);
    if (existsSync(join(candidate, "package.json"))) copies.push(candidate);
  }

  if (copies.length === 0) {
    console.error(`  x ${pkg}: not installed anywhere in the tree`);
    failed = true;
    continue;
  }

  const versions = new Map();
  for (const dir of copies) {
    const v = readVersion(dir);
    if (!v) continue;
    if (!versions.has(v)) versions.set(v, []);
    versions.get(v).push(relative(REPO_ROOT, dir));
  }

  const unique = [...versions.keys()];
  if (unique.length > 1) {
    console.error(`  x ${pkg}: ${unique.length} different versions installed`);
    for (const [v, dirs] of versions) {
      for (const d of dirs) console.error(`      ${v}  ${d}`);
    }
    failed = true;
    continue;
  }

  if (unique[0] !== expected) {
    console.error(
      `  x ${pkg}: expected ${expected}, got ${unique[0]} (override or pin drift)`,
    );
    failed = true;
    continue;
  }

  console.log(`  ok ${pkg}@${expected} (single copy)`);
}

if (failed) {
  console.error(
    "\nReact singleton check failed. See root package.json #overrides\n" +
      "and apps/mobile/metro.config.js for why this matters.\n" +
      "Most common cause: a new dependency introduced a peer on react >= 19.2\n" +
      "and npm auto-installed a second copy. Either pin it to an older\n" +
      "release compatible with the current Expo SDK, or bump Expo + React\n" +
      "in both apps together.\n",
  );
  process.exit(1);
}
