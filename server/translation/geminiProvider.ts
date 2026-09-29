/**
 * Gemini AI Translation Provider
 * Uses @google/genai SDK on the server-side with gemini-3.8-flash model
 */

import { GoogleGenAI } from '@google/genai';
import { TranslationProvider, TranslationRequest, TranslationResult } from './types.js';
import { getNeverTranslateTerms } from '../../src/lib/i18n/glossary.js';

export class GeminiTranslationProvider implements TranslationProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini AI';

  private aiClient: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.aiClient = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.error('[GeminiTranslationProvider] Failed to initialize GoogleGenAI client:', err);
        this.aiClient = null;
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.aiClient && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  public async translate(req: TranslationRequest): Promise<TranslationResult> {
    if (!this.isConfigured() || !this.aiClient) {
      throw new Error('Gemini API is not configured. Missing GEMINI_API_KEY.');
    }

    const protectedTerms = getNeverTranslateTerms(req.glossary);
    const targetLangDesc =
      req.targetLanguage === 'zh-CN'
        ? 'Simplified Chinese (简体中文)'
        : req.targetLanguage === 'ms-MY'
        ? 'Standard Bahasa Melayu (Malay)'
        : req.targetLanguage === 'en'
        ? 'English'
        : req.targetLanguage;

    const sourceLangDesc =
      req.sourceLanguage === 'zh-CN'
        ? 'Simplified Chinese (简体中文)'
        : req.sourceLanguage === 'ms-MY'
        ? 'Standard Bahasa Melayu (Malay)'
        : req.sourceLanguage === 'en'
        ? 'English'
        : req.sourceLanguage;

    const fieldsToTranslate = req.fields || (req.text ? { text: req.text } : {});
    if (Object.keys(fieldsToTranslate).length === 0) {
      return {
        sourceLanguage: req.sourceLanguage,
        targetLanguage: req.targetLanguage,
        provider: this.id,
        fields: {},
        translatedText: '',
      };
    }

    const systemInstruction = `You are a professional localization and translation engine for EventGameStudio, a SaaS platform for branded event games and interactive activations.
Translate the provided key-value strings from ${sourceLangDesc} to ${targetLangDesc}.

CRITICAL RULES:
1. Preserve formatting, punctuation, and capitalizations where appropriate.
2. Tone: ${req.tone || 'engaging, energetic, professional and natural for event marketing and games'}.
3. Context: ${req.context || req.entityType || 'interactive event activation content'}.
4. GLOSSARY / PROTECTED TERMS (DO NOT TRANSLATE THESE OR ALTER THEIR SPELLING):
${protectedTerms.map((t) => `   - "${t}"`).join('\n')}
5. Return ONLY a valid JSON object matching the exact input keys with their translated string values.`;

    const prompt = JSON.stringify(fieldsToTranslate, null, 2);

    const candidateModels = ['gemini-3.8-flash'];

    for (const model of candidateModels) {
      try {
        const response = await this.aiClient.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2, // Low temperature for high fidelity translations
          },
        });

        const outputText = response.text || '{}';
        let translatedFields: Record<string, string> = {};

        try {
          translatedFields = JSON.parse(outputText.trim());
        } catch {
          // Fallback clean extraction if JSON was wrapped in markdown
          const match = outputText.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              translatedFields = JSON.parse(match[0]);
            } catch {
              translatedFields = fieldsToTranslate;
            }
          } else {
            translatedFields = fieldsToTranslate;
          }
        }

        return {
          sourceLanguage: req.sourceLanguage,
          targetLanguage: req.targetLanguage,
          provider: this.id,
          fields: translatedFields,
          translatedText: translatedFields.text || Object.values(translatedFields)[0] || '',
        };
      } catch (apiErr: any) {
        const isQuotaOrRateLimit =
          apiErr?.status === 429 ||
          apiErr?.status === 503 ||
          apiErr?.message?.includes('resource_exhausted') ||
          apiErr?.message?.includes('quota') ||
          apiErr?.message?.includes('high demand') ||
          apiErr?.message?.includes('rate-limits');

        if (isQuotaOrRateLimit) {
          console.warn(`[GeminiTranslationProvider] Model ${model} rate-limited or quota exhausted (${apiErr?.status || 'quota'}); falling back safely.`);
          break;
        }

        console.warn(`[GeminiTranslationProvider] Translation API error:`, apiErr?.message || apiErr);
      }
    }

    // Fall back cleanly to source text without disrupting user flow
    return {
      sourceLanguage: req.sourceLanguage,
      targetLanguage: req.targetLanguage,
      provider: this.id,
      fields: fieldsToTranslate,
      translatedText: fieldsToTranslate.text || Object.values(fieldsToTranslate)[0] || '',
    };
  }
}
