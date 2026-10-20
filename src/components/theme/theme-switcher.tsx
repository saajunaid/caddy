"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "./theme-script";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const CHANGE_EVENT = "caddy-theme-change";

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode). The choice still applies for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeSwitcher() {
  const choice = useSyncExternalStore<ThemeChoice>(
    subscribe,
    readChoice,
    () => "system",
  );

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex w-fit overflow-hidden rounded-[9px] border border-line"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={choice === option.value}
          onClick={() => applyTheme(option.value)}
          className="min-h-10 px-3.5 text-sm font-semibold text-muted aria-pressed:bg-accent aria-pressed:text-on-accent"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
