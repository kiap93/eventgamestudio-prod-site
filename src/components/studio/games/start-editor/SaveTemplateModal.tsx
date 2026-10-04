import React, { useState } from 'react';
import { useLocalization } from '../../../../context/LocalizationContext';
import { StartScreenElement } from '../../../../games/shared/startScreenTypes';
import { saveCustomStartTemplate } from './customTemplates';
import { X, BookmarkPlus, Check } from 'lucide-react';

interface SaveTemplateModalProps {
  isOpen: boolean;
  gameType?: string;
  elements: StartScreenElement[];
  onClose: () => void;
  onSaved?: () => void;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  gameType = 'memory-match',
  elements,
  onClose,
  onSaved,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Default' | 'Minimalist' | 'Arcade' | 'Split' | 'Compact'>('Default');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    saveCustomStartTemplate({
      name: name.trim(),
      description: description.trim(),
      category,
      gameType,
      elements,
    });

    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <BookmarkPlus className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-sm text-slate-100">{t('editor.saveTemplateTitle', undefined, 'Save Layout as Template')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('editor.templateNameLabel', undefined, 'Template Name')}
            </label>
            <input
              type="text"
              required
              placeholder={t('editor.templateNamePlaceholder', undefined, 'e.g. Carnival Neon Start Layout')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('editor.templateCategoryLabel', undefined, 'Category')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs"
            >
              <option value="Default">Default</option>
              <option value="Minimalist">Minimalist</option>
              <option value="Arcade">Arcade</option>
              <option value="Split">Split</option>
              <option value="Compact">Compact</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              {t('editor.templateDescLabel', undefined, 'Description (Optional)')}
            </label>
            <textarea
              rows={3}
              placeholder={t('editor.templateDescPlaceholder', undefined, 'Brief description of this custom layout...')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
            >
              {t('common.cancel', undefined, 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg shadow-md transition-colors"
            >
              {t('editor.saveTemplateBtn', undefined, 'Save Template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
