import React, { useState, useEffect } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { SupportedLanguage, SUPPORTED_LANGUAGES } from '../../lib/i18n/languages';
import { apiFetch } from '../../lib/api';
import {
  Sparkles,
  X,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Languages,
} from 'lucide-react';

export interface SalesPartnerTranslationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  initialSourceLang?: SupportedLanguage;
  initialTargetLang?: SupportedLanguage;
  context?: string;
  title?: string;
}

export const SalesPartnerTranslationModal: React.FC<SalesPartnerTranslationModalProps> = ({
  isOpen,
  onClose,
  initialText = '',
  initialSourceLang,
  initialTargetLang,
  context = 'sales_partner_pitch',
  title,
}) => {
  const { language, t } = useLocalization();

  const [sourceLang, setSourceLang] = useState<SupportedLanguage>(initialSourceLang || 'en');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>(
    initialTargetLang || (language === 'en' ? 'zh-CN' : language)
  );
  const [tone, setTone] = useState<'professional' | 'casual' | 'persuasive'>('persuasive');
  const [sourceText, setSourceText] = useState(initialText);
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialText) {
      setSourceText(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    if (isOpen && initialTargetLang) {
      setTargetLang(initialTargetLang);
    } else if (isOpen && !initialTargetLang) {
      // Default target to Chinese if source is English, or English if source is Chinese/Malay
      setTargetLang(sourceLang === 'en' ? 'zh-CN' : 'en');
    }
  }, [isOpen, initialTargetLang, sourceLang]);

  if (!isOpen) return null;

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;

    try {
      setTranslating(true);
      setError(null);
      setCopied(false);

      const res = await apiFetch('/api/translations/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          context: `${context}_tone_${tone}`,
          tone,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || t('sales.aiTranslator.errorTitle'));
      }

      const data = await res.json();
      setTranslatedText(data.translatedText || '');
    } catch (err: any) {
      setError(err.message || t('sales.aiTranslator.errorTitle'));
    } finally {
      setTranslating(false);
    }
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const swapLanguages = () => {
    const prevSource = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(prevSource);
    if (translatedText) {
      setSourceText(translatedText);
      setTranslatedText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="translation-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="translation-modal-title" className="text-base sm:text-lg font-bold text-white">
                {title || t('sales.aiTranslator.title')}
              </h2>
              <p className="text-xs text-slate-400">
                {t('sales.aiTranslator.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label={t('sales.aiTranslator.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-6 py-3.5 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Language Pair Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as SupportedLanguage)}
              className="bg-slate-900 border border-slate-750 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
              aria-label={t('sales.aiTranslator.sourceLanguage')}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.nativeName} ({l.code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={swapLanguages}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={t('common.swapLanguages')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value as SupportedLanguage)}
              className="bg-slate-900 border border-slate-750 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
              aria-label={t('sales.aiTranslator.targetLanguage')}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} disabled={l.code === sourceLang}>
                  {l.flag} {l.nativeName} ({l.code})
                </option>
              ))}
            </select>
          </div>

          {/* Tone Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{t('sales.aiTranslator.tone')}:</span>
            <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setTone('persuasive')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  tone === 'persuasive'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('sales.aiTranslator.tonePersuasive')}
              </button>
              <button
                type="button"
                onClick={() => setTone('professional')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  tone === 'professional'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('sales.aiTranslator.toneProfessional')}
              </button>
              <button
                type="button"
                onClick={() => setTone('casual')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  tone === 'casual'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t('sales.aiTranslator.toneCasual')}
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3 text-xs text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={handleTranslate}
                className="font-semibold text-rose-400 hover:underline shrink-0 cursor-pointer"
              >
                {t('sales.aiTranslator.retry')}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source Box */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  {t('sales.aiTranslator.sourceLanguage')}
                </span>
                <span>{sourceText.length} characters</span>
              </div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={t('sales.aiTranslator.sourceTextPlaceholder')}
                rows={9}
                className="w-full flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed resize-none"
              />
            </div>

            {/* Target Box */}
            <div className="space-y-2 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">
                  {t('sales.aiTranslator.translationResult')}
                </span>
                {translatedText && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('sales.aiTranslator.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('sales.aiTranslator.copyResult')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="relative flex-1">
                <textarea
                  readOnly
                  value={translatedText}
                  placeholder={translating ? t('sales.aiTranslator.translating') : t('sales.aiTranslator.translationResult')}
                  rows={9}
                  className={`w-full h-full bg-slate-950/50 border rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed resize-none ${
                    translating
                      ? 'border-amber-500/40 text-slate-400 animate-pulse'
                      : 'border-slate-800 text-emerald-300'
                  }`}
                />
                {translating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px] rounded-2xl">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-xs font-semibold text-amber-400">
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>{t('sales.aiTranslator.translating')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Protected Terms Info */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t('sales.aiTranslator.protectedTermsNotice')}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {t('sales.aiTranslator.close')}
          </button>

          <button
            type="button"
            onClick={handleTranslate}
            disabled={translating || !sourceText.trim() || sourceLang === targetLang}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${translating ? 'animate-spin' : ''}`} />
            <span>
              {translating
                ? t('sales.aiTranslator.translating')
                : t('sales.aiTranslator.translateButton')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
