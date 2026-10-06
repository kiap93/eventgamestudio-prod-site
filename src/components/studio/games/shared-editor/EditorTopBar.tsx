/**
 * Shared Visual Editor Engine - Editor Top Bar
 * Top navigation toolbar with quick alignment, z-order operations, undo/redo,
 * preset libraries, preview toggle, and save/close actions.
 */
import React, { useState } from 'react';
import { AlignmentType } from './types';
import { ElementCategoryGroup } from './LayerTreePanel';
import { useLocalization } from '../../../../context/LocalizationContext';
import {
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ChevronsUp,
  ChevronsDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Layers,
  FolderTree,
  LayoutTemplate,
  BookmarkPlus,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  RotateCcw,
  Check,
  X,
  Plus,
} from 'lucide-react';

export interface EditorTopBarProps {
  title?: string;
  selectedIds: string[];
  totalElementsCount: number;
  canvasWidth?: number;
  canvasHeight?: number;
  orientation?: string;
  isPreviewMode?: boolean;
  onTogglePreview?: () => void;
  onAddNewRootElement?: (type: any) => void;
  availableElementCategories?: ElementCategoryGroup[];
  onAlignSelected?: (type: AlignmentType) => void;
  onCenterSelectedHorizontal?: () => void;
  onCenterSelectedVertical?: () => void;
  onMoveSelectedLayer?: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
  onResetLayout?: () => void;
  onOpenPresets?: () => void;
  onSaveAsTemplate?: () => void;
  onClose?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  canGroup?: boolean;
  canUngroup?: boolean;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  title = 'Visual Screen Editor',
  selectedIds,
  totalElementsCount,
  canvasWidth,
  canvasHeight,
  orientation,
  isPreviewMode = false,
  onTogglePreview,
  onAddNewRootElement,
  availableElementCategories = [],
  onAlignSelected,
  onCenterSelectedHorizontal,
  onCenterSelectedVertical,
  onMoveSelectedLayer,
  onDuplicateSelected,
  onDeleteSelected,
  onResetLayout,
  onOpenPresets,
  onSaveAsTemplate,
  onClose,
  onSave,
  isSaving = false,
  canGroup = false,
  canUngroup = false,
  onGroupSelected,
  onUngroupSelected,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const { t } = useLocalization();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left: Title, Canvas Badge, and Presets / Templates */}
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <span>{title}</span>
            {canvasWidth && canvasHeight && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 font-semibold border border-slate-700">
                {canvasWidth}×{canvasHeight}
                {orientation ? ` (${orientation})` : ''}
              </span>
            )}
          </h2>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            disabled={!canUndo}
            onClick={onUndo}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title={t('common.undoShortcut', undefined, 'Undo (Cmd Z)')}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            disabled={!canRedo}
            onClick={onRedo}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title={t('common.redoShortcut', undefined, 'Redo (Cmd Shift Z)')}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Presets & Templates */}
        <div className="flex items-center gap-1.5">
          {onOpenPresets && (
            <button
              onClick={onOpenPresets}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title={t('editor.applyPresetLayout', undefined, 'Apply preset layout template')}
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('studio.presets', undefined, 'Presets')}</span>
            </button>
          )}

          {onSaveAsTemplate && (
            <button
              onClick={onSaveAsTemplate}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              title={t('editor.saveCurrentLayoutAsTemplate', undefined, 'Save current layout as a custom template')}
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('studio.saveTemplate', undefined, 'Save Template')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Center: Alignment & Selection Tools */}
      <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
        {/* Alignment Controls */}
        <button
          disabled={!hasSelection || !onAlignSelected}
          onClick={() => onAlignSelected?.('left')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.alignLeft', undefined, 'Align Left')}
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          disabled={!hasSelection || (!onAlignSelected && !onCenterSelectedHorizontal)}
          onClick={() => (onAlignSelected ? onAlignSelected('center-h') : onCenterSelectedHorizontal?.())}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.centerHorizontally', undefined, 'Center Horizontally')}
        >
          <AlignCenterHorizontal className="w-4 h-4" />
        </button>
        <button
          disabled={!hasSelection || !onAlignSelected}
          onClick={() => onAlignSelected?.('right')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.alignRight', undefined, 'Align Right')}
        >
          <AlignRight className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-800 mx-0.5" />

        <button
          disabled={!hasSelection || !onAlignSelected}
          onClick={() => onAlignSelected?.('top')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.alignTop', undefined, 'Align Top')}
        >
          <AlignStartVertical className="w-4 h-4" />
        </button>
        <button
          disabled={!hasSelection || (!onAlignSelected && !onCenterSelectedVertical)}
          onClick={() => (onAlignSelected ? onAlignSelected('center-v') : onCenterSelectedVertical?.())}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.centerVertically', undefined, 'Center Vertically')}
        >
          <AlignCenterVertical className="w-4 h-4" />
        </button>
        <button
          disabled={!hasSelection || !onAlignSelected}
          onClick={() => onAlignSelected?.('bottom')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.alignBottom', undefined, 'Align Bottom')}
        >
          <AlignEndVertical className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-800 mx-0.5" />

        {/* Distribution */}
        <button
          disabled={selectedIds.length < 3 || !onAlignSelected}
          onClick={() => onAlignSelected?.('distribute-h')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.distributeHorizontally', undefined, 'Distribute Horizontally')}
        >
          <AlignHorizontalDistributeCenter className="w-4 h-4" />
        </button>
        <button
          disabled={selectedIds.length < 3 || !onAlignSelected}
          onClick={() => onAlignSelected?.('distribute-v')}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('editor.distributeVertically', undefined, 'Distribute Vertically')}
        >
          <AlignVerticalDistributeCenter className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-800 mx-0.5" />

        {/* Quick Duplicate & Delete */}
        <button
          disabled={!hasSelection || !onDuplicateSelected}
          onClick={onDuplicateSelected}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('common.duplicate', undefined, 'Duplicate')}
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          disabled={!hasSelection || !onDeleteSelected}
          onClick={onDeleteSelected}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-rose-400 hover:text-rose-300 disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('common.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Preview, Reset, Save, Close */}
      <div className="flex items-center gap-2">
        {/* Preview Mode Toggle */}
        {onTogglePreview && (
          <button
            onClick={onTogglePreview}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isPreviewMode
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={t('editor.toggleLiveScreenPreview', undefined, 'Toggle Live Screen Preview')}
          >
            {isPreviewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isPreviewMode ? t('event.exitPreview') : t('event.previewGame')}</span>
          </button>
        )}

        {/* Reset Layout */}
        {onResetLayout && (
          <button
            onClick={onResetLayout}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            title={t('common.reset')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

        {/* Save / Done Button */}
        {onSave && (
          <button
            disabled={isSaving}
            onClick={onSave}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? t('common.saving') : t('common.save')}</span>
          </button>
        )}

        {/* Close / Back Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
