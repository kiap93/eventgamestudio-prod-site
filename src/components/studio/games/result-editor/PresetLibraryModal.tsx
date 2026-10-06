import { useLocalization } from '../../../../context/LocalizationContext';
import React, { useState, useEffect } from 'react';
import {
  RESULT_SCREEN_PRESETS,
  ResultScreenPreset,
  instantiateResultPreset,
} from './presets';
import {
  CustomResultScreenTemplate,
  getCustomTemplates,
  instantiateCustomTemplate,
  deleteCustomTemplate,
} from './customTemplates';
import { ResultScreenElement } from '../../../../games/memory-match/types';
import {
  LayoutTemplate,
  Sparkles,
  Check,
  Info,
  RefreshCw,
  BookmarkPlus,
  Trash2,
  AlertTriangle,
  FolderHeart,
  Plus,
  Calendar,
  Layers,
} from 'lucide-react';

interface PresetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPreset: (elements: ResultScreenElement[]) => void;
  onOpenSaveTemplateModal?: () => void;
  hasExistingElements?: boolean;
}

export const PresetLibraryModal: React.FC<PresetLibraryModalProps> = ({
  isOpen,
  onClose,
  onApplyPreset,
  onOpenSaveTemplateModal,
  hasExistingElements = true,
}) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom'>('builtin');
  const [selectedBuiltinId, setSelectedBuiltinId] = useState<string>('classic-center');
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [builtinCategory, setBuiltinCategory] = useState<string>('All');
  const [customCategory, setCustomCategory] = useState<string>('All');

  const [customTemplatesList, setCustomTemplatesList] = useState<CustomResultScreenTemplate[]>([]);
  const [templateToDelete, setTemplateToDelete] = useState<CustomResultScreenTemplate | null>(null);

  // Safety Confirmation Modal State
  const [pendingApplyTemplate, setPendingApplyTemplate] = useState<{
    type: 'builtin' | 'custom';
    id: string;
    name: string;
  } | null>(null);

  // Reload custom templates when opening or switching tabs
  const refreshCustomTemplates = () => {
    const list = getCustomTemplates();
    setCustomTemplatesList(list);
    if (list.length > 0 && !selectedCustomId) {
      setSelectedCustomId(list[0].id);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshCustomTemplates();
      setPendingApplyTemplate(null);
      setTemplateToDelete(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const builtinCategories = ['All', 'Standard', 'Leaderboard', 'Dual', 'Focused', 'Analytics', 'Minimalist'];

  const filteredBuiltinPresets =
    builtinCategory === 'All'
      ? RESULT_SCREEN_PRESETS
      : RESULT_SCREEN_PRESETS.filter((p) => p.category === builtinCategory);

  // Unique custom categories
  const customCategories = [
    'All',
    ...Array.from(new Set(customTemplatesList.map((t) => t.category || 'Custom'))),
  ];

  const filteredCustomTemplates =
    customCategory === 'All'
      ? customTemplatesList
      : customTemplatesList.filter((t) => (t.category || 'Custom') === customCategory);

  const selectedBuiltin = RESULT_SCREEN_PRESETS.find((p) => p.id === selectedBuiltinId);
  const selectedCustom = customTemplatesList.find((p) => p.id === selectedCustomId);

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

  // Trigger apply with safety check
  const requestApply = (type: 'builtin' | 'custom', id: string, name: string) => {
    if (hasExistingElements) {
      // Prompt safety confirmation
      setPendingApplyTemplate({ type, id, name });
    } else {
      executeApply(type, id);
    }
  };

  const executeApply = (type: 'builtin' | 'custom', id: string) => {
    if (type === 'builtin') {
      const elements = instantiateResultPreset(id);
      if (elements) {
        onApplyPreset(elements);
        onClose();
      }
    } else {
      const targetTmpl = customTemplatesList.find((t) => t.id === id);
      if (targetTmpl) {
        const elements = instantiateCustomTemplate(targetTmpl);
        onApplyPreset(elements);
        onClose();
      }
    }
  };

  const handleDeleteTemplate = (tmpl: CustomResultScreenTemplate) => {
    deleteCustomTemplate(tmpl.id);
    const updated = getCustomTemplates();
    setCustomTemplatesList(updated);
    if (selectedCustomId === tmpl.id) {
      setSelectedCustomId(updated.length > 0 ? updated[0].id : null);
    }
    setTemplateToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <span>{t('editor.resultPresetLibraryTitle', undefined, 'Result Screen Templates')}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('editor.presetLibrarySubtitle', undefined, 'Choose a built-in layout architecture or load your reusable custom templates')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSaveTemplateModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSaveTemplateModal();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title={t('editor.saveAsTemplateBtn', undefined, 'Save current canvas as a new template')}
              >
                <BookmarkPlus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('editor.saveAsTemplateBtn', undefined, 'Save Current as Template')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', undefined, 'Close')}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher (Built-in Presets vs My Custom Templates) */}
        <div className="px-6 pt-3 pb-2 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('builtin')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'builtin'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('editor.builtinPresets', { count: RESULT_SCREEN_PRESETS.length }, `Built-in Presets (${RESULT_SCREEN_PRESETS.length})`)}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('custom');
                refreshCustomTemplates();
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <FolderHeart className="w-3.5 h-3.5" />
              <span>{t('editor.myTemplates', undefined, 'My Templates')}</span>
              {customTemplatesList.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                  {customTemplatesList.length}
                </span>
              )}
            </button>
          </div>

          {/* Sub-Category Filters */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {activeTab === 'builtin'
              ? builtinCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setBuiltinCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                      builtinCategory === cat
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))
              : customCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCustomCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                      customCategory === cat
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
          </div>
        </div>

        {/* Tab Body: Built-in Presets vs Custom Templates */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'builtin' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBuiltinPresets.map((preset) => {
                const isSelected = preset.id === selectedBuiltinId;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedBuiltinId(preset.id)}
                    className={`relative rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-slate-100 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/50 scale-[1.02]'
                        : 'bg-slate-950/60 border-slate-800/90 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          {preset.category}
                        </span>
                        {preset.badge && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {preset.badge}
                          </span>
                        )}
                      </div>

                      {/* Preset Title */}
                      <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-1.5">
                        <span>{preset.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-amber-400 stroke-[3]" />}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                        <Sparkles className="w-3 h-3 text-amber-400" /> Complete Setup
                      </span>
                      <span className="text-xs font-semibold text-amber-400">
                        {isSelected ? 'Selected' : 'Click to select'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {filteredCustomTemplates.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
                  <div className="w-14 h-14 rounded-3xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                    <FolderHeart className="w-7 h-7 text-amber-400/80" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200">{t('editor.noCustomTemplatesSaved', undefined, 'No Custom Templates Saved')}</h3>
                  <p className="text-xs text-slate-400">
                    {t('editor.noCustomTemplatesSavedDesc', undefined, "You haven't saved any custom Result Screen layouts yet. Customize your screen elements and save them as reusable templates.")}
                  </p>
                  {onOpenSaveTemplateModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSaveTemplateModal();
                      }}
                      className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
                    >
                      <BookmarkPlus className="w-4 h-4" />
                      <span>{t('editor.saveCurrentScreenAsTemplate', undefined, 'Save Current Screen as Template')}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCustomTemplates.map((template) => {
                    const isSelected = template.id === selectedCustomId;
                    const elementCount = countElements(template.elements || []);
                    const dateFormatted = template.createdAt
                      ? new Date(template.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Saved';

                    return (
                      <div
                        key={template.id}
                        onClick={() => setSelectedCustomId(template.id)}
                        className={`relative rounded-2xl border p-4 cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 text-slate-100 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/50 scale-[1.02]'
                            : 'bg-slate-950/60 border-slate-800/90 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-slate-700">
                              {template.category || 'Custom'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTemplateToDelete(template);
                              }}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <h3 className="text-sm font-bold text-slate-100 mb-1 flex items-center gap-1.5">
                            <span>{template.name}</span>
                            {isSelected && <Check className="w-4 h-4 text-amber-400 stroke-[3]" />}
                          </h3>

                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                            {template.description || 'No description provided.'}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                            <Layers className="w-3 h-3 text-amber-400" /> {elementCount} elements
                          </span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {dateFormatted}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions & Safety Warnings */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {activeTab === 'builtin'
                ? 'Applying a preset will load a fresh, isolated layout tree with unique IDs.'
                : 'Custom templates are saved safely and keep dynamic elements fully reactive.'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
            >
              {t('common.cancel', undefined, 'Cancel')}
            </button>

            {activeTab === 'builtin' ? (
              <button
                type="button"
                onClick={() => {
                  if (selectedBuiltin) {
                    requestApply('builtin', selectedBuiltin.id, selectedBuiltin.name);
                  }
                }}
                disabled={!selectedBuiltin}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Apply "{selectedBuiltin?.name || 'Preset'}"</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (selectedCustom) {
                    requestApply('custom', selectedCustom.id, selectedCustom.name);
                  }
                }}
                disabled={!selectedCustom}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Apply "{selectedCustom?.name || 'Template'}"</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Safety Confirmation Dialog */}
      {pendingApplyTemplate && (
        <div className="fixed inset-0 z-[140] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-100">{t('editor.replaceExistingLayout', undefined, 'Replace Existing Layout?')}</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('editor.replaceLayoutConfirm', { name: pendingApplyTemplate.name }, `Applying "${pendingApplyTemplate.name}" will replace the existing customized elements on your canvas with a fresh layout.`)}
            </p>

            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t('editor.dynamicStatsAutoLink', undefined, 'Dynamic game statistics (Score, Time, Moves, Accuracy) will automatically link to the new layout.')}</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingApplyTemplate(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingApplyTemplate;
                  setPendingApplyTemplate(null);
                  executeApply(pending.type, pending.id);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{t('editor.replaceAndApply', undefined, 'Replace & Apply')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {templateToDelete && (
        <div className="fixed inset-0 z-[140] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-100">{t('editor.deleteCustomTemplate', undefined, 'Delete Custom Template?')}</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('editor.deleteTemplateConfirm', { name: templateToDelete.name }, `Are you sure you want to delete "${templateToDelete.name}"? This action cannot be undone.`)}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTemplateToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTemplate(templateToDelete)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('editor.deleteTemplate', undefined, 'Delete Template')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
