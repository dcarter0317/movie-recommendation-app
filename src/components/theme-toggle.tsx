"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

type ThemeChoice = "dark" | "light" | "system";

const ORDER: readonly ThemeChoice[] = ["dark", "light", "system"] as const;

const META: Record<ThemeChoice, { label: string; Icon: typeof Moon }> = {
  dark: { label: "Dark", Icon: Moon },
  light: { label: "Light", Icon: Sun },
  system: { label: "System", Icon: Monitor },
};

/**
 * Cycles the theme dark -> light -> system. Persists via `next-themes`.
 * Until mounted it renders a stable, inert placeholder so it never
 * hydration mismatches on the static marketing pages.
 */
const EMPTY_SUBSCRIBE = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // false on the server and the first client render, true thereafter, with no
  // state-in-effect. Keeps the pre-mount markup stable so it never hydration
  // mismatches on the static marketing pages.
  const mounted = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <Button type="button" variant="ghost" size="icon" disabled aria-hidden tabIndex={-1}>
        <Monitor />
      </Button>
    );
  }

  const current: ThemeChoice = theme === "light" || theme === "system" ? theme : "dark";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const { Icon } = META[current];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${META[current].label}. Switch to ${META[next].label}.`}
    >
      <Icon />
    </Button>
  );
}
