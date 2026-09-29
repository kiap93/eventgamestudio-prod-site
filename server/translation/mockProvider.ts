/**
 * Mock / Fallback Translation Provider
 * Useful for tests and local development without active Gemini API keys
 */

import { TranslationProvider, TranslationRequest, TranslationResult } from './types.js';

export class MockTranslationProvider implements TranslationProvider {
  public readonly id = 'mock';
  public readonly name = 'Mock Fallback Provider';

  public isConfigured(): boolean {
    return true;
  }

  public async translate(req: TranslationRequest): Promise<TranslationResult> {
    const fieldsToTranslate = req.fields || (req.text ? { text: req.text } : {});
    const translatedFields: Record<string, string> = {};

    const langPrefix =
      req.targetLanguage === 'zh-CN'
        ? '[中文] '
        : req.targetLanguage === 'ms-MY'
        ? '[BM] '
        : `[${req.targetLanguage}] `;

    for (const [key, val] of Object.entries(fieldsToTranslate)) {
      if (typeof val === 'string') {
        // If already in target or empty, preserve
        if (!val.trim()) {
          translatedFields[key] = val;
        } else {
          translatedFields[key] = `${langPrefix}${val}`;
        }
      } else {
        translatedFields[key] = String(val);
      }
    }

    return {
      sourceLanguage: req.sourceLanguage,
      targetLanguage: req.targetLanguage,
      provider: this.id,
      fields: translatedFields,
      translatedText: translatedFields.text || Object.values(translatedFields)[0] || '',
    };
  }
}
