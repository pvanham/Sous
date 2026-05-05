import { useEffect, useState } from "react";
import {
  useColorScheme as useRNColorScheme,
  type ColorSchemeName,
} from "react-native";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export type AppColorScheme = "light" | "dark";

export function normalizeColorScheme(
  scheme: ColorSchemeName | null | undefined,
): AppColorScheme {
  return scheme === "dark" ? "dark" : "light";
}

export function useColorScheme(): AppColorScheme {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return normalizeColorScheme(colorScheme);
  }

  return "light";
}
