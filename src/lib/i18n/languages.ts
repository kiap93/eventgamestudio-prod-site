/**
 * Centralized Supported Languages Configuration
 * Event Game Studio Localization Architecture
 */

export type SupportedLanguage = 'en' | 'zh-CN' | 'ms-MY';

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    enabled: true,
    flag: '🇬🇧',
  },
  {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    direction: 'ltr',
    enabled: true,
    flag: '🇨🇳',
  },
  {
    code: 'ms-MY',
    name: 'Malay',
    nativeName: 'Bahasa Melayu',
    direction: 'ltr',
    enabled: true,
    flag: '🇲🇾',
  },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_STORAGE_KEY = 'app_language';

/**
 * Checks if a string is a supported language code.
 */
export function isSupportedLanguage(code: unknown): code is SupportedLanguage {
  if (typeof code !== 'string') return false;
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code && lang.enabled);
}

/**
 * Resolves a normalized SupportedLanguage from any candidate string.
 */
export function normalizeLanguageCode(candidate?: string | null): SupportedLanguage {
  if (!candidate) return DEFAULT_LANGUAGE;
  const clean = candidate.trim().toLowerCase();

  if (clean === 'zh' || clean.startsWith('zh-') || clean.includes('chinese') || clean.includes('cn')) {
    return 'zh-CN';
  }
  if (clean === 'ms' || clean.startsWith('ms-') || clean.includes('malay') || clean.includes('my')) {
    return 'ms-MY';
  }
  if (clean === 'en' || clean.startsWith('en-') || clean.includes('english')) {
    return 'en';
  }

  return DEFAULT_LANGUAGE;
}
