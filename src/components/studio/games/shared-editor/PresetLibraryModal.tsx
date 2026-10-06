import { useLocalization } from '../../../../context/LocalizationContext';
/**
 * Shared Visual Editor Engine - Preset Library Modal
 * Displays categorized built-in presets and user-saved custom templates.
 */
import React, { useState } from 'react';
import { BaseVisualElement } from './types';
import { CustomScreenTemplate } from './customTemplates';
import { X, LayoutTemplate, Trash2, Check, Sparkles } from 'lucide-react';

export interface ScreenPreset<T extends BaseVisualElement = BaseVisualElement> {
  id: string;
  name: string;
  description: string;
  category?: string;
  elements: T[];
}

export interface PresetLibraryModalProps<T extends BaseVisualElement = BaseVisualElement> {
  isOpen: boolean;
  title?: string;
  presets?: ScreenPreset<T>[];
  customTemplates?: CustomScreenTemplate<T>[];
  onClose: () => void;
  onApplyPreset: (elements: T[]) => void;
  onDeleteCustomTemplate?: (id: string) => void;
}

export const PresetLibraryModal = <T extends BaseVisualElement = BaseVisualElement>({
  isOpen,
  title = 'Preset Layout Library',
  presets = [],
  customTemplates = [],
  onClose,
  onApplyPreset,
  onDeleteCustomTemplate,
}: PresetLibraryModalProps<T>) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<'built-in' | 'custom'>('built-in');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApply = (elements: T[]) => {
    onApplyPreset(JSON.parse(JSON.stringify(elements)));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutTemplate className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-sm text-slate-100">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('built-in')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'built-in'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('editor.builtinPresets', { count: presets.length }, `Built-in Presets (${presets.length})`)}
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('editor.savedTemplatesTab', { count: customTemplates.length }, `Saved Templates (${customTemplates.length})`)}
          </button>
        </div>

        {/* Presets List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {activeTab === 'built-in' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-slate-100">{preset.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {preset.elements.length} {t('editor.elements', undefined, 'elements')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{preset.description}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApply(preset.elements);
                      }}
                      className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('editor.applyPresetConfirm', undefined, 'Apply Preset')}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'custom' && (
            <div>
              {customTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{t('editor.noSavedTemplates', undefined, 'No saved custom templates yet.')}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('editor.noSavedTemplatesDesc', undefined, 'Design your ideal layout and click "Save Template" in the top bar.')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-slate-100">{template.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            {template.elements.length} {t('editor.elements', undefined, 'elements')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{template.description}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => handleApply(template.elements)}
                          className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 shadow transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('common.apply', undefined, 'Apply')}</span>
                        </button>
                        {onDeleteCustomTemplate && (
                          <button
                            onClick={() => onDeleteCustomTemplate(template.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title={t('editor.deleteCustomTemplate', undefined, 'Delete custom template')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
