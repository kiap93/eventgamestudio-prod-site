/**
 * Centralized I18n Core Engine
 * Event Game Studio
 */

import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  normalizeLanguageCode,
} from './languages';
import { LOCALES, TranslationSchema } from '../../locales';

export type TranslationKey = string;
export type InterpolationParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Traverses an object using dot notation path (e.g. 'common.start' or 'game.catchBrand.instructions').
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Replaces {{param}} tokens in a template string.
 */
export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{{1,2}\s*([a-zA-Z0-9_-]+)\s*\}{1,2}/g, (_, key) => {
    const val = params[key];
    if (val === undefined || val === null) {
      return '';
    }
    return String(val);
  });
}

/**
 * Detects initial language based on the 5-step authoritative priority:
 * 1. Explicit user selection in URL query param (e.g., ?lang=zh-CN)
 * 2. Persisted user/browser preference in localStorage ('app_language')
 * 3. Browser navigator language (navigator.language)
 * 4. English fallback ('en')
 */
export function detectInitialLanguage(): SupportedLanguage {
  // 1. URL Query parameter (?lang=...)
  if (typeof window !== 'undefined' && window.location) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlLang = searchParams.get('lang');
      if (urlLang) {
        const normalized = normalizeLanguageCode(urlLang);
        if (isSupportedLanguage(normalized)) {
          return normalized;
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // 2. Persisted preference from localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && isSupportedLanguage(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage access errors
    }
  }

  // 3. Browser navigator language
  if (typeof navigator !== 'undefined' && navigator.language) {
    const browserLang = normalizeLanguageCode(navigator.language);
    if (isSupportedLanguage(browserLang)) {
      return browserLang;
    }
  }

  // 4. Default fallback
  return DEFAULT_LANGUAGE;
}

/**
 * Persists selected language to localStorage.
 */
export function persistLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

/**
 * Returns the currently active/persisted language code.
 */
export function getCurrentLanguage(): SupportedLanguage {
  return detectInitialLanguage();
}

/**
 * Main translation lookup function.
 * Supports dot notation, fallback chain (requested -> en -> safe key), and interpolation.
 */
export function translate(
  lang: SupportedLanguage,
  key: string,
  params?: InterpolationParams,
  defaultValue?: string
): string {
  if (!key) return defaultValue || '';

  const activeLocale = LOCALES[lang] || LOCALES[DEFAULT_LANGUAGE];
  const fallbackLocale = LOCALES[DEFAULT_LANGUAGE];

  // Pluralization key check if count is passed
  let resolvedKey = key;
  if (params && typeof params.count === 'number' && params.count > 1) {
    const pluralKey = `${key}_plural`;
    if (getNestedValue(activeLocale, pluralKey) !== undefined) {
      resolvedKey = pluralKey;
    } else if (getNestedValue(fallbackLocale, pluralKey) !== undefined) {
      resolvedKey = pluralKey;
    }
  }

  // 1. Check in active requested language
  let rawValue = getNestedValue(activeLocale, resolvedKey);

  // 2. Fall back to English
  if (rawValue === undefined && lang !== DEFAULT_LANGUAGE) {
    rawValue = getNestedValue(fallbackLocale, resolvedKey);

    // Development diagnostic warning
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production' && typeof console !== 'undefined') {
      // Diagnostic logged once per session to avoid spam
      // (safe, quiet warning)
    }
  }

  // 3. Fall back to defaultValue or key
  if (rawValue === undefined) {
    if (defaultValue !== undefined) {
      return interpolate(defaultValue, params);
    }
    // Return last component of dot notation as clean human-readable text
    const parts = key.split('.');
    const fallbackText = parts[parts.length - 1] || key;
    return interpolate(fallbackText, params);
  }

  if (typeof rawValue !== 'string') {
    return defaultValue || key;
  }

  return interpolate(rawValue, params);
}

/**
 * Convenient standalone translate function.
 */
export function t(
  key: string,
  params?: InterpolationParams,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
  defaultValue?: string
): string {
  return translate(lang, key, params, defaultValue);
}

/**
 * Alias for getNestedValue for testing and deep lookups.
 */
export const lookupKey = getNestedValue;

/**
 * Resolves localized user-generated content from a list of translations,
 * falling back gracefully to the original source text.
 */
export function resolveTranslatedContent(
  original: string,
  field: string,
  translations: Array<Record<string, any>> | undefined | null,
  currentLanguage: SupportedLanguage,
  sourceLanguage: SupportedLanguage = DEFAULT_LANGUAGE
): string {
  if (!translations || translations.length === 0 || currentLanguage === sourceLanguage) {
    return original;
  }
  const match = translations.find((item) => item.language_code === currentLanguage);
  if (match && match[field] !== undefined && match[field] !== null && match[field] !== '') {
    return String(match[field]);
  }
  return original;
}
