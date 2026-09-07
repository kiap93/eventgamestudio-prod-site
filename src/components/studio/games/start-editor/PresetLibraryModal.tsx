import React, { useState, useEffect } from 'react';
import { StartScreenConfig, StartScreenElement } from '../../../../games/shared/startScreenTypes';
import { START_SCREEN_PRESETS, StartScreenPreset } from './presets';
import {
  getCustomStartTemplates,
  deleteCustomStartTemplate,
  CustomStartTemplate,
} from './customTemplates';
import { GameTheme } from '../../../../themes/types';
import { X, LayoutTemplate, Trash2, Check, Sparkles } from 'lucide-react';

interface PresetLibraryModalProps {
  isOpen: boolean;
  theme?: Partial<GameTheme>;
  gameType?: string;
  onClose: () => void;
  onApplyPreset: (elements: StartScreenElement[]) => void;
}

export const PresetLibraryModal: React.FC<PresetLibraryModalProps> = ({
  isOpen,
  theme,
  gameType = 'memory-match',
  onClose,
  onApplyPreset,
}) => {
  const [activeTab, setActiveTab] = useState<'built-in' | 'custom'>('built-in');
  const [customTemplates, setCustomTemplates] = useState<CustomStartTemplate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCustomTemplates(getCustomStartTemplates(gameType));
    }
  }, [isOpen, gameType]);

  if (!isOpen) return null;

  const handleApply = (elements: StartScreenElement[]) => {
    onApplyPreset(JSON.parse(JSON.stringify(elements)));
    onClose();
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCustomStartTemplate(id);
    setCustomTemplates(getCustomStartTemplates(gameType));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <LayoutTemplate className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-sm text-slate-100">Start Screen Preset Library</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 px-5 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('built-in')}
            className={`pb-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === 'built-in'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Built-in Presets ({START_SCREEN_PRESETS.length})
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === 'custom'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Saved Custom Templates ({customTemplates.length})
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {activeTab === 'built-in' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {START_SCREEN_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-400 ring-1 ring-amber-400/50 shadow-lg'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-xs text-slate-200">{preset.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-amber-400 rounded font-mono">
                          {preset.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">
                        {typeof preset.elements === 'function' ? preset.elements(theme, gameType).length : (preset.elements as any).length} elements
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const resolved = typeof preset.elements === 'function' ? preset.elements(theme, gameType) : preset.elements;
                          handleApply(resolved);
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                      >
                        Apply Preset
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              {customTemplates.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No saved templates yet. Click &quot;Save Template&quot; in the editor top bar to create one.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 rounded-xl border bg-slate-950/60 border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs text-slate-200">{template.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-sky-400 rounded font-mono">
                            {template.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {template.description || 'Custom user template'}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                        <button
                          onClick={(e) => handleDeleteCustom(template.id, e)}
                          className="p-1 rounded hover:bg-rose-950/60 text-slate-500 hover:text-rose-400"
                          title="Delete Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleApply(template.elements)}
                          className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                        >
                          Apply Template
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-5 border-t border-slate-800 flex items-center justify-between bg-slate-950/50 shrink-0">
          <span className="text-[11px] text-slate-500">
            Applying a preset replaces the current canvas layout.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
