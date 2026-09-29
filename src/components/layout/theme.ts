import { useEffect, useState } from 'react';

const THEME_KEY = 'mysimoka-admin:theme';
export type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // abaikan
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyInitialTheme(): void {
  document.documentElement.classList.toggle('dark', initialTheme() === 'dark');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // abaikan
    }
  }, [theme]);
  return [theme, () => setTheme(current => (current === 'dark' ? 'light' : 'dark'))];
}
