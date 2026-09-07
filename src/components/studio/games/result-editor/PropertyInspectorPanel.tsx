import React, { useRef, useState, useMemo } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultImageElement,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonElement,
  ResultLeaderboardElement,
  ResultLeaderboardStyle,
  ResultScreenElementType,
  MemoryMatchResultScreenConfig,
} from '../../../../games/memory-match/types';
import { FONT_FAMILY_PRESETS } from '../../../../games/memory-match/ResultElementContent';
import { GameTheme } from '../../../../themes/types';
import { getElementIcon } from './LayerTreePanel';
import { getAvailableContainers } from './types';
import { getResultElementsGroupedByCategory } from './resultElementRegistry';
import {
  Sliders,
  SlidersHorizontal,
  Grid,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignStartVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Layers,
  ChevronsUp,
  ChevronsDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Square,
  LogOut,
  CornerDownRight,
  FolderTree,
  FolderMinus,
  Upload,
  Loader2,
  Italic,
  Underline,
  Strikethrough,
  Box,
  PanelRightClose,
  PanelRight,
  Plus,
  Palette,
  Award,
  Trophy,
} from 'lucide-react';

interface PropertyInspectorPanelProps {
  elements: ResultScreenElement[];
  selectedIds: string[];
  selectedElement: ResultScreenElement | null;
  selectedParentElement: ResultCardElement | ResultGroupElement | null;
  selectedElements: ResultScreenElement[];
  commonParent: ResultCardElement | ResultGroupElement | null;
  resultConfig: MemoryMatchResultScreenConfig;
  theme: Partial<GameTheme>;
  onSelectId: (id: string | null) => void;
  onSelectIds: (ids: string[]) => void;
  onUpdateElementById: (id: string, updater: (prev: ResultScreenElement) => ResultScreenElement) => void;
  onUpdateMultipleElements: (updates: Record<string, Partial<ResultScreenElement>>) => void;
  onMoveLayer: (idOrIds: string | string[], direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onReparentElement: (elementId: string, newParentId: string) => void;
  onAddChildElement: (parentId: string, type: ResultScreenElementType) => void;
  onAddNewRootElement: (type: ResultScreenElementType) => void;
  onDuplicateElement: (id: string) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onGroup?: () => void;
  onUngroup?: (ids?: string[]) => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  onToggleLockSelected?: () => void;
  isSelectionLocked?: boolean;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
  onUpdateConfig: (updates: Partial<MemoryMatchResultScreenConfig>) => void;
  gameType?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const PropertyInspectorPanel: React.FC<PropertyInspectorPanelProps> = ({
  elements,
  selectedIds,
  selectedElement,
  selectedParentElement,
  selectedElements,
  commonParent,
  resultConfig,
  theme,
  gameType,
  onSelectId,
  onSelectIds,
  onUpdateElementById,
  onUpdateMultipleElements,
  onMoveLayer,
  onReparentElement,
  onAddChildElement,
  onAddNewRootElement,
  onDuplicateElement,
  onDeleteElement,
  onDuplicateSelected,
  onDeleteSelected,
  onGroup,
  onUngroup,
  canGroup = false,
  canUngroup = false,
  onToggleLockSelected,
  isSelectionLocked = false,
  onUploadAsset,
  onUpdateConfig,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const groupedElements = useMemo(() => getResultElementsGroupedByCategory(gameType), [gameType]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{
    elementId: string;
    field: 'cardBg' | 'imageUrl' | 'screenBg';
  } | null>(null);

  const canvasWidth = resultConfig.canvas?.width || 1000;
  const canvasHeight = resultConfig.canvas?.height || 1000;

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget || !onUploadAsset) return;

    try {
      setIsUploadingAsset(true);
      const url = await onUploadAsset(file, 'result-asset');
      if (url) {
        if (uploadTarget.field === 'screenBg') {
          onUpdateConfig({
            backgroundType: 'image',
            backgroundImageUrl: url,
          });
        } else if (uploadTarget.field === 'cardBg') {
          onUpdateElementById(uploadTarget.elementId, (prev) => ({
            ...prev,
            style: {
              ...(prev as ResultCardElement).style,
              backgroundImageUrl: url,
            },
          } as ResultScreenElement));
        } else if (uploadTarget.field === 'imageUrl') {
          onUpdateElementById(uploadTarget.elementId, (prev) => ({
            ...prev,
            imageUrl: url,
          } as ResultScreenElement));
        }
      }
    } catch (err) {
      console.error('Failed to upload asset', err);
    } finally {
      setIsUploadingAsset(false);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Alignment helpers for multi-selection
  const handleCenterHorizontally = () => {
    if (selectedElements.length === 0) return;
    const containerW = commonParent ? commonParent.width : canvasWidth;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const newX = Math.max(0, Math.round((containerW - el.width) / 2));
      onUpdateElementById(el.id, (prev) => ({ ...prev, x: newX }));
    } else {
      const minX = Math.min(...selectedElements.map((e) => e.x));
      const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
      const bboxW = maxX - minX;
      const targetMinX = Math.round((containerW - bboxW) / 2);
      const deltaX = targetMinX - minX;

      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newX = Math.max(0, Math.min(containerW - el.width, Math.round(el.x + deltaX)));
        updates[el.id] = { x: newX };
      }
      onUpdateMultipleElements(updates);
    }
  };

  const handleCenterVertically = () => {
    if (selectedElements.length === 0) return;
    const containerH = commonParent ? commonParent.height : canvasHeight;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const newY = Math.max(0, Math.round((containerH - el.height) / 2));
      onUpdateElementById(el.id, (prev) => ({ ...prev, y: newY }));
    } else {
      const minY = Math.min(...selectedElements.map((e) => e.y));
      const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
      const bboxH = maxY - minY;
      const targetMinY = Math.round((containerH - bboxH) / 2);
      const deltaY = targetMinY - minY;

      const updates: Record<string, Partial<ResultScreenElement>> = {};
      for (const el of selectedElements) {
        const newY = Math.max(0, Math.min(containerH - el.height, Math.round(el.y + deltaY)));
        updates[el.id] = { y: newY };
      }
      onUpdateMultipleElements(updates);
    }
  };

  const handleCenterBoth = () => {
    handleCenterHorizontally();
    handleCenterVertically();
  };

  const handleAlignLeft = () => {
    if (selectedElements.length < 2) return;
    const minX = Math.min(...selectedElements.map((e) => e.x));
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) updates[el.id] = { x: minX };
    onUpdateMultipleElements(updates);
  };

