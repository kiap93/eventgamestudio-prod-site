/**
 * Centralized Translation Service
 * Provider-agnostic orchestration layer for AI translation
 */

import { TranslationProvider, TranslationRequest, TranslationResult } from './types.js';
import { GeminiTranslationProvider } from './geminiProvider.js';
import { MockTranslationProvider } from './mockProvider.js';
import {
  createTranslationJob,
  updateTranslationJob,
  TranslationJobRecord,
} from '../db/translations.js';

export class TranslationService {
  private providers: Map<string, TranslationProvider> = new Map();
  private defaultProviderId: string = 'gemini';

  constructor() {
    this.registerProvider(new GeminiTranslationProvider());
    this.registerProvider(new MockTranslationProvider());
  }

  public registerProvider(provider: TranslationProvider): void {
    this.providers.set(provider.id, provider);
  }

  public setDefaultProviderId(id: string): void {
    this.defaultProviderId = id;
  }

  public getProvider(id?: string): TranslationProvider {
    if (id && this.providers.has(id)) {
      const p = this.providers.get(id)!;
      if (p.isConfigured()) return p;
    }

    // Try default (Gemini)
    const def = this.providers.get(this.defaultProviderId);
    if (def && def.isConfigured()) return def;

    // Only allow mock provider in test/dev environments
    const mock = this.providers.get('mock');
    if (mock && mock.isConfigured()) {
      return mock;
    }

    return def || new GeminiTranslationProvider();
  }

  public getAvailableProviders(): { id: string; name: string; isConfigured: boolean }[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConfigured: p.isConfigured(),
    }));
  }

  /**
   * Translates content synchronously using the active configured provider.
   */
  public async translate(req: TranslationRequest, preferredProviderId?: string): Promise<TranslationResult> {
    const provider = this.getProvider(preferredProviderId);
    if (!provider || !provider.isConfigured()) {
      throw new Error('AI translation provider is not configured. Please ensure GEMINI_API_KEY is configured.');
    }
    return await provider.translate(req);
  }

  /**
   * Queues an asynchronous translation job, executing in the background and updating job state.
   */
  public async queueTranslationJob(params: {
    entity_type: 'event' | 'showcase' | 'game_instructions';
    entity_id: string;
    user_id?: string | null;
    organization_id?: string | null;
    source_language: string;
    target_language: string;
    fields: Record<string, string>;
    glossary?: string[];
    context?: string;
    provider_id?: string;
  }): Promise<TranslationJobRecord> {
    const provider = this.getProvider(params.provider_id);
    const job = await createTranslationJob({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      user_id: params.user_id,
      organization_id: params.organization_id,
      source_language: params.source_language,
      target_language: params.target_language,
      provider: provider.id,
    });

    // Execute asynchronously without blocking caller
    (async () => {
      try {
        await updateTranslationJob(job.id, { status: 'PROCESSING' });
        const res = await provider.translate({
          sourceLanguage: params.source_language,
          targetLanguage: params.target_language,
          fields: params.fields,
          glossary: params.glossary,
          context: params.context,
          entityType: params.entity_type === 'event' ? 'event' : params.entity_type === 'showcase' ? 'showcase' : 'game',
        });

        await updateTranslationJob(job.id, {
          status: 'COMPLETED',
          result: res.fields || { text: res.translatedText },
          completed_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`[TranslationService] Job ${job.id} failed:`, err);
        await updateTranslationJob(job.id, {
          status: 'FAILED',
          error: err?.message || 'Translation job failed',
          completed_at: new Date().toISOString(),
        });
      }
    })();

    return job;
  }
}

export const translationService = new TranslationService();
