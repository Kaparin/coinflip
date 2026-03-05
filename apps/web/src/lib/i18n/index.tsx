'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import en from './en.json';
import ru from './ru.json';
import { isAxmMode } from '@/lib/constants';

export type Locale = 'en' | 'ru';

const translations: Record<Locale, Record<string, unknown>> = { en, ru };

const STORAGE_KEY = 'coinflip-locale';

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/** In AXM mode, replace "COIN" token references with "AXM" in translated strings */
const _axmMode = isAxmMode();
function postProcess(str: string): string {
  if (!_axmMode) return str;
  return str.replace(/\bCOIN\b/g, 'AXM');
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  let result = template;
  if (vars) {
    result = result.replace(/\{(\w+)\}/g, (_, key) => {
      const val = vars[key];
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }
  return postProcess(result);
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function useTranslation() {
  return useContext(I18nContext);
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'ru') return stored;
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(getInitialLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const currentLocale = mounted ? locale : 'en';
    const value = getNestedValue(translations[currentLocale], key);
    if (value) return interpolate(value, vars);
    // Fallback to English
    const fallback = getNestedValue(translations.en, key);
    if (fallback) return interpolate(fallback, vars);
    return key;
  }, [locale, mounted]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
