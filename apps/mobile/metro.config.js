const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/**
 * Monorepo-aware Metro config.
 *
 * Why this file exists
 * ────────────────────
 * React Native 0.83.6 (Expo SDK 55) supports React 19.2.x.
 * Running it against another React build can crash
 * with "Incompatible React versions" (see root package.json's
 * `//overrides` note for the full story).
 *
 * Inside an npm-workspaces monorepo, hoisting plus peer
 * auto-installation can produce *two* React copies in the tree —
 * one at the hoisted root and one nested under apps/mobile — which
 * Metro happily bundles together. Two Reacts = guaranteed runtime
 * crash.
 *
 * Defence in depth:
 *   1. Root `package.json` declares react/react-dom directly and
 *      pins them (plus `scheduler`) via `overrides` so npm
 *      collapses the whole tree to a single version.
 *   2. (Here) Metro is told to watch the monorepo root so workspace
 *      packages resolve, and every "must-be-singleton" React-family
 *      module is aliased to whatever `require.resolve` finds from
 *      *this* app's perspective. That guarantees a single identity
 *      even if hoisting shifts between installs.
 *
 * Add to `SINGLETON_PACKAGES` whenever you introduce another library
 * that relies on module-level mutable state (context providers,
 * event emitters, native bridges, etc.) and would break under
 * duplicate instances.
 */

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Extend (don't overwrite) the defaults — `expo/metro-config` sets up
// its own `watchFolders` and `expo doctor` warns when those entries
// disappear. We only need to *add* the monorepo root so workspace
// packages (`@sous/types`, `@sous/config`) resolve.
const defaultWatchFolders = config.watchFolders ?? [];
if (!defaultWatchFolders.includes(monorepoRoot)) {
  config.watchFolders = [...defaultWatchFolders, monorepoRoot];
}

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// IMPORTANT: do NOT set `disableHierarchicalLookup: true` here.
// Several third-party RN packages (notably react-native-reanimated)
// bundle their own nested `node_modules/<dep>` to pin transitive
// versions — most visibly semver@7 for the worklets validator. With
// hierarchical lookup disabled, Metro can't see those nested copies
// and falls back to whatever the monorepo root hoisted, which may be
// a different major version (semver@6 has no `functions/` subpath).
// The singleton guarantees we actually need come from
// `extraNodeModules` below, which take precedence over the normal
// resolution walk anyway.

const SINGLETON_PACKAGES = [
  "react",
  "react-dom",
  "react-native",
  "react-native-web",
  "scheduler",
  "@clerk/clerk-expo",
  "@clerk/shared",
];

// Resolve each singleton to a concrete directory by walking the
// same `node_modules` chain Metro itself will use. Prefer the
// app's own `node_modules` (when a dep can't be hoisted) and fall
// back to the monorepo root. Using `fs.existsSync` instead of
// `require.resolve` avoids tripping over packages that restrict
// `./package.json` in their `exports` field (e.g. @clerk/*).
const fs = require("fs");
const candidateRoots = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

const singletonAliases = {};
for (const pkg of SINGLETON_PACKAGES) {
  const hit = candidateRoots
    .map((root) => path.join(root, pkg))
    .find((dir) => fs.existsSync(path.join(dir, "package.json")));
  if (hit) singletonAliases[pkg] = hit;
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...singletonAliases,
};

module.exports = withNativewind(config);