  const handleAlignCenter = () => {
    if (selectedElements.length < 2) return;
    const minX = Math.min(...selectedElements.map((e) => e.x));
    const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
    const centerX = minX + (maxX - minX) / 2;
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) {
      updates[el.id] = { x: Math.max(0, Math.round(centerX - el.width / 2)) };
    }
    onUpdateMultipleElements(updates);
  };

  const handleAlignRight = () => {
    if (selectedElements.length < 2) return;
    const maxX = Math.max(...selectedElements.map((e) => e.x + e.width));
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) {
      updates[el.id] = { x: Math.max(0, Math.round(maxX - el.width)) };
    }
    onUpdateMultipleElements(updates);
  };

  const handleAlignTop = () => {
    if (selectedElements.length < 2) return;
    const minY = Math.min(...selectedElements.map((e) => e.y));
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) updates[el.id] = { y: minY };
    onUpdateMultipleElements(updates);
  };

  const handleAlignMiddle = () => {
    if (selectedElements.length < 2) return;
    const minY = Math.min(...selectedElements.map((e) => e.y));
    const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
    const centerY = minY + (maxY - minY) / 2;
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) {
      updates[el.id] = { y: Math.max(0, Math.round(centerY - el.height / 2)) };
    }
    onUpdateMultipleElements(updates);
  };

  const handleAlignBottom = () => {
    if (selectedElements.length < 2) return;
    const maxY = Math.max(...selectedElements.map((e) => e.y + e.height));
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (const el of selectedElements) {
      updates[el.id] = { y: Math.max(0, Math.round(maxY - el.height)) };
    }
    onUpdateMultipleElements(updates);
  };

  const handleDistributeHorizontally = () => {
    if (selectedElements.length < 3) return;
    const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const last = sorted[sorted.length - 1];
    const maxX = last.x + last.width;
    const totalItemsWidth = sorted.reduce((sum, item) => sum + item.width, 0);
    const availableSpace = maxX - minX - totalItemsWidth;
    const gap = availableSpace / (sorted.length - 1);

    let currentX = minX;
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      updates[el.id] = { x: Math.round(currentX) };
      currentX += el.width + gap;
    }
    onUpdateMultipleElements(updates);
  };

  const handleDistributeVertically = () => {
    if (selectedElements.length < 3) return;
    const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const last = sorted[sorted.length - 1];
    const maxY = last.y + last.height;
    const totalItemsHeight = sorted.reduce((sum, item) => sum + item.height, 0);
    const availableSpace = maxY - minY - totalItemsHeight;
    const gap = availableSpace / (sorted.length - 1);

    let currentY = minY;
    const updates: Record<string, Partial<ResultScreenElement>> = {};
    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      updates[el.id] = { y: Math.round(currentY) };
      currentY += el.height + gap;
    }
    onUpdateMultipleElements(updates);
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-l border-slate-800 bg-slate-950 flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
          title="Expand Property Inspector"
        >
          <PanelRight className="w-4 h-4 text-amber-400" />
        </button>
        <div className="writing-mode-vertical text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" />
          <span>Properties</span>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 overflow-hidden select-none">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Inspector Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-200 block">Property Inspector</span>
            <span className="text-[10px] text-slate-500">
              {selectedElements.length > 1
                ? `${selectedElements.length} Items Selected`
                : selectedElement
                ? `${selectedElement.type.toUpperCase()} Element`
                : 'Canvas Settings'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedElements.length > 1 ? (
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {selectedElements.length} Selected
            </span>
          ) : selectedElement ? (
            <span className="text-[10px] font-mono text-amber-400 font-bold uppercase bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {selectedElement.type}
            </span>
          ) : null}

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Collapse Inspector"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs">
        {/* 1. MULTI-ELEMENT SELECTION VIEW */}
        {selectedElements.length > 1 ? (
          <div className="space-y-3">
            {/* Header / Info */}
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Grid className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                    Multi-Selection ({selectedElements.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectIds([])}
                  className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                >
                  Deselect All
                </button>
              </div>

              {/* Items chips */}
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 pt-1 border-t border-slate-800">
                {selectedElements.map((el) => (
                  <div
                    key={el.id}
                    onClick={() => onSelectIds([el.id])}
                    className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors"
                    title="Click to isolate this element"
                  >
                    {getElementIcon(el.type)}
                    <span className="font-bold text-slate-300 capitalize">{el.type}</span>
                    <span className="text-slate-500 font-mono text-[9px]">
                      ({Math.round(el.x)}, {Math.round(el.y)})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Container Centering */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                <span>Container Centering</span>
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleCenterHorizontally}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Center X</span>
                </button>
                <button
                  type="button"
                  onClick={handleCenterVertically}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                  <span>Center Y</span>
                </button>
                <button
                  type="button"
                  onClick={handleCenterBoth}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <Box className="w-3 h-3 text-amber-400" />
                  <span>Both</span>
                </button>
              </div>
            </div>

            {/* Relative Alignment */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                <span>Relative Alignment</span>
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleAlignLeft}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignLeft className="w-3 h-3 text-amber-400" />
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={handleAlignCenter}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignCenter className="w-3 h-3 text-amber-400" />
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  onClick={handleAlignRight}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignRight className="w-3 h-3 text-amber-400" />
                  <span>Right</span>
                </button>
                <button
                  type="button"
                  onClick={handleAlignTop}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignStartVertical className="w-3 h-3 text-amber-400" />
                  <span>Top</span>
                </button>
                <button
                  type="button"
                  onClick={handleAlignMiddle}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                  <span>Middle</span>
                </button>
                <button
                  type="button"
                  onClick={handleAlignBottom}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <AlignEndVertical className="w-3 h-3 text-amber-400" />
                  <span>Bottom</span>
                </button>
              </div>
            </div>

            {/* Distribution */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <AlignHorizontalDistributeCenter className="w-3 h-3 text-amber-400" />
                <span>Distribute Spacing (3+ Items)</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={selectedElements.length < 3}
                  onClick={handleDistributeHorizontally}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                >
                  <AlignHorizontalDistributeCenter className="w-3 h-3 text-amber-400" />
                  <span>Horizontal</span>
                </button>
                <button
                  type="button"
                  disabled={selectedElements.length < 3}
                  onClick={handleDistributeVertically}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                >
                  <AlignVerticalDistributeCenter className="w-3 h-3 text-amber-400" />
                  <span>Vertical</span>
                </button>
              </div>
            </div>

            {/* Layer Stacking */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>Layer Stacking</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedIds, 'front')}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronsUp className="w-3 h-3 text-amber-400" />
                  <span>Front</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedIds, 'forward')}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <ArrowUp className="w-3 h-3 text-amber-400" />
                  <span>Forward</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedIds, 'backward')}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <ArrowDown className="w-3 h-3 text-amber-400" />
                  <span>Backward</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedIds, 'back')}
                  className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <ChevronsDown className="w-3 h-3 text-amber-400" />
                  <span>Back</span>
                </button>
              </div>
            </div>

            {/* Grouping & Locking */}
            <div className="space-y-1.5 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <FolderTree className="w-3 h-3 text-amber-400" />
                <span>Group & Layer Control</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {onGroup && (
                  <button
                    type="button"
                    disabled={!canGroup}
                    onClick={onGroup}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                    title="Group selected elements into a single group (Ctrl+G)"
                  >
                    <FolderTree className="w-3 h-3 text-amber-400" />
                    <span>Group ({selectedElements.length})</span>
                  </button>
                )}

                {onUngroup && (
                  <button
                    type="button"
                    disabled={!canUngroup}
                    onClick={() => onUngroup(selectedIds)}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1 disabled:opacity-30 transition-colors"
                    title="Ungroup selected group(s) (Ctrl+Shift+G)"
                  >
                    <FolderMinus className="w-3 h-3 text-sky-400" />
                    <span>Ungroup</span>
                  </button>
                )}

                {onToggleLockSelected && (
                  <button
                    type="button"
                    onClick={onToggleLockSelected}
                    className={`col-span-2 py-1.5 px-2 border rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      isSelectionLocked
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
                    }`}
                    title="Toggle lock for all selected elements (Ctrl+L)"
                  >
                    {isSelectionLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-400" />}
                    <span>{isSelectionLocked ? 'Unlock All Selected' : 'Lock All Selected'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Batch Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onDuplicateSelected}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center gap-1.5 font-bold text-slate-200 text-xs transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate ({selectedElements.length})</span>
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="flex-1 py-2 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 rounded-xl flex items-center justify-center gap-1.5 font-bold text-rose-300 text-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedElements.length})</span>
              </button>
            </div>
          </div>
        ) : selectedElement ? (
          /* 2. SINGLE ELEMENT INSPECTOR */
          <div className="space-y-3">
            {/* Element Header & Quick Actions */}
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {getElementIcon(selectedElement.type)}
                  <span className="font-bold text-slate-100 uppercase tracking-wider text-xs">
                    {selectedElement.type}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Lock Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        locked: !prev.locked,
                      }))
                    }
                    className={`p-1.5 rounded-lg border transition-colors ${
                      selectedElement.locked
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                    title={selectedElement.locked ? 'Unlock Element' : 'Lock Element'}
                  >
                    {selectedElement.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        visible: prev.visible === false ? true : false,
                      }))
                    }
                    className={`p-1.5 rounded-lg border transition-colors ${
                      selectedElement.visible !== false
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                        : 'bg-rose-950/40 border-rose-900/50 text-rose-400'
                    }`}
                    title={selectedElement.visible !== false ? 'Hide Element' : 'Show Element'}
                  >
                    {selectedElement.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Duplicate */}
                  <button
                    type="button"
                    onClick={() => onDuplicateElement(selectedElement.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => onDeleteElement(selectedElement.id)}
                    className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 text-rose-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ID info */}
              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
                <span className="text-slate-500 font-medium">ID:</span>
                <span className="font-mono text-slate-400 truncate max-w-[170px]">{selectedElement.id}</span>
              </div>
            </div>

            {/* Transform & Dimensions (1000x1000 Logical Units) */}
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Position & Size (1000×1000)
                </span>
                {selectedParentElement && (
                  <span className="text-[9px] font-mono text-blue-400 bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-900/50">
                    Inside {selectedParentElement.type}
                  </span>
                )}
              </div>

              {/* X, Y, W, H Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>X Pos</span>
                    <span className="font-mono text-amber-400/80">{Math.round(selectedElement.x)}</span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.x)}
                    onChange={(e) =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        x: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>Y Pos</span>
                    <span className="font-mono text-amber-400/80">{Math.round(selectedElement.y)}</span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.y)}
                    onChange={(e) =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        y: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>Width</span>
                    <span className="font-mono text-amber-400/80">{Math.round(selectedElement.width)}</span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.width)}
                    onChange={(e) =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        width: Math.max(20, parseInt(e.target.value) || 20),
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>Height</span>
                    <span className="font-mono text-amber-400/80">{Math.round(selectedElement.height)}</span>
                  </label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.height)}
                    onChange={(e) =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        height: Math.max(20, parseInt(e.target.value) || 20),
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Quick Centering within parent */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleCenterHorizontally}
                  className="flex-1 py-1 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-300 text-[10px] font-semibold flex items-center justify-center gap-1"
                >
                  <AlignCenterHorizontal className="w-3 h-3 text-amber-400" />
                  <span>Center X</span>
                </button>
                <button
                  type="button"
                  onClick={handleCenterVertically}
                  className="flex-1 py-1 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-300 text-[10px] font-semibold flex items-center justify-center gap-1"
                >
                  <AlignCenterVertical className="w-3 h-3 text-amber-400" />
                  <span>Center Y</span>
                </button>
              </div>

              {/* Rotation */}
              <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400">Rotation</span>
                  <span className="font-mono text-amber-400">{Math.round(selectedElement.rotation || 0)}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={Math.round(selectedElement.rotation || 0)}
                    onChange={(e) =>
                      onUpdateElementById(selectedElement.id, (prev) => ({
                        ...prev,
                        rotation: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1">
                    {[0, 90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() =>
                          onUpdateElementById(selectedElement.id, (prev) => ({
                            ...prev,
                            rotation: deg,
                          }))
                        }
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                          (selectedElement.rotation || 0) === deg
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Opacity */}
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400">Opacity</span>
                  <span className="font-mono text-amber-400">
                    {Math.round((selectedElement.opacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((selectedElement.opacity ?? 1) * 100)}
                  onChange={(e) =>
                    onUpdateElementById(selectedElement.id, (prev) => ({
                      ...prev,
                      opacity: parseInt(e.target.value) / 100,
                    }))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Layer Z-Ordering & Hierarchy Placement */}
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hierarchy & Layer
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  Z-Index: {selectedElement.zIndex ?? 1}
                </span>
              </div>

              {/* Reparenting Selector */}
              {(() => {
                const available = getAvailableContainers(selectedElement.id, elements);
                return (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Container Placement:</label>
                    <select
                      value={selectedParentElement ? selectedParentElement.id : 'root'}
                      onChange={(e) => onReparentElement(selectedElement.id, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs truncate"
                    >
                      <option value="root">Root Canvas (1000×1000)</option>
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>
                          Move into: {c.type === 'card' ? 'Card' : 'Group'} ({c.id.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* 4-Way Layer Reorder Buttons */}
              <div className="grid grid-cols-4 gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedElement.id, 'front')}
                  className="py-1 px-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[10px] font-medium flex flex-col items-center gap-0.5"
                  title="Bring To Front"
                >
                  <ChevronsUp className="w-3 h-3 text-amber-400" />
                  <span>Front</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedElement.id, 'forward')}
                  className="py-1 px-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[10px] font-medium flex flex-col items-center gap-0.5"
                  title="Bring Forward (1 step)"
                >
                  <ArrowUp className="w-3 h-3 text-amber-400" />
                  <span>Forward</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedElement.id, 'backward')}
                  className="py-1 px-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[10px] font-medium flex flex-col items-center gap-0.5"
                  title="Send Backward (1 step)"
                >
                  <ArrowDown className="w-3 h-3 text-amber-400" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveLayer(selectedElement.id, 'back')}
                  className="py-1 px-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 text-[10px] font-medium flex flex-col items-center gap-0.5"
                  title="Send To Back"
                >
                  <ChevronsDown className="w-3 h-3 text-amber-400" />
                  <span>Bottom</span>
                </button>
              </div>
            </div>

            {/* TYPE-SPECIFIC STYLING CONTROLS */}

            {/* A. TEXT ELEMENT */}
            {selectedElement.type === 'text' && (() => {
              const textEl = selectedElement as ResultTextElement;
              const style = textEl.style || {};
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Text Content & Typography
                  </span>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Content String</label>
                    <input
                      type="text"
                      value={textEl.text || ''}
                      onChange={(e) =>
                        onUpdateElementById(textEl.id, (prev) => ({
                          ...prev,
                          text: e.target.value,
                        } as ResultScreenElement))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Font Family</label>
                      <select
                        value={style.fontFamily || 'inherit'}
                        onChange={(e) =>
                          onUpdateElementById(textEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultTextElement).style, fontFamily: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                      >
                        {FONT_FAMILY_PRESETS.map((f) => (
                          <option key={f.label} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Font Size</label>
                      <input
                        type="number"
                        value={style.fontSize || 32}
                        onChange={(e) =>
                          onUpdateElementById(textEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultTextElement).style,
                              fontSize: parseInt(e.target.value) || 20,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Text Align & Styles */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() =>
                            onUpdateElementById(textEl.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultTextElement).style, textAlign: align },
                            } as ResultScreenElement))
                          }
                          className={`p-1 rounded ${
                            (style.textAlign || 'center') === align
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {align === 'left' && <AlignLeft className="w-3 h-3" />}
                          {align === 'center' && <AlignCenter className="w-3 h-3" />}
                          {align === 'right' && <AlignRight className="w-3 h-3" />}
                          {align === 'justify' && <AlignJustify className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>

                    {/* Color */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Color:</span>
                      <input
                        type="color"
                        value={style.color?.startsWith('#') && style.color.length === 7 ? style.color : '#fbbf24'}
                        onChange={(e) =>
                          onUpdateElementById(textEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultTextElement).style, color: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* B. CARD CONTAINER ELEMENT */}
            {selectedElement.type === 'card' && (() => {
              const cardEl = selectedElement as ResultCardElement;
              const style = cardEl.style || {};
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Card Background & Frame
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Border Radius</label>
                      <input
                        type="number"
                        value={style.borderRadius ?? 24}
                        onChange={(e) =>
                          onUpdateElementById(cardEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultCardElement).style,
                              borderRadius: parseInt(e.target.value) || 0,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Border Width</label>
                      <input
                        type="number"
                        value={style.borderWidth ?? 1}
                        onChange={(e) =>
                          onUpdateElementById(cardEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultCardElement).style,
                              borderWidth: parseInt(e.target.value) || 0,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">BG Color:</span>
                      <input
                        type="color"
                        value={
                          style.backgroundColor?.startsWith('#') && style.backgroundColor.length === 7
                            ? style.backgroundColor
                            : '#0f172a'
                        }
                        onChange={(e) =>
                          onUpdateElementById(cardEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultCardElement).style, backgroundColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Border Color:</span>
                      <input
                        type="color"
                        value={
                          style.borderColor?.startsWith('#') && style.borderColor.length === 7
                            ? style.borderColor
                            : '#334155'
                        }
                        onChange={(e) =>
                          onUpdateElementById(cardEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultCardElement).style, borderColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Background Image Upload */}
                  {onUploadAsset && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Background Image:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTarget({ elementId: cardEl.id, field: 'cardBg' });
                          fileInputRef.current?.click();
                        }}
                        disabled={isUploadingAsset}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
                      >
                        {isUploadingAsset ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        <span>Upload BG</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* C. STATISTIC ELEMENTS (Score, Moves, Pairs, Time, Accuracy, Reaction Metrics, Rating, Rounds) */}
            {(selectedElement.type === 'score' ||
              selectedElement.type === 'moves' ||
              selectedElement.type === 'pairs' ||
              selectedElement.type === 'time' ||
              selectedElement.type === 'accuracy' ||
              selectedElement.type === 'average-reaction' ||
              selectedElement.type === 'best-reaction' ||
              selectedElement.type === 'worst-reaction' ||
              selectedElement.type === 'rating' ||
              selectedElement.type === 'round-results') && (() => {
              const statEl = selectedElement as any;
              const style = statEl.style || {};
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Stat Metric Styling
                  </span>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Custom Label</label>
                    <input
                      type="text"
                      value={statEl.label || ''}
                      onChange={(e) =>
                        onUpdateElementById(statEl.id, (prev) => ({
                          ...prev,
                          label: e.target.value,
                        } as ResultScreenElement))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Layout</label>
                      <select
                        value={style.layout || 'vertical'}
                        onChange={(e) =>
                          onUpdateElementById(statEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultScoreElement).style,
                              layout: e.target.value as 'vertical' | 'horizontal',
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                      >
                        <option value="vertical">Stacked (Vertical)</option>
                        <option value="horizontal">Side-by-Side (Horizontal)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Value Font Size</label>
                      <input
                        type="number"
                        value={style.fontSize || 28}
                        onChange={(e) =>
                          onUpdateElementById(statEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultScoreElement).style,
                              fontSize: parseInt(e.target.value) || 20,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Label Color:</span>
                      <input
                        type="color"
                        value={style.labelColor?.startsWith('#') && style.labelColor.length === 7 ? style.labelColor : '#94a3b8'}
                        onChange={(e) =>
                          onUpdateElementById(statEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultScoreElement).style, labelColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Value Color:</span>
                      <input
                        type="color"
                        value={style.valueColor?.startsWith('#') && style.valueColor.length === 7 ? style.valueColor : '#fbbf24'}
                        onChange={(e) =>
                          onUpdateElementById(statEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultScoreElement).style, valueColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* D. IMAGE ELEMENT */}
            {selectedElement.type === 'image' && (() => {
              const imgEl = selectedElement as ResultImageElement;
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Image Box & Asset
                  </span>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Image URL</label>
                    <input
                      type="text"
                      value={imgEl.imageUrl || ''}
                      placeholder="https://... or upload"
                      onChange={(e) =>
                        onUpdateElementById(imgEl.id, (prev) => ({
                          ...prev,
                          imageUrl: e.target.value,
                        } as ResultScreenElement))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                    />
                  </div>

                  {onUploadAsset && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTarget({ elementId: imgEl.id, field: 'imageUrl' });
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploadingAsset}
                      className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>Upload New Image</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* E. BUTTON ELEMENT */}
            {selectedElement.type === 'button' && (() => {
              const btnEl = selectedElement as ResultButtonElement;
              const style = btnEl.style || {};
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Button Action & Appearance
                  </span>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">Button Label</label>
                    <input
                      type="text"
                      value={btnEl.text || ''}
                      onChange={(e) =>
                        onUpdateElementById(btnEl.id, (prev) => ({
                          ...prev,
                          text: e.target.value,
                        } as ResultScreenElement))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-bold text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Action</label>
                      <select
                        value={btnEl.action || 'playAgain'}
                        onChange={(e) =>
                          onUpdateElementById(btnEl.id, (prev) => ({
                            ...prev,
                            action: e.target.value,
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                      >
                        <option value="playAgain">Play Again (Restart)</option>
                        <option value="exit">Exit Game</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Corner Radius</label>
                      <input
                        type="number"
                        value={style.borderRadius ?? 18}
                        onChange={(e) =>
                          onUpdateElementById(btnEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultButtonElement).style,
                              borderRadius: parseInt(e.target.value) || 0,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">BG Color:</span>
                      <input
                        type="color"
                        value={style.backgroundColor?.startsWith('#') && style.backgroundColor.length === 7 ? style.backgroundColor : '#f59e0b'}
                        onChange={(e) =>
                          onUpdateElementById(btnEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultButtonElement).style, backgroundColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Text Color:</span>
                      <input
                        type="color"
                        value={style.textColor?.startsWith('#') && style.textColor.length === 7 ? style.textColor : '#020617'}
                        onChange={(e) =>
                          onUpdateElementById(btnEl.id, (prev) => ({
                            ...prev,
                            style: { ...(prev as ResultButtonElement).style, textColor: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* F. LEADERBOARD ELEMENT */}
            {selectedElement.type === 'leaderboard' && (() => {
              const lbEl = selectedElement as ResultLeaderboardElement;
              const style = lbEl.style || {};

              const maxRows = lbEl.maxRows ?? style.maxRows ?? 5;
              const showHeader = (lbEl.showHeader ?? style.showHeader) !== false;
              const headerText = lbEl.headerText || style.headerText || 'LEADERBOARD';
              const showRank = (lbEl.showRank ?? style.showRank) !== false;
              const showPlayerName = (lbEl.showPlayerName ?? style.showPlayerName) !== false;
              const showScore = (lbEl.showScore ?? style.showScore) !== false;
              const showMoves = Boolean(lbEl.showMoves ?? style.showMoves);
              const showTime = Boolean(lbEl.showTime ?? style.showTime);
              const showAccuracy = Boolean(lbEl.showAccuracy ?? style.showAccuracy);
              const highlightCurrentPlayer = style.highlightCurrentPlayer !== false;

              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5" />
                      <span>Leaderboard Settings</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Dynamic Ranking</span>
                  </div>

                  {/* Header Title & Visibility */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-400">Header Title</label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showHeader}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showHeader: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showHeader: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[10px] text-slate-400">Show</span>
                      </label>
                    </div>
                    {showHeader && (
                      <input
                        type="text"
                        value={headerText}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            headerText: e.target.value,
                            style: { ...(prev as ResultLeaderboardElement).style, headerText: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-bold text-xs"
                      />
                    )}
                  </div>

                  {/* Max Rows (1 to 10) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-400">Displayed Rows</label>
                      <span className="text-[10px] font-mono text-amber-400 font-bold">{maxRows}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={maxRows}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 5;
                        onUpdateElementById(lbEl.id, (prev) => ({
                          ...prev,
                          maxRows: val,
                          style: { ...(prev as ResultLeaderboardElement).style, maxRows: val },
                        } as ResultScreenElement));
                      }}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  {/* Visible Columns Grid */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Visible Columns
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRank}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showRank: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showRank: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Rank (#)</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showPlayerName}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showPlayerName: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showPlayerName: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Player Name</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showScore}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showScore: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showScore: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Score</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showMoves}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showMoves: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showMoves: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Moves</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showTime}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showTime: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showTime: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Time</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-slate-300 p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showAccuracy}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              showAccuracy: e.target.checked,
                              style: { ...(prev as ResultLeaderboardElement).style, showAccuracy: e.target.checked },
                            } as ResultScreenElement))
                          }
                          className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3 h-3"
                        />
                        <span className="text-[11px]">Accuracy</span>
                      </label>
                    </div>
                  </div>

                  {/* Highlight Current Player Option */}
                  <div className="pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={highlightCurrentPlayer}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultLeaderboardElement).style,
                              highlightCurrentPlayer: e.target.checked,
                            },
                          } as ResultScreenElement))
                        }
                        className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Highlight Current Player Row</span>
                    </label>
                  </div>

                  {/* Typography & Sizing */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Base Font Size</label>
                      <input
                        type="number"
                        value={style.fontSize ?? 16}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultLeaderboardElement).style,
                              fontSize: parseInt(e.target.value) || 16,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Corner Radius</label>
                      <input
                        type="number"
                        value={style.borderRadius ?? 18}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            style: {
                              ...(prev as ResultLeaderboardElement).style,
                              borderRadius: parseInt(e.target.value) || 0,
                            },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Theme Colors
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 block">Header</span>
                        <input
                          type="color"
                          value={style.headerColor?.startsWith('#') && style.headerColor.length === 7 ? style.headerColor : '#fbbf24'}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultLeaderboardElement).style, headerColor: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 block">Scores</span>
                        <input
                          type="color"
                          value={style.scoreColor?.startsWith('#') && style.scoreColor.length === 7 ? style.scoreColor : '#fbbf24'}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultLeaderboardElement).style, scoreColor: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 block">Text</span>
                        <input
                          type="color"
                          value={style.textColor?.startsWith('#') && style.textColor.length === 7 ? style.textColor : '#f8fafc'}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              style: { ...(prev as ResultLeaderboardElement).style, textColor: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Player Submission Form Labels & Config */}
                  <div className="space-y-2 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Player Submission Form
                    </span>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Input Placeholder</label>
                      <input
                        type="text"
                        value={lbEl.inputPlaceholder ?? style.inputPlaceholder ?? lbEl.submission?.inputPlaceholder ?? 'Enter your name'}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            inputPlaceholder: e.target.value,
                            style: { ...(prev as ResultLeaderboardElement).style, inputPlaceholder: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Max Name Length</label>
                        <input
                          type="number"
                          min={3}
                          max={50}
                          value={lbEl.inputMaxLength ?? style.inputMaxLength ?? lbEl.submission?.inputMaxLength ?? 20}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 20;
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              inputMaxLength: val,
                              style: { ...(prev as ResultLeaderboardElement).style, inputMaxLength: val },
                            } as ResultScreenElement));
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400">Button Label</label>
                        <input
                          type="text"
                          value={lbEl.submitButtonText ?? style.submitButtonText ?? lbEl.submission?.submitButtonText ?? 'SUBMIT SCORE'}
                          onChange={(e) =>
                            onUpdateElementById(lbEl.id, (prev) => ({
                              ...prev,
                              submitButtonText: e.target.value,
                              style: { ...(prev as ResultLeaderboardElement).style, submitButtonText: e.target.value },
                            } as ResultScreenElement))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs font-semibold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400">Success Message</label>
                      <input
                        type="text"
                        value={lbEl.successMessage ?? style.successMessage ?? lbEl.submission?.successMessage ?? 'Score submitted!'}
                        onChange={(e) =>
                          onUpdateElementById(lbEl.id, (prev) => ({
                            ...prev,
                            successMessage: e.target.value,
                            style: { ...(prev as ResultLeaderboardElement).style, successMessage: e.target.value },
                          } as ResultScreenElement))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* G. GROUP CONTAINER ELEMENT */}
            {selectedElement.type === 'group' && (() => {
              const groupEl = selectedElement as ResultGroupElement;
              const childCount = groupEl.children?.length || 0;
              return (
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <FolderTree className="w-3 h-3 text-amber-400" />
                      <span>Group Container ({childCount} items)</span>
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    This group acts as a unified coordinate frame for its children. Moving, rotating, or scaling the group preserves child relative positions.
                  </p>

                  <div className="pt-1 space-y-2">
                    {onUngroup && (
                      <button
                        type="button"
                        onClick={() => onUngroup([groupEl.id])}
                        className="w-full py-2 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/60 rounded-xl text-sky-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        title="Unpack group children into parent coordinate system (Ctrl+Shift+G)"
                      >
                        <FolderMinus className="w-4 h-4 text-sky-400" />
                        <span>Ungroup Elements</span>
                      </button>
                    )}

                    <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">Children in this group:</span>
                      {childCount === 0 ? (
                        <span className="text-[10px] text-slate-500 italic">No children</span>
                      ) : (
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                          {groupEl.children.map((c) => (
                            <div
                              key={c.id}
                              onClick={() => onSelectId(c.id)}
                              className="flex items-center justify-between p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {getElementIcon(c.type)}
                                <span className="text-slate-300 font-medium capitalize truncate">{c.type}</span>
                              </div>
                              <span className="text-slate-500 font-mono text-[9px] shrink-0">
                                ({Math.round(c.x)}, {Math.round(c.y)})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* 3. EMPTY STATE / CANVAS SETTINGS */
          <div className="space-y-4">
            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-slate-100 text-xs uppercase tracking-wider">
                  Canvas Properties
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Logical canvas space is locked at <strong>1000 × 1000</strong> coordinates. Elements scale dynamically to any screen resolution.
              </p>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Total Elements: <strong className="text-amber-300">{elements.length}</strong></span>
                <span>Coordinates: <strong className="text-slate-200">1000 × 1000</strong></span>
              </div>
            </div>

            {/* Quick Add Elements */}
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3 h-3 text-amber-400" />
                <span>Add Elements to Canvas</span>
              </span>

              {/* CONTAINERS */}
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Containers
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddNewRootElement('card')}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center gap-2 text-left text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {getElementIcon('card')}
                    <span className="truncate">Card Container</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddNewRootElement('group')}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center gap-2 text-left text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {getElementIcon('group')}
                    <span className="truncate">Group Wrapper</span>
                  </button>
                </div>
              </div>

              {/* VISUAL ELEMENTS */}
              <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Visual Elements
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddNewRootElement('text')}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center gap-2 text-left text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {getElementIcon('text')}
                    <span className="truncate">Text Block</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddNewRootElement('image')}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center gap-2 text-left text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {getElementIcon('image')}
                    <span className="truncate">Image / Icon</span>
                  </button>
                </div>
              </div>

              {/* LIVE GAME STATS */}
              {groupedElements.stat.length > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    Live Game Stats
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {groupedElements.stat.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => onAddNewRootElement(item.type)}
                        className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between text-left text-xs font-semibold text-slate-200 transition-colors"
                        title={item.description}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getElementIcon(item.type)}
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold shrink-0 ml-1">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* INTERACTIVE CONTROLS */}
              <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  Interactive Controls
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAddNewRootElement('button')}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center gap-2 text-left text-xs font-semibold text-slate-200 transition-colors"
                  >
                    {getElementIcon('button')}
                    <span className="truncate">Button</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Screen Background Configuration */}
            <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Palette className="w-3 h-3 text-amber-400" />
                <span>Screen Background</span>
              </span>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">Background Type</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['theme', 'color', 'image'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onUpdateConfig({ backgroundType: type })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                        (resultConfig.backgroundType || 'theme') === type
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {resultConfig.backgroundType === 'color' && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-300">Solid Color:</span>
                  <input
                    type="color"
                    value={resultConfig.backgroundColor || '#0f172a'}
                    onChange={(e) => onUpdateConfig({ backgroundColor: e.target.value })}
                    className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                </div>
              )}

              {onUploadAsset && resultConfig.backgroundType === 'image' && (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadTarget({ elementId: 'screen', field: 'screenBg' });
                      fileInputRef.current?.click();
                    }}
                    disabled={isUploadingAsset}
                    className="w-full py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5"
                  >
                    {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>Upload Screen Wallpaper</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
