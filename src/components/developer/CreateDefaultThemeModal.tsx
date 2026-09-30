import React, { useState } from 'react';
import { GameTheme } from '../../themes/types';
import { getDefaultUILayout } from '../../themes/layout';
import { X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

interface CreateDefaultThemeModalProps {
  gameId: string;
  gameName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (themeData: Partial<GameTheme>) => Promise<void>;
}

export const CreateDefaultThemeModal: React.FC<CreateDefaultThemeModalProps> = ({
  gameId,
  gameName,
  isOpen,
  onClose,
  onSave,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'draft'>('active');
  const [isDefault, setIsDefault] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Theme name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const generatedSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      await onSave({
        game_id: gameId,
        name: name.trim(),
        slug: generatedSlug,
        description: description.trim() || null,
        status,
        is_default: isDefault,
        layout: getDefaultUILayout(),
      });

      // Reset form
      setName('');
      setDescription('');
      setStatus('active');
      setIsDefault(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create system theme');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">New System Default Theme</h3>
              <p className="text-xs text-slate-400">
                Adding default theme for <strong>{gameName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Theme Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Christmas Catch, Neon Cyber Rush"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Visual narrative and description for this theme preset..."
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Theme Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="active">Active (Available to Orgs)</option>
              <option value="draft">Draft (Developer Staging)</option>
            </select>
          </div>

          <div className="pt-1">
            <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-medium text-slate-300">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500"
              />
              <span>Set as primary default theme</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-50 rounded-xl shadow-lg shadow-amber-950/30 transition-colors cursor-pointer"
            >
              {saving ? (
                <span>{t('common.saving')}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('common.createSystemTheme')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
