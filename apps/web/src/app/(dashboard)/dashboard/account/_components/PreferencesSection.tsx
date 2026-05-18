"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ThemeOption = {
  value: "system" | "light" | "dark";
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "system",
    label: "System",
    description: "Match your operating system.",
    icon: Laptop,
  },
  {
    value: "light",
    label: "Light",
    description: "Warm parchment palette.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-light service mode.",
    icon: Moon,
  },
];

export function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // `next-themes` resolves the active theme on the client, so we delay
  // first paint of the radio state until mount to avoid a hydration
  // mismatch between SSR and the persisted preference.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const active = mounted ? theme ?? "system" : "system";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose how Sous looks on this device. Your choice is saved to
          this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Theme"
        >
          {THEME_OPTIONS.map((option) => {
            const isActive = active === option.value;
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-2 rounded border px-4 py-3 transition-colors",
                  isActive
                    ? "border-amber-700 bg-amber-700/10 dark:border-amber-600 dark:bg-amber-600/10"
                    : "border-stone-300 bg-card hover:bg-stone-100 dark:border-white/10 dark:hover:bg-stone-900",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  className="sr-only"
                  checked={isActive}
                  onChange={() => setTheme(option.value)}
                />
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-stone-700 dark:text-stone-300" />
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    {option.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </label>
            );
          })}
        </fieldset>
      </CardContent>
    </Card>
  );
}
