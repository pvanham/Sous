module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
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
