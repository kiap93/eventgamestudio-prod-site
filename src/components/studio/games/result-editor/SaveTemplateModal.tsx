import { useLocalization } from '../../../../context/LocalizationContext';
import React, { useState } from 'react';
import { ResultScreenElement } from '../../../../games/memory-match/types';
import { saveCustomTemplate, CustomResultScreenTemplate } from './customTemplates';
import { BookmarkPlus, Sparkles, Check, X, AlertCircle } from 'lucide-react';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  elements: ResultScreenElement[];
  onTemplateSaved: (template: CustomResultScreenTemplate) => void;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  onClose,
  elements,
  onTemplateSaved,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Custom');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const categories = ['Custom', 'Branded', 'Minimal', 'Arcade', 'Analytics', 'Celebration'];

  // Count total elements in hierarchy
  const countElements = (list: ResultScreenElement[]): number => {
    let count = 0;
    for (const item of list) {
      count++;
      if (item.type === 'card' && (item as any).children) {
        count += countElements((item as any).children);
      }
      if (item.type === 'group' && (item as any).children) {
        count += countElements((item as any).children);
      }
    }
    return count;
  };

  const totalElementsCount = countElements(elements);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a template name.');
      return;
    }
    if (elements.length === 0) {
      setError('Cannot save an empty canvas as a template.');
      return;
    }

    try {
      const newTemplate = saveCustomTemplate(name, description, elements, category);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onTemplateSaved(newTemplate);
        onClose();
        setName('');
        setDescription('');
      }, 600);
    } catch (err: any) {
      setError(err?.message || 'Failed to save template');
    }
  };

  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <BookmarkPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Save as Custom Template</h2>
              <p className="text-xs text-slate-400">Reuse this Result Screen layout across events</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-sm font-bold transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* {t('editor.templateNameLabel', undefined, 'Template Name')} */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Template Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Neon Cyberpunk Victory Screen"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none text-slate-100 text-xs placeholder:text-slate-600 transition-colors"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Description <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of layout design, target theme, or branding notes..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none text-slate-100 text-xs placeholder:text-slate-600 transition-colors resize-none"
            />
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    category === cat
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Info Summary Badge */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Canvas Elements</span>
            </span>
            <span className="font-mono font-bold text-slate-200 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
              {totalElementsCount} items
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
            >
              {t('common.cancel', undefined, 'Cancel')}
            </button>

            <button
              type="submit"
              disabled={success}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
            >
              {success ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-4 h-4" />
                  <span>{t('editor.saveTemplateBtn', undefined, 'Save Template')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
