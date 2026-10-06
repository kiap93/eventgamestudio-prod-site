import { useLocalization } from '../../../../context/LocalizationContext';
import React, { useState, useMemo } from 'react';
import {
  ResultScreenElementType,
  ResultScreenElement,
} from '../../../../games/memory-match/types';
import { getElementIcon } from './LayerTreePanel';
import { getResultElementsGroupedByCategory } from './resultElementRegistry';
import {
  Layout,
  Plus,
  RotateCcw,
  Check,
  X,
  AlignCenterHorizontal,
  AlignCenterVertical,
  ChevronsUp,
  ChevronsDown,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Trash2,
  Copy,
  Layers,
  Sparkles,
  FolderTree,
  FolderMinus,
  Lock,
  Unlock,
  LayoutTemplate,
  BookmarkPlus,
  Undo2,
  Redo2,
} from 'lucide-react';

interface EditorTopBarProps {
  selectedIds: string[];
  totalElementsCount: number;
  gameType?: string;
  onAddNewRootElement: (type: ResultScreenElementType) => void;
  onCenterSelectedHorizontal: () => void;
  onCenterSelectedVertical: () => void;
  onMoveSelectedLayer: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onResetLayout: () => void;
  onOpenPresets?: () => void;
  onSaveAsTemplate?: () => void;
  onClose: () => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onToggleLockSelected?: () => void;
  isSelectionLocked?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  selectedIds,
  totalElementsCount,
  gameType,
  onAddNewRootElement,
  onCenterSelectedHorizontal,
  onCenterSelectedVertical,
  onMoveSelectedLayer,
  onDuplicateSelected,
  onDeleteSelected,
  onResetLayout,
  onOpenPresets,
  onSaveAsTemplate,
  onClose,
  canGroup = false,
  canUngroup = false,
  onGroupSelected,
  onUngroupSelected,
  onToggleLockSelected,
  isSelectionLocked = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const { t } = useLocalization();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const hasSelection = selectedIds.length > 0;
  const groupedElements = useMemo(() => getResultElementsGroupedByCategory(gameType), [gameType]);

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-4 flex items-center justify-between z-50 shrink-0 select-none">
      {/* Left: Branding & Resolution Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md">
            <Layout className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-100 tracking-tight flex items-center gap-2">
              <span>{t('editor.resultPresetLibraryTitle', undefined, 'Result Screen Visual Editor')}</span>
              <span className="hidden sm:inline-block text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20">
                1000 × 1000
              </span>
            </h2>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Figma-style drag, resize, rotate & layer hierarchy
            </p>
          </div>
        </div>

        {/* Add Element Button */}
        <div className="relative ml-2">
          <button
            type="button"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>{t('editor.addElement', undefined, 'Add Element')}</span>
          </button>

          {addMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAddMenuOpen(false)}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-2 space-y-2 max-h-[80vh] overflow-y-auto"
              >
                <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                  New Result Element
                </div>

