import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  LanguageConfig,
  DEFAULT_LANGUAGE,
} from '../lib/i18n/languages';
import {
  detectInitialLanguage,
  persistLanguage,
  translate,
  InterpolationParams,
} from '../lib/i18n/i18n';

export interface LocalizationContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: InterpolationParams, defaultValue?: string) => string;
  supportedLanguages: LanguageConfig[];
  currentLanguageConfig: LanguageConfig;
  isRtl: boolean;
  /**
   * Helper to resolve user-generated multilingual content objects or arrays:
   * e.g., { 'en': 'Corporate Fiesta', 'zh-CN': '企业嘉年华' }
   * or [{ language_code: 'zh-CN', title: '企业嘉年华' }]
   */
  resolveContent: (
    translations?: Record<string, any> | Array<Record<string, any>> | null,
    sourceFallback?: string | null,
    field?: string
  ) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export interface LocalizationProviderProps {
  children: React.ReactNode;
  initialLanguage?: SupportedLanguage;
}

export const LocalizationProvider: React.FC<LocalizationProviderProps> = ({
  children,
  initialLanguage,
}) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (initialLanguage) return initialLanguage;
    return detectInitialLanguage();
  });

  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    persistLanguage(newLang);
  }, []);

  const t = useCallback(
    (key: string, params?: InterpolationParams, defaultValue?: string): string => {
      return translate(language, key, params, defaultValue);
    },
    [language]
  );

  const currentLanguageConfig = useMemo(() => {
    return (
      SUPPORTED_LANGUAGES.find((l) => l.code === language) ||
      SUPPORTED_LANGUAGES[0]
    );
  }, [language]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = currentLanguageConfig.direction;
    }
  }, [language, currentLanguageConfig.direction]);

  const resolveContent = useCallback(
    (
      translations?: Record<string, any> | Array<Record<string, any>> | null,
      sourceFallback?: string | null,
      field: string = 'title'
    ): string => {
      if (!translations && !sourceFallback) return '';
      if (!translations) return sourceFallback || '';

      // Array format: [{ language_code: 'zh-CN', title: '...', description: '...' }]
      if (Array.isArray(translations)) {
        if (translations.length === 0) return sourceFallback || '';
        // 1. Exact match in active language
        const match = translations.find((item) => item.language_code === language);
        if (match && match[field] !== undefined && match[field] !== null && String(match[field]).trim().length > 0) {
          return String(match[field]);
        }
        // 2. English translation fallback
        const enMatch = translations.find((item) => item.language_code === DEFAULT_LANGUAGE || item.language_code === 'en');
        if (enMatch && enMatch[field] !== undefined && enMatch[field] !== null && String(enMatch[field]).trim().length > 0) {
          return String(enMatch[field]);
        }
        // 3. Source fallback
        return sourceFallback || '';
      }

      // Map format: { 'zh-CN': '...', 'en': '...' }
      // 1. Exact match in current language
      const targetVal = translations[language];
      if (targetVal && typeof targetVal === 'string' && targetVal.trim().length > 0) {
        return targetVal;
      }

      // 2. English translation fallback
      const enVal = translations[DEFAULT_LANGUAGE] || translations['en'];
      if (enVal && typeof enVal === 'string' && enVal.trim().length > 0) {
        return enVal;
      }

      // 3. Original source fallback
      return sourceFallback || '';
    },
    [language]
  );

  const value = useMemo<LocalizationContextValue>(() => {
    return {
      language,
      setLanguage,
      t,
      supportedLanguages: SUPPORTED_LANGUAGES,
      currentLanguageConfig,
      isRtl: currentLanguageConfig.direction === 'rtl',
      resolveContent,
    };
  }, [language, setLanguage, t, currentLanguageConfig, resolveContent]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};

/**
 * Hook to access the centralized localization system.
 */
export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) {
    // Graceful fallback for non-wrapped components or tests
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      t: (key: string, params?: InterpolationParams, defaultValue?: string) =>
        translate(DEFAULT_LANGUAGE, key, params, defaultValue),
      supportedLanguages: SUPPORTED_LANGUAGES,
      currentLanguageConfig: SUPPORTED_LANGUAGES[0],
      isRtl: false,
      resolveContent: (_translations, sourceFallback) => sourceFallback || '',
    };
  }
  return context;
}
