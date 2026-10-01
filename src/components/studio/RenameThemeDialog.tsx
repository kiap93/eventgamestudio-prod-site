import React, { useState, useEffect, useRef } from 'react';
import { GameTheme } from '../../themes';
import { useLocalization } from '../../context/LocalizationContext';
import { Edit3, AlertCircle, X, Loader2, Check } from 'lucide-react';

export interface RenameThemeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: {
    id: string;
    name: string;
    organization_id?: string | null;
    is_system?: boolean;
    is_system_theme?: boolean;
  };
  existingThemes?: GameTheme[];
  onRename: (themeId: string, newName: string) => Promise<GameTheme | void>;
}

export const RenameThemeDialog: React.FC<RenameThemeDialogProps> = ({
  isOpen,
  onClose,
  theme,
  existingThemes = [],
  onRename,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState(theme.name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(theme.name || '');
      setErrorMessage(null);
      setIsSuccess(false);
      setIsSubmitting(false);

      // Autofocus and select text after modal opens
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, theme.name]);

  if (!isOpen) return null;

  const validate = (candidate: string): string | null => {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return t('validation.required', undefined, 'Theme name is required');
    }
    if (trimmed.length > 60) {
      return t('validation.maxLength', { max: 60 }, 'Theme name must not exceed 60 characters');
    }
    // Prevent duplicate name within the organization if different from current theme name
    const isDuplicate = existingThemes.some(
      (t) =>
        t.id !== theme.id &&
        (t.organization_id === theme.organization_id || (!t.organization_id && !theme.organization_id)) &&
        t.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      return t('studio.themeNameExists', undefined, 'A theme with this name already exists in your organization');
    }
    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (errorMessage) {
      // Clear error once valid
      const err = validate(val);
      if (!err) {
        setErrorMessage(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    // If unchanged, simply close without network call
    if (trimmed === (theme.name || '').trim()) {
      onClose();
      return;
    }

    const validationError = validate(trimmed);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onRename(theme.id, trimmed);
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: any) {
      console.error('Failed to rename theme:', err);
      setErrorMessage(err.message || 'Failed to rename theme. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isSubmitting) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-theme-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="rename-theme-title" className="text-lg font-black text-slate-100 tracking-tight">
                {t('studio.renameTheme')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('studio.renameThemeDesc', undefined, 'Update the display name of your theme')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Theme Information */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400 font-medium shrink-0">{t('studio.currentName')}:</span>
          <span className="text-xs font-bold text-slate-200 truncate text-right font-mono">
            {theme.name || t('studio.untitledTheme', undefined, 'Untitled Theme')}
          </span>
        </div>

        {/* Rename Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="rename-theme-input" className="text-xs font-bold text-slate-300">
                {t('studio.newThemeName')}
              </label>
              <span
                className={`text-[11px] font-mono ${
                  name.length > 55
                    ? 'text-amber-400 font-bold'
                    : name.length > 60
                    ? 'text-red-400 font-bold'
                    : 'text-slate-500'
                }`}
              >
                {name.length}/60
              </span>
            </div>
            <input
              ref={inputRef}
              id="rename-theme-input"
              type="text"
              value={name}
              onChange={handleNameChange}
              maxLength={60}
              disabled={isSubmitting}
              placeholder={t('studio.themeNamePlaceholder')}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 rounded-2xl px-4 py-3 text-slate-100 font-semibold text-sm outline-none transition-all placeholder:text-slate-600 disabled:opacity-60"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              id="rename-theme-error"
              className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-400 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-400 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{t('studio.themeRenamedSuccess')}</span>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              id="rename-theme-cancel-button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-800 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              id="rename-theme-save-button"
              disabled={isSubmitting || !name.trim()}
              className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('common.saving')}</span>
                </>
              ) : isSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('common.saved')}</span>
                </>
              ) : (
                <span>{t('studio.saveName')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