                {/* Containers */}
                {groupedElements.container.length > 0 && (
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2">
                      Containers
                    </span>
                    {groupedElements.container.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                      >
                        {getElementIcon(item.type)}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Visual Elements */}
                {groupedElements.visual.length > 0 && (
                  <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2">
                      Visual Elements
                    </span>
                    {groupedElements.visual.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                      >
                        {getElementIcon(item.type)}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Live Game Stats (Game-Specific) */}
                {groupedElements.stat.length > 0 && (
                  <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        Live Game Stats
                      </span>
                      {gameType && (
                        <span className="text-[8px] font-mono font-bold text-amber-400/80 uppercase">
                          {gameType === 'reaction-time' || gameType === 'reaction-tap' ? 'Reaction' : gameType}
                        </span>
                      )}
                    </div>
                    {groupedElements.stat.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center justify-between transition-colors"
                        title={item.description}
                      >
                        <div className="flex items-center gap-2">
                          {getElementIcon(item.type)}
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Interactive Controls */}
                {groupedElements.control.length > 0 && (
                  <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2">
                      Interactive Controls
                    </span>
                    {groupedElements.control.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                      >
                        {getElementIcon(item.type)}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Contextual Selection Actions (Centering, Reorder, Group, Ungroup, Lock, Duplicate, Delete) */}
      <div className="hidden lg:flex items-center gap-2">
        {hasSelection ? (
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded-xl">
            <span className="text-[10px] font-mono text-amber-400 font-bold px-1 mr-1">
              {selectedIds.length} Selected:
            </span>

            {/* Group Button */}
            {onGroupSelected && (
              <button
                type="button"
                disabled={!canGroup}
                onClick={onGroupSelected}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors flex items-center gap-1 text-[11px] font-semibold px-1.5"
                title={canGroup ? t('editor.groupTooltip', undefined, 'Group Selected (Ctrl+G)') : t('editor.groupDisabledTooltip', undefined, 'Select 2+ sibling elements to group')}
              >
                <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xl:inline">{t('editor.group', undefined, 'Group')}</span>
              </button>
            )}

            {/* Ungroup Button */}
            {onUngroupSelected && (
              <button
                type="button"
                disabled={!canUngroup}
                onClick={onUngroupSelected}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors flex items-center gap-1 text-[11px] font-semibold px-1.5"
                title={canUngroup ? t('editor.ungroupTooltip', undefined, 'Ungroup (Ctrl+Shift+G)') : t('editor.ungroupDisabledTooltip', undefined, 'Select a group to ungroup')}
              >
                <FolderMinus className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden xl:inline">{t('editor.ungroup', undefined, 'Ungroup')}</span>
              </button>
            )}

            {/* Lock / Unlock Toggle */}
            {onToggleLockSelected && (
              <button
                type="button"
                onClick={onToggleLockSelected}
                className={`p-1 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold px-1.5 ${
                  isSelectionLocked
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title={isSelectionLocked ? 'Unlock Selection (Ctrl+L)' : 'Lock Selection (Ctrl+L)'}
              >
                {isSelectionLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                <span className="hidden xl:inline">{isSelectionLocked ? 'Locked' : 'Lock'}</span>
              </button>
            )}

            <div className="w-px h-3.5 bg-slate-800 mx-0.5" />

            {/* Center X */}
            <button
              type="button"
              onClick={onCenterSelectedHorizontal}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 transition-colors"
              title={t('editor.centerHCanvas', undefined, 'Center Horizontally')}
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>

            {/* Center Y */}
            <button
              type="button"
              onClick={onCenterSelectedVertical}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 transition-colors"
              title={t('editor.centerVCanvas', undefined, 'Center Vertically')}
            >
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-800 mx-0.5" />

            {/* Bring to Front */}
            <button
              type="button"
              onClick={() => onMoveSelectedLayer('front')}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 transition-colors"
              title={t('editor.bringToFront', undefined, 'Bring to Front')}
            >
              <ChevronsUp className="w-3.5 h-3.5" />
            </button>

            {/* Forward */}
            <button
              type="button"
              onClick={() => onMoveSelectedLayer('forward')}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title={t('editor.bringForward', undefined, 'Bring Forward')}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>

            {/* Backward */}
            <button
              type="button"
              onClick={() => onMoveSelectedLayer('backward')}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title={t('editor.sendBackward', undefined, 'Send Backward')}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            {/* Back */}
            <button
              type="button"
              onClick={() => onMoveSelectedLayer('back')}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-300 transition-colors"
              title={t('editor.sendToBack', undefined, 'Send to Back')}
            >
              <ChevronsDown className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-800 mx-0.5" />

            {/* Duplicate */}
            <button
              type="button"
              onClick={onDuplicateSelected}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title={t('editor.duplicateSelection', undefined, 'Duplicate')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={onDeleteSelected}
              className="p-1 rounded-lg hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors"
              title={t('editor.deleteSelection', undefined, 'Delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 font-medium">
            {t('editor.selectElementToEdit', undefined, 'Select elements on canvas or in layers panel to inspect & edit')}
          </div>
        )}
      </div>

      {/* Right: Undo/Redo, Presets, Save Template, Reset & Done / Save Button */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Undo / Redo Button Group */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              canUndo
                ? 'text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95'
                : 'text-slate-600 opacity-40 cursor-not-allowed'
            }`}
            title={t('editor.undoTooltip', undefined, 'Undo (Ctrl+Z)')}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px]">{t('editor.undoTooltip', undefined, 'Undo')}</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              canRedo
                ? 'text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95'
                : 'text-slate-600 opacity-40 cursor-not-allowed'
            }`}
            title={t('editor.redoTooltip', undefined, 'Redo (Ctrl+Y)')}
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px]">{t('editor.redoTooltip', undefined, 'Redo')}</span>
          </button>
        </div>

        {/* Presets Library Modal Button */}
        {onOpenPresets && (
          <button
            type="button"
            onClick={onOpenPresets}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title={t('editor.presetLibraryBtn', undefined, 'Templates')}
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('editor.presetLibraryBtn', undefined, 'Templates')}</span>
          </button>
        )}

        {/* Save As Template Button */}
        {onSaveAsTemplate && (
          <button
            type="button"
            onClick={onSaveAsTemplate}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title={t('editor.saveAsTemplateBtn', undefined, 'Save Template')}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('editor.saveAsTemplateBtn', undefined, 'Save Template')}</span>
          </button>
        )}

        {/* Reset Layout */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setResetConfirmOpen(!resetConfirmOpen)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title={t('editor.resetCanvasLayout', undefined, 'Reset')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('common.reset', undefined, 'Reset')}</span>
          </button>

          {resetConfirmOpen && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-3 space-y-2.5">
              <span className="text-xs font-bold text-slate-200 block">
                {t('editor.resetCanvasLayout', undefined, 'Reset Layout?')}
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                This will restore the standard default result screen cards and stats.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold"
                >
                  {t('common.cancel', undefined, 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetLayout();
                    setResetConfirmOpen(false);
                  }}
                  className="flex-1 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Done / Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{t('editor.saveAndClose', undefined, 'Save & Close')}</span>
        </button>
      </div>
    </header>
  );
};

