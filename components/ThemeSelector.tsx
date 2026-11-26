"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "color-scheme";

function applyScheme(choice: ThemeChoice) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = choice === "system" ? "light dark" : choice;
  }
}

export function ThemeSelector() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        setChoice(stored);
      } else {
        setChoice("system");
      }
    } catch {
      setChoice("system");
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onMqChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: ThemeChoice =
        e.newValue === "light" || e.newValue === "dark" ? e.newValue : "system";
      setChoice(next);
      applyScheme(next);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function handleChange(next: ThemeChoice) {
    setChoice(next);
    applyScheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore storage errors when site data is restricted
    }
  }

  return (
    <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
      <span>테마</span>
      <select
        aria-label="테마 선택"
        value={choice}
        onChange={(e) => handleChange(e.target.value as ThemeChoice)}
        className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-sm text-[var(--text-primary)]"
      >
        <option value="system">
          시스템 (현재 {systemDark ? "다크" : "라이트"})
        </option>
        <option value="light">라이트</option>
        <option value="dark">다크</option>
      </select>
    </label>
  );
}
