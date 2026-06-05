module.exports = function (api) {
  api.cache(true);
  return {
    // `unstable_transformImportMeta` rewrites `import.meta` so the web
    // (react-native-web) bundle can run as a classic <script>. Metro resolves
    // some ESM-only dependencies (e.g. zustand's `import` export condition,
    // ./esm/index.mjs) which use `import.meta`; without this transform the web
    // bundle throws "Cannot use 'import meta' outside a module" and renders a
    // blank page. Native is unaffected (zustand resolves its CommonJS
    // `react-native` condition there). This flag becomes the default in Expo
    // SDK 56, at which point it can be removed.
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    // `react-native-worklets/plugin` is the Reanimated v4 successor to
    // `react-native-reanimated/plugin`. It must be listed LAST so it
    // sees the final AST after every other transform. Without it, any
    // module that touches a worklet (Reanimated, the worklets runtime
    // itself, gesture-handler animations, etc.) throws
    // `[WorkletsError] Failed to create a worklet` at evaluation time
    // — which then cascades into "Route is missing default export"
    // warnings for every Expo Router file because the route module
    // never finishes loading.
    plugins: ["react-native-worklets/plugin"],
  };
};
