import {
  useColorScheme as useRNColorScheme,
  type ColorSchemeName,
} from "react-native";

export type AppColorScheme = "light" | "dark";

export function normalizeColorScheme(
  scheme: ColorSchemeName | null | undefined,
): AppColorScheme {
  return scheme === "dark" ? "dark" : "light";
}

export function useColorScheme(): AppColorScheme {
  return normalizeColorScheme(useRNColorScheme());
}
