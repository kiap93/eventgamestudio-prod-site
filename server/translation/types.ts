/**
 * AI Translation Engine Types & Provider Interface
 */

export interface TranslationRequest {
  sourceLanguage: string;
  targetLanguage: string;
  text?: string;
  fields?: Record<string, string>;
  glossary?: string[];
  context?: string;
  entityType?: 'event' | 'showcase' | 'game';
  tone?: 'professional' | 'energetic' | 'casual' | 'formal';
}

export interface TranslationResult {
  translatedText?: string;
  fields?: Record<string, string>;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  cached?: boolean;
}

export interface TranslationProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  translate(req: TranslationRequest): Promise<TranslationResult>;
}
