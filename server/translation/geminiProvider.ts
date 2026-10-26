/**
 * Gemini AI Translation Provider
 * Uses @google/genai SDK on the server-side with gemini-3.8-flash model
 */

import { GoogleGenAI } from '@google/genai';
import { TranslationProvider, TranslationRequest, TranslationResult } from './types.js';
import { getNeverTranslateTerms } from '../../src/lib/i18n/glossary.js';
import { isSupportedLanguage } from '../../src/lib/i18n/languages.js';

export class GeminiTranslationProvider implements TranslationProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini AI';

  private aiClient: GoogleGenAI | null = null;
  private explicitApiKey: string | null = null;

  constructor(apiKey?: string) {
    this.initClient(apiKey);
  }

  public initClient(apiKey?: string): void {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key && key.trim().length > 0) {
      this.explicitApiKey = key.trim();
      try {
        this.aiClient = new GoogleGenAI({
          apiKey: this.explicitApiKey,
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
    } else {
      this.aiClient = null;
    }
  }

  public isConfigured(): boolean {
    const key = this.explicitApiKey || process.env.GEMINI_API_KEY;
    return Boolean(this.aiClient && key && key.trim().length > 0);
  }

  public async translate(req: TranslationRequest): Promise<TranslationResult> {
    if (!this.isConfigured() || !this.aiClient) {
      throw new Error('Gemini API is not configured. Missing GEMINI_API_KEY secret.');
    }

    if (!req.targetLanguage) {
      throw new Error('Target language is required.');
    }

    if (!isSupportedLanguage(req.targetLanguage)) {
      throw new Error(`Unsupported target language: "${req.targetLanguage}". Supported languages are: en, zh-CN, ms-MY.`);
    }

    if (req.sourceLanguage && !isSupportedLanguage(req.sourceLanguage)) {
      throw new Error(`Unsupported source language: "${req.sourceLanguage}". Supported languages are: en, zh-CN, ms-MY.`);
    }

    const fieldsToTranslate = req.fields || (req.text ? { text: req.text } : {});
    const fieldKeys = Object.keys(fieldsToTranslate);
    if (fieldKeys.length === 0) {
      throw new Error('No content provided for translation. Input must not be empty.');
    }

    // Check if all fields are empty whitespace
    const hasAnyContent = fieldKeys.some((k) => typeof fieldsToTranslate[k] === 'string' && fieldsToTranslate[k].trim().length > 0);
    if (!hasAnyContent) {
      throw new Error('Provided translation fields are empty.');
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

    const systemInstruction = `You are a professional localization and translation engine for EventGameStudio, a SaaS platform for branded event games, interactive activations, and sales partner pitch kits.
Translate the provided key-value strings from ${sourceLangDesc} to ${targetLangDesc}.

CRITICAL RULES:
1. Preserve formatting, punctuation, line breaks, and capitalizations where appropriate.
2. Tone: ${req.tone || 'engaging, energetic, professional and natural for event marketing and sales presentations'}.
3. Context: ${req.context || req.entityType || 'interactive event activation and sales partner content'}.
4. GLOSSARY / PROTECTED TERMS (DO NOT TRANSLATE THESE OR ALTER THEIR SPELLING):
${protectedTerms.map((t) => `   - "${t}"`).join('\n')}
5. Return ONLY a valid JSON object matching the exact input keys with their translated string values. Do not wrap in markdown or markdown code fences.`;

    const prompt = JSON.stringify(fieldsToTranslate, null, 2);
    const candidateModels = ['gemini-3.8-flash'];

    let lastError: any = null;

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

        const outputText = response.text || '';
        if (!outputText.trim()) {
          throw new Error('Received empty response from Gemini translation model.');
        }

        let translatedFields: Record<string, string> = {};

        try {
          translatedFields = JSON.parse(outputText.trim());
        } catch {
          // Extract JSON if model wrapped in markdown
          const match = outputText.match(/\{[\s\S]*\}/);
          if (match) {
            translatedFields = JSON.parse(match[0]);
          } else {
            throw new Error('Failed to parse structured JSON from translation response.');
          }
        }

        // Validate that translated fields contains required keys
        for (const key of fieldKeys) {
          if (typeof translatedFields[key] !== 'string') {
            // If missing, throw error rather than returning broken structure
            throw new Error(`Translation response missing field: "${key}".`);
          }
        }

        return {
          sourceLanguage: req.sourceLanguage,
          targetLanguage: req.targetLanguage,
          provider: this.id,
          isMock: false,
          fields: translatedFields,
          translatedText: translatedFields.text || Object.values(translatedFields)[0] || '',
        };
      } catch (apiErr: any) {
        lastError = apiErr;
        const errMsg = apiErr?.message || String(apiErr);
        console.warn(`[GeminiTranslationProvider] Error on model ${model}:`, errMsg);
      }
    }

    // Fail closed with a clear, safe error message without leaking sensitive internals
    const cleanMessage =
      lastError?.status === 429 || lastError?.message?.includes('quota') || lastError?.message?.includes('resource_exhausted')
        ? 'AI translation quota temporarily exceeded. Please try again shortly.'
        : lastError?.status === 403 || lastError?.message?.includes('denied')
        ? 'AI translation provider authorization error. Please verify GEMINI_API_KEY.'
        : 'AI translation service failed to generate translation. Please try again.';

    throw new Error(cleanMessage);
  }
}

