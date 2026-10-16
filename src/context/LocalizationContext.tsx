import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  SupportedLanguage,
  LanguageConfig,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  normalizeLanguageCode,
} from '../lib/i18n/languages';
import { resolveTranslatedContent } from '../lib/i18n/i18n';
import { en } from '../locales/en';
import { msMY } from '../locales/ms-MY';
import { zhCN } from '../locales/zh-CN';

const TRANSLATIONS: Record<SupportedLanguage, any> = {
  en,
  'ms-MY': msMY,
  'zh-CN': zhCN,
};

export interface LocalizationContextType {
  language: SupportedLanguage;
  locale: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  setLocale: (lang: SupportedLanguage) => void;
  supportedLanguages: LanguageConfig[];
  currentLanguageConfig: LanguageConfig;
  t: (key: string, params?: Record<string, any>, fallback?: string) => string;
  resolveContent: (translations: any, original: string, field: string, sourceLang?: SupportedLanguage) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function interpolate(text: string, params?: Record<string, any>): string {
  if (!params || typeof text !== 'string') return text;
  return text
    .replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
      return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
    })
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
      return params[key] !== undefined ? String(params[key]) : `{${key}}`;
    });
}

export const LocalizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          if (isSupportedLanguage(stored)) return stored;
        }
      } catch {
        // Ignore storage access errors
      }

      // Check navigator.language
      try {
        const navLang = typeof navigator !== 'undefined' ? navigator.language : undefined;
        if (navLang) {
          if (navLang.startsWith('zh')) return 'zh-CN';
          if (navLang.startsWith('ms')) return 'ms-MY';
        }
      } catch {
        // Ignore navigator errors
      }
    }
    return DEFAULT_LANGUAGE;
  });

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    const normalized = normalizeLanguageCode(lang);
    setLanguageState(normalized);
    if (typeof window !== 'undefined') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
        }
      } catch {
        // Ignore storage write errors
      }
      try {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.lang = normalized;
        }
      } catch {
        // Ignore DOM write errors
      }
    }
  }, []);

  const setLocale = setLanguage;
  const locale = language;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const currentLanguageConfig = useMemo(() => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.code === language) ||
      SUPPORTED_LANGUAGES[0]
    );
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, any>, fallback?: string): string => {
      // 1. Try current language
      const val = getNestedValue(TRANSLATIONS[language], key);
      if (typeof val === 'string') {
        return interpolate(val, params);
      }

      // 2. Fall back to English
      if (language !== 'en') {
        const enVal = getNestedValue(TRANSLATIONS.en, key);
        if (typeof enVal === 'string') {
          return interpolate(enVal, params);
        }
      }

      // 3. Fall back to provided fallback or key
      if (fallback !== undefined) {
        return interpolate(fallback, params);
      }

      return key;
    },
    [language]
  );

  const resolveContent = useCallback(
    (translations: any, original: string, field: string, sourceLang?: SupportedLanguage): string => {
      return resolveTranslatedContent(original, field, translations, language, sourceLang);
    },
    [language]
  );

  const value: LocalizationContextType = useMemo(
    () => ({
      language,
      locale,
      setLanguage,
      setLocale,
      supportedLanguages: SUPPORTED_LANGUAGES,
      currentLanguageConfig,
      t,
      resolveContent,
    }),
    [language, locale, setLanguage, currentLanguageConfig, t, resolveContent]
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = (): LocalizationContextType => {
  const context = useContext(LocalizationContext);
  if (!context) {
    // Graceful fallback if rendered outside provider
    return {
      language: DEFAULT_LANGUAGE,
      locale: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      setLocale: () => {},
      supportedLanguages: SUPPORTED_LANGUAGES,
      currentLanguageConfig: SUPPORTED_LANGUAGES[0],
      t: (key: string, _params?: any, fallback?: string) => fallback || key,
      resolveContent: (_translations: any, original: string) => original,
    };
  }
  return context;
};
