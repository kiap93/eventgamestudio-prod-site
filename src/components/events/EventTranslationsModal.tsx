import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { SupportedLanguage, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../../lib/i18n/languages';
import { PROTECTED_TERMS } from '../../lib/i18n/glossary';
import {
  X,
  Globe,
  Sparkles,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export interface EventTranslationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  entityType?: 'event' | 'showcase';
  sourceContent: {
    title: string;
    description?: string;
    gameInstructions?: string;
  };
  onTranslationsUpdated?: () => void;
}

interface TranslationFields {
  title: string;
  description: string;
  game_instructions: string;
}

export const EventTranslationsModal: React.FC<EventTranslationsModalProps> = ({
  isOpen,
  onClose,
  eventId,
  entityType = 'event',
  sourceContent,
  onTranslationsUpdated,
}) => {
  const { t } = useLocalization();

  // Non-English target languages
  const targetLanguages = SUPPORTED_LANGUAGES.filter((l) => l.code !== DEFAULT_LANGUAGE);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('zh-CN');

  // Stored translations map from server: { 'zh-CN': { ... }, 'ms-MY': { ... } }
  const [translationsMap, setTranslationsMap] = useState<Record<string, any>>({});
  const [loadingTranslations, setLoadingTranslations] = useState(false);

  // Editable fields for the selected language
  const [formFields, setFormFields] = useState<TranslationFields>({
    title: '',
    description: '',
    game_instructions: '',
  });

  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isShowcase = entityType === 'showcase';
  const apiBasePath = isShowcase
    ? `/api/events/${eventId}/showcase/translations`
    : `/api/events/${eventId}/translations`;

  // Fetch all translations for this entity
  const fetchTranslations = useCallback(async () => {
    if (!eventId || !isOpen) return;
    setLoadingTranslations(true);
    try {
      const res = await apiFetch(apiBasePath);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, any> = {};
        if (Array.isArray(data.translations)) {
          data.translations.forEach((tr: any) => {
            map[tr.language_code] = tr;
          });
        }
        setTranslationsMap(map);
      }
    } catch (err) {
      console.error('[EventTranslationsModal] Error fetching translations:', err);
    } finally {
      setLoadingTranslations(false);
    }
  }, [eventId, isOpen, apiBasePath]);

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      fetchTranslations();
    }
  }, [isOpen, fetchTranslations]);

  // Sync form fields when selectedLanguage or translationsMap changes
  useEffect(() => {
    const existing = translationsMap[selectedLanguage];
    if (existing) {
      setFormFields({
        title: existing.title || '',
        description: existing.description || '',
        game_instructions: existing.game_instructions || '',
      });
    } else {
      setFormFields({
        title: '',
        description: '',
        game_instructions: '',
      });
    }
    setStatusMessage(null);
  }, [selectedLanguage, translationsMap]);

  if (!isOpen) return null;

  const currentLangConfig = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || targetLanguages[0];
  const hasExistingTranslation = Boolean(translationsMap[selectedLanguage]);

  // AI Translation Handler
  const handleAiTranslate = async () => {
    // If fields already have content, confirm before overwriting
    if (
      (formFields.title || formFields.description || formFields.game_instructions) &&
      !window.confirm(
        `Overwrite current ${currentLangConfig.nativeName} draft with fresh AI translation?`
      )
    ) {
      return;
    }

    setIsTranslating(true);
    setStatusMessage(null);

    try {
      const fieldsToTranslate: Record<string, string> = {
        title: sourceContent.title || '',
      };
      if (sourceContent.description) {
        fieldsToTranslate.description = sourceContent.description;
      }
      if (sourceContent.gameInstructions) {
        fieldsToTranslate.gameInstructions = sourceContent.gameInstructions;
      }

      const res = await apiFetch('/api/translations/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLanguage: 'en',
          targetLanguage: selectedLanguage,
          fields: fieldsToTranslate,
          glossary: PROTECTED_TERMS.map((t) => t.term),
          entityType: isShowcase ? 'showcase' : 'event',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || t('translations.errorFailed'));
      }

      const data = await res.json();
      const translated = data.fields || {};

      setFormFields({
        title: translated.title || sourceContent.title,
        description: translated.description || sourceContent.description || '',
        game_instructions: translated.gameInstructions || translated.game_instructions || sourceContent.gameInstructions || '',
      });

      setStatusMessage({
        type: 'success',
        text: `AI translation generated for ${currentLangConfig.nativeName}. Review and click "Save Translation" to commit.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || t('translations.errorFailed'),
      });
    } finally {
      setIsTranslating(false);
    }
  };

  // Save Translation Handler
  const handleSaveTranslation = async () => {
    if (!formFields.title.trim()) {
      setStatusMessage({
        type: 'error',
        text: t('validation.required'),
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const payload: any = {
        title: formFields.title.trim(),
        description: formFields.description.trim() || undefined,
      };
      if (isShowcase) {
        payload.cta_text = formFields.description.trim() || undefined;
      } else {
        payload.game_instructions = formFields.game_instructions.trim() || undefined;
      }

      const res = await apiFetch(`${apiBasePath}/${selectedLanguage}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save translation.');
      }

      const data = await res.json();
      setTranslationsMap((prev) => ({
        ...prev,
        [selectedLanguage]: data.translation,
      }));

      setStatusMessage({
        type: 'success',
        text: t('translations.savedSuccess'),
      });

      onTranslationsUpdated?.();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error saving translation.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Translation Handler
  const handleDeleteTranslation = async () => {
    if (!window.confirm(`Are you sure you want to delete the ${currentLangConfig.nativeName} translation?`)) {
      return;
    }

    setIsDeleting(true);
    setStatusMessage(null);

    try {
      const res = await apiFetch(`${apiBasePath}/${selectedLanguage}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete translation.');
      }

      setTranslationsMap((prev) => {
        const next = { ...prev };
        delete next[selectedLanguage];
        return next;
      });

      setFormFields({
        title: '',
        description: '',
        game_instructions: '',
      });

      setStatusMessage({
        type: 'success',
        text: t('translations.deletedSuccess'),
      });

      onTranslationsUpdated?.();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error deleting translation.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {t('translations.modalTitle')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('translations.sourceNotice')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">
              {t('translations.targetLanguage')}:
            </span>
            {targetLanguages.map((lang) => {
              const isSelected = lang.code === selectedLanguage;
              const isSaved = Boolean(translationsMap[lang.code]);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.nativeName}</span>
                  {isSaved && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-slate-950' : 'bg-emerald-400'
                      }`}
                      title={t('translations.existingBadge')}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAiTranslate}
            disabled={isTranslating}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/10 transition-all cursor-pointer disabled:opacity-50"
          >
            {isTranslating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('translations.translating')}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('translations.translateNow')}</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-4 rounded-2xl flex items-start gap-3 border text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <div className="flex-1 leading-relaxed">{statusMessage.text}</div>
            </div>
          )}

          {/* Protected Terms Notice */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300">
                {t('translations.glossaryNotice')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Protected Source English */}
            <div className="space-y-4 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  🇬🇧 {t('translations.originalSource')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {t('translations.fieldTitle')}
                </label>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 font-medium select-text">
                  {sourceContent.title || 'Untitled Event'}
                </div>
              </div>

              {sourceContent.description && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {t('translations.fieldDescription')}
                  </label>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                    {sourceContent.description}
                  </div>
                </div>
              )}

              {sourceContent.gameInstructions && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {t('translations.fieldInstructions')}
                  </label>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                    {sourceContent.gameInstructions}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Editable Target Language Translation */}
            <div className="space-y-4 bg-slate-900 p-4 rounded-2xl border border-amber-500/20 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span>{currentLangConfig.flag}</span>
                  <span>{currentLangConfig.nativeName} ({t('translations.translatedFields')})</span>
                </span>
                {hasExistingTranslation && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {t('translations.existingBadge')}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('translations.fieldTitle')} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formFields.title}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder={`e.g. ${sourceContent.title}`}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('translations.fieldDescription')}
                </label>
                <textarea
                  rows={4}
                  value={formFields.description}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter localized event description..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t('translations.fieldInstructions')}
                </label>
                <textarea
                  rows={3}
                  value={formFields.game_instructions}
                  onChange={(e) => setFormFields((prev) => ({ ...prev, game_instructions: e.target.value }))}
                  placeholder="Enter localized gameplay instructions..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors resize-none leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <div>
            {hasExistingTranslation && (
              <button
                type="button"
                onClick={handleDeleteTranslation}
                disabled={isDeleting || isSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('translations.deleteTranslation')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={handleSaveTranslation}
              disabled={isSaving || isTranslating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('translations.saving')}</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{t('translations.saveTranslation')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
