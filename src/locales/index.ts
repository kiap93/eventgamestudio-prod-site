/**
 * Centralized Locales Registry
 */
import { SupportedLanguage } from '../lib/i18n/languages';
import { en, TranslationSchema } from './en';
import { zhCN } from './zh-CN';
import { msMY } from './ms-MY';

export { en, zhCN, msMY };
export type { TranslationSchema };

export const LOCALES: Record<SupportedLanguage, TranslationSchema> = {
  en,
  'zh-CN': zhCN,
  'ms-MY': msMY,
};
