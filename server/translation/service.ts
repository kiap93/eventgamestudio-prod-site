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

class TranslationService {
  private providers: Map<string, TranslationProvider> = new Map();
  private defaultProviderId: string = 'gemini';

  constructor() {
    this.registerProvider(new GeminiTranslationProvider());
    this.registerProvider(new MockTranslationProvider());
  }

  public registerProvider(provider: TranslationProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id?: string): TranslationProvider {
    if (id && this.providers.has(id)) {
      const p = this.providers.get(id)!;
      if (p.isConfigured()) return p;
    }

    // Try default
    const def = this.providers.get(this.defaultProviderId);
    if (def && def.isConfigured()) return def;

    // Fall back to mock
    return this.providers.get('mock') || new MockTranslationProvider();
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
    try {
      const provider = this.getProvider(preferredProviderId);
      return await provider.translate(req);
    } catch (err) {
      console.warn('[TranslationService] Primary provider failed, falling back to mock provider:', err);
      const fallback = new MockTranslationProvider();
      return fallback.translate(req);
    }
  }

  /**
   * Queues an asynchronous translation job, executing in the background and updating job state.
   */
  public async queueTranslationJob(params: {
    entity_type: 'event' | 'showcase' | 'game_instructions';
    entity_id: string;
    source_language: string;
    target_language: string;
    fields: Record<string, string>;
    glossary?: string[];
    context?: string;
  }): Promise<TranslationJobRecord> {
    const provider = this.getProvider();
    const job = await createTranslationJob({
      entity_type: params.entity_type,
      entity_id: params.entity_id,
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
