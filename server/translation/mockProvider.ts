/**
 * Mock / Fallback Translation Provider
 * Useful for tests and local development without active Gemini API keys
 */

import { TranslationProvider, TranslationRequest, TranslationResult } from './types.js';

export class MockTranslationProvider implements TranslationProvider {
  public readonly id = 'mock';
  public readonly name = 'Mock Fallback Provider';

  public isConfigured(): boolean {
    // Strictly disallowed in production unless ALLOW_MOCK_AUTH is explicitly true
    const isProduction = process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_AUTH !== 'true';
    return !isProduction;
  }

  public async translate(req: TranslationRequest): Promise<TranslationResult> {
    if (!this.isConfigured()) {
      throw new Error('Mock translation provider is disabled in production.');
    }

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
      isMock: true,
      fields: translatedFields,
      translatedText: translatedFields.text || Object.values(translatedFields)[0] || '',
    };
  }
}
