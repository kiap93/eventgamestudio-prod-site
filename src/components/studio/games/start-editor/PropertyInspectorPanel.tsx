import React, { useRef, useState } from 'react';
import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenTextElement,
  StartScreenTitleElement,
  StartScreenDescriptionElement,
  StartScreenImageElement,
  StartScreenButtonElement,
  StartScreenBadgeElement,
  StartScreenRulesElement,
  StartScreenIconElement,
  StartScreenLeaderboardElement,
  StartScreenConfig,
  StartBadgeMetric,
  StartButtonAction,
} from '../../../../games/shared/startScreenTypes';
import { GameTheme } from '../../../../themes/types';
import { getAvailableContainers } from './types';
import { getStartElementIcon } from './LayerTreePanel';
import { AlignmentType, alignElements } from './alignmentOperations';
import {
  Sliders,
  Layers,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Image as ImageIcon,
  Palette,
  Type,
  Maximize2,
  RotateCw,
  FolderInput,
  Sparkles,
  Settings,
  Grid3X3,
  Play,
  Trophy,
  HelpCircle,
  Zap,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignCenterHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  FolderTree,
  FolderMinus,
} from 'lucide-react';

interface PropertyInspectorPanelProps {
  selectedElement: StartScreenElement | null;
  selectedIds: string[];
  elements: StartScreenElement[];
  startConfig: StartScreenConfig;
  theme: Partial<GameTheme>;
  gameType?: string;
  onUpdateElement: (updater: (prev: StartScreenElement) => StartScreenElement) => void;
  onUpdateConfig: (updater: (prev: StartScreenConfig) => StartScreenConfig) => void;
  onAlignSelected?: (type: AlignmentType) => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
  onToggleLockSelected?: () => void;
  onToggleVisibilitySelected?: () => void;
  onMoveToContainer?: (elementId: string, targetContainerId: string | null) => void;
  onUploadAsset?: (file: File, type: string) => Promise<string>;
  canGroup?: boolean;
  onGroupSelected?: () => void;
}

export const PropertyInspectorPanel: React.FC<PropertyInspectorPanelProps> = ({
  selectedElement,
  selectedIds,
  elements,
  startConfig,
  theme,
  gameType = 'memory-match',
  onUpdateElement,
  onUpdateConfig,
  onAlignSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onToggleLockSelected,
  onToggleVisibilitySelected,
  onMoveToContainer,
  onUploadAsset,
  canGroup,
  onGroupSelected,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<
    | { type: 'screenBg' }
    | { type: 'imageEl'; elementId: string }
    | { type: 'cardBg'; elementId: string }
    | null
  >(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const canvasWidth = startConfig?.canvas?.width || 1024;
  const canvasHeight = startConfig?.canvas?.height || 576;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget || !onUploadAsset) return;

    try {
      setIsUploading(true);
      const url = await onUploadAsset(file, 'start-asset');
      if (url) {
        if (uploadTarget.type === 'screenBg') {
          onUpdateConfig((prev) => ({
            ...prev,
            backgroundType: 'image',
            backgroundImageUrl: url,
            background: {
              ...(prev.background || { type: 'image' }),
              type: 'image',
              imageUrl: url,
            },
          }));
        } else if (uploadTarget.type === 'imageEl') {
          onUpdateElement((prev) => ({
            ...prev,
            imageUrl: url,
          }));
        } else if (uploadTarget.type === 'cardBg') {
          onUpdateElement((prev) => ({
            ...prev,
            style: {
              ...(prev as StartScreenCardElement).style,
              backgroundImageUrl: url,
            },
          }));
        }
      }
    } catch (err) {
      console.error('Failed to upload start screen asset:', err);
    } finally {
      setIsUploading(false);
      setUploadTarget(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const currentBgType = (() => {
    const raw = startConfig.backgroundType || startConfig.background?.type || 'theme';
    if (raw === 'solid' || raw === 'color') return 'color';
    if (raw === 'image') return 'image';
    return 'theme';
  })();

  // If no element selected, render Canvas & Screen Settings
  if (!selectedElement || selectedIds.length === 0) {
    return (
      <div className="w-80 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 select-none z-20 overflow-y-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="h-12 px-4 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <Palette className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-xs text-slate-200">Start Screen Canvas</span>
        </div>

        <div className="p-4 space-y-5 text-xs text-slate-300">
          {/* Background Mode */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Screen Background
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(['theme', 'color', 'image'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      backgroundType: mode,
                      background: {
                        ...(prev.background || { type: mode }),
                        type: mode,
                      },
                    }))
                  }
                  className={`py-1.5 rounded text-[11px] font-bold capitalize transition-colors ${
                    currentBgType === mode
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Color Background */}
          {currentBgType === 'color' && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={startConfig.backgroundColor || startConfig.background?.color || '#0f172a'}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      backgroundColor: e.target.value,
                      background: {
                        ...(prev.background || { type: 'color' }),
                        color: e.target.value,
                      },
                    }))
                  }
                  className="w-8 h-8 rounded border border-slate-700 bg-slate-950 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={startConfig.backgroundColor || startConfig.background?.color || '#0f172a'}
                  onChange={(e) =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      backgroundColor: e.target.value,
                      background: {
                        ...(prev.background || { type: 'color' }),
                        color: e.target.value,
                      },
                    }))
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          )}

          {/* Image Background */}
          {currentBgType === 'image' && (
            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400">Background Image</label>
              <input
                type="text"
                placeholder="https://... or /assets/..."
                value={startConfig.backgroundImageUrl || startConfig.background?.imageUrl || ''}
                onChange={(e) =>
                  onUpdateConfig((prev) => ({
                    ...prev,
                    backgroundImageUrl: e.target.value,
                    background: {
                      ...(prev.background || { type: 'image' }),
                      imageUrl: e.target.value,
                    },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono placeholder-slate-600"
              />
              {onUploadAsset && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setUploadTarget({ type: 'screenBg' });
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isUploading ? 'Uploading Image...' : 'Upload Background Image'}</span>
                </button>
              )}
            </div>
          )}

          {/* Overlay Darkening */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] text-slate-400">Darkness Overlay</label>
              <span className="text-[10px] text-amber-400 font-mono">
                {Math.round(
                  (startConfig.backgroundOverlayOpacity !== undefined
                    ? startConfig.backgroundOverlayOpacity
                    : startConfig.background?.overlayOpacity !== undefined
                    ? startConfig.background.overlayOpacity
                    : 0.3) * 100
                )}
                %
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={
                startConfig.backgroundOverlayOpacity !== undefined
                  ? startConfig.backgroundOverlayOpacity
                  : startConfig.background?.overlayOpacity !== undefined
                  ? startConfig.background.overlayOpacity
                  : 0.3
              }
              onChange={(e) =>
                onUpdateConfig((prev) => ({
                  ...prev,
                  backgroundOverlayOpacity: parseFloat(e.target.value),
                  background: {
                    ...(prev.background || { type: prev.backgroundType || 'theme' }),
                    overlayOpacity: parseFloat(e.target.value),
                  },
                }))
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="border-t border-slate-800 pt-4">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Canvas Dimensions
            </span>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between font-mono text-xs text-slate-400">
              <span>Logical Space:</span>
              <span className="text-amber-400 font-bold">{canvasWidth} × {canvasHeight} px</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
              Responsive canvas automatically scales seamlessly across all desktop, tablet, and mobile screens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If multiple elements are selected, render Multi-Selection Inspector & Alignment Panel
  if (selectedIds.length > 1) {
    const selectedElements = selectedIds
      .map((id) => {
        const findRecursive = (list: StartScreenElement[]): StartScreenElement | null => {
          for (const item of list) {
            if (item.id === id) return item;
            if (item.type === 'card' || item.type === 'group') {
              const res = findRecursive((item as any).children || []);
              if (res) return res;
            }
          }
          return null;
        };
        return findRecursive(elements);
      })
      .filter((el): el is StartScreenElement => el !== null);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of selectedElements) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }
    const boundWidth = maxX > minX ? maxX - minX : 0;
    const boundHeight = maxY > minY ? maxY - minY : 0;
    const canDistribute = selectedIds.length >= 3;

    return (
      <div className="w-80 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 select-none z-20 overflow-y-auto">
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-xs text-slate-200 uppercase tracking-wide">
              {selectedIds.length} Elements Selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onDuplicateSelected && (
              <button
                onClick={onDuplicateSelected}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                title="Duplicate All (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {onDeleteSelected && (
              <button
                onClick={onDeleteSelected}
                className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400"
                title="Delete All (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-5 text-xs text-slate-300">
          {/* Alignment Suite */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Align & Distribute
            </span>
            <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
              <button
                onClick={() => onAlignSelected && onAlignSelected('left')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Left"
              >
                <AlignLeft className="w-4 h-4" />
                <span className="text-[9px]">Left</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('center-h')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Center Horizontally"
              >
                <AlignCenterHorizontal className="w-4 h-4" />
                <span className="text-[9px]">Center H</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('right')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Right"
              >
                <AlignRight className="w-4 h-4" />
                <span className="text-[9px]">Right</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('distribute-h')}
                disabled={!canDistribute}
                className={`p-2 rounded flex flex-col items-center gap-1 transition-colors ${
                  canDistribute
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-amber-400'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
                title="Distribute Horizontally (requires 3+ elements)"
              >
                <AlignHorizontalDistributeCenter className="w-4 h-4" />
                <span className="text-[9px]">Dist H</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('top')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Top"
              >
                <AlignStartVertical className="w-4 h-4" />
                <span className="text-[9px]">Top</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('center-v')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Center Vertically"
              >
                <AlignCenterVertical className="w-4 h-4" />
                <span className="text-[9px]">Center V</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('bottom')}
                className="p-2 rounded hover:bg-slate-800 text-slate-300 hover:text-amber-400 flex flex-col items-center gap-1 transition-colors"
                title="Align Bottom"
              >
                <AlignEndVertical className="w-4 h-4" />
                <span className="text-[9px]">Bottom</span>
              </button>
              <button
                onClick={() => onAlignSelected && onAlignSelected('distribute-v')}
                disabled={!canDistribute}
                className={`p-2 rounded flex flex-col items-center gap-1 transition-colors ${
                  canDistribute
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-amber-400'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
                title="Distribute Vertically (requires 3+ elements)"
              >
                <AlignVerticalDistributeCenter className="w-4 h-4" />
                <span className="text-[9px]">Dist V</span>
              </button>
            </div>
          </div>

          {/* Combined Selection Bounding Box */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Combined Bounds
            </span>
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Min X:</span>
                <span className="text-amber-400">{Math.round(minX)}px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Min Y:</span>
                <span className="text-amber-400">{Math.round(minY)}px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Width:</span>
                <span className="text-amber-400">{Math.round(boundWidth)}px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Height:</span>
                <span className="text-amber-400">{Math.round(boundHeight)}px</span>
              </div>
            </div>
          </div>

          {/* Multi-selection Grouping & Actions */}
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Group & Actions
            </span>
            {canGroup && onGroupSelected && (
              <button
                onClick={onGroupSelected}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                <FolderTree className="w-4 h-4 text-amber-400" />
                <span>Group Selected Elements (Ctrl+G)</span>
              </button>
            )}
            {onToggleLockSelected && (
              <button
                onClick={onToggleLockSelected}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                <span>Lock / Unlock Selected</span>
              </button>
            )}
          </div>

          {/* Selected Elements List */}
          <div className="border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Selected Layers ({selectedElements.length})
            </span>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {selectedElements.map((el) => {
                const ItemIcon = getStartElementIcon(el.type);
                return (
                  <div
                    key={el.id}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <ItemIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-semibold text-slate-300">{el.type}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                      ({Math.round(el.x)}, {Math.round(el.y)})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const el = selectedElement;
  const availableContainers = getAvailableContainers(el.id, elements);
  const IconC = getStartElementIcon(el.type);

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 select-none z-20 overflow-y-auto">
      {/* Header */}
      <div className="h-12 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <IconC className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-xs text-slate-200 uppercase">{el.type}</span>
          <span className="text-[10px] text-slate-500 font-mono">#{el.id.slice(0, 6)}</span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleLockSelected && (
            <button
              onClick={onToggleLockSelected}
              className={`p-1 rounded hover:bg-slate-800 ${
                el.locked ? 'text-rose-400' : 'text-slate-400'
              }`}
              title={el.locked ? 'Unlock' : 'Lock'}
            >
              {el.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}

          {onToggleVisibilitySelected && (
            <button
              onClick={onToggleVisibilitySelected}
              className={`p-1 rounded hover:bg-slate-800 ${
                el.visible === false ? 'text-slate-600' : 'text-slate-400'
              }`}
              title={el.visible === false ? 'Show' : 'Hide'}
            >
              {el.visible === false ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {onDuplicateSelected && (
            <button
              onClick={onDuplicateSelected}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5 text-xs text-slate-300">
        {/* SECTION 1: Transform & Layout */}
        <div>
          <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Position & Size
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-mono">X (px)</label>
              <input
                type="number"
                value={Math.round(el.x)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({ ...prev, x: parseInt(e.target.value) || 0 }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono">Y (px)</label>
              <input
                type="number"
                value={Math.round(el.y)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({ ...prev, y: parseInt(e.target.value) || 0 }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono">WIDTH</label>
              <input
                type="number"
                value={Math.round(el.width)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    width: Math.max(10, parseInt(e.target.value) || 10),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono">HEIGHT</label>
              <input
                type="number"
                value={Math.round(el.height)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    height: Math.max(10, parseInt(e.target.value) || 10),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-[10px] text-slate-500 font-mono">ROTATION (°)</label>
              <input
                type="number"
                value={Math.round(el.rotation || 0)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({ ...prev, rotation: parseInt(e.target.value) || 0 }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono">OPACITY (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round((el.opacity ?? 1) * 100)}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    opacity: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Target Container Parent */}
        {onMoveToContainer && availableContainers.length > 0 && (
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
              Parent Container
            </label>
            <select
              onChange={(e) => {
                const target = e.target.value === 'root' ? null : e.target.value;
                onMoveToContainer(el.id, target);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="root">Root Canvas ({canvasWidth}×{canvasHeight})</option>
              {availableContainers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SECTION 2: Element-Specific Properties */}

        {/* CARD CONTAINER */}
        {el.type === 'card' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Card Style
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Background Color</label>
              <input
                type="text"
                value={(el as StartScreenCardElement).style?.backgroundColor || 'rgba(15, 23, 42, 0.95)'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    style: {
                      ...(prev as StartScreenCardElement).style,
                      backgroundColor: e.target.value,
                    },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Border Radius</label>
                <input
                  type="number"
                  value={(el as StartScreenCardElement).style?.borderRadius ?? 24}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenCardElement).style,
                        borderRadius: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Border Width</label>
                <input
                  type="number"
                  value={(el as StartScreenCardElement).style?.borderWidth ?? 1}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenCardElement).style,
                        borderWidth: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Border Color</label>
              <input
                type="text"
                value={(el as StartScreenCardElement).style?.borderColor || '#334155'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    style: {
                      ...(prev as StartScreenCardElement).style,
                      borderColor: e.target.value,
                    },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Card Background Image (Optional)</label>
              <input
                type="text"
                placeholder="https://... or preset"
                value={(el as StartScreenCardElement).style?.backgroundImageUrl || ''}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    style: {
                      ...(prev as StartScreenCardElement).style,
                      backgroundImageUrl: e.target.value || undefined,
                    },
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono placeholder-slate-600 mb-1.5"
              />
              {onUploadAsset && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setUploadTarget({ type: 'cardBg', elementId: el.id });
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isUploading ? 'Uploading...' : 'Upload Card Background'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* TITLE ELEMENT */}
        {el.type === 'title' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Title Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Title Text</label>
              <input
                type="text"
                value={(el as StartScreenTitleElement).text || ''}
                placeholder={theme.name || 'Game Title'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  value={(el as StartScreenTitleElement).style?.fontSize ?? 38}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenTitleElement).style,
                        fontSize: parseInt(e.target.value) || 38,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Color</label>
                <input
                  type="text"
                  value={(el as StartScreenTitleElement).style?.color || '#ffffff'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenTitleElement).style,
                        color: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* DESCRIPTION / SUBTITLE ELEMENT */}
        {el.type === 'description' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Subtitle Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Subtitle Text</label>
              <textarea
                rows={2}
                value={(el as StartScreenDescriptionElement).text || ''}
                placeholder={theme.description || 'Instructions or tagline'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size (px)</label>
                <input
                  type="number"
                  value={(el as StartScreenDescriptionElement).style?.fontSize ?? 16}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenDescriptionElement).style,
                        fontSize: parseInt(e.target.value) || 16,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Color</label>
                <input
                  type="text"
                  value={(el as StartScreenDescriptionElement).style?.color || '#cbd5e1'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenDescriptionElement).style,
                        color: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM TEXT ELEMENT */}
        {el.type === 'text' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Text Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Content</label>
              <input
                type="text"
                value={(el as StartScreenTextElement).text || ''}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Font Size</label>
                <input
                  type="number"
                  value={(el as StartScreenTextElement).style?.fontSize ?? 14}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenTextElement).style,
                        fontSize: parseInt(e.target.value) || 14,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Color</label>
                <input
                  type="text"
                  value={(el as StartScreenTextElement).style?.color || '#94a3b8'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenTextElement).style,
                        color: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* IMAGE ELEMENT */}
        {el.type === 'image' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Image Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Image URL</label>
              <input
                type="text"
                placeholder="https://... or preset"
                value={(el as StartScreenImageElement).imageUrl || ''}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    imageUrl: e.target.value || null,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 font-mono mb-1.5"
              />
              <div className="flex flex-wrap gap-1.5">
                {onUploadAsset && (
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => {
                      setUploadTarget({ type: 'imageEl', elementId: el.id });
                      fileInputRef.current?.click();
                    }}
                    className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded text-[11px] font-semibold flex items-center justify-center gap-1 border border-slate-700 transition-colors"
                  >
                    <ImageIcon className="w-3 h-3 text-amber-400" />
                    <span>{isUploading ? 'Uploading...' : 'Upload Image'}</span>
                  </button>
                )}
                {theme?.clientLogo && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateElement((prev) => ({
                        ...prev,
                        imageUrl: theme.clientLogo,
                      }))
                    }
                    className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] border border-slate-700"
                  >
                    Use Client Logo
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Object Fit</label>
              <select
                value={(el as StartScreenImageElement).objectFit || 'contain'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    objectFit: e.target.value as any,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </div>
          </div>
        )}

        {/* BADGE ELEMENT */}
        {el.type === 'badge' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Badge Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Metric Type</label>
              <select
                value={(el as StartScreenBadgeElement).metric}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    metric: e.target.value as StartBadgeMetric,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="grid">Grid Dimensions (e.g. 4×4 Cards)</option>
                <option value="pairs">Pairs Count (e.g. 8 Pairs)</option>
                <option value="timer">Time Limit (e.g. 45s)</option>
                <option value="rounds">Rounds Count</option>
                <option value="lights">Lights Count</option>
                <option value="target-item">Target Item</option>
                <option value="hazard-item">Hazard Item</option>
                <option value="custom">Custom Text</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Label</label>
              <input
                type="text"
                value={(el as StartScreenBadgeElement).label || ''}
                placeholder="AUTO (e.g. GRID)"
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    label: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Override Value</label>
              <input
                type="text"
                value={(el as StartScreenBadgeElement).value || ''}
                placeholder="AUTO"
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Value Color</label>
                <input
                  type="text"
                  value={(el as StartScreenBadgeElement).style?.valueColor || '#fbbf24'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenBadgeElement).style,
                        valueColor: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Label Color</label>
                <input
                  type="text"
                  value={(el as StartScreenBadgeElement).style?.labelColor || '#94a3b8'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenBadgeElement).style,
                        labelColor: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* ACTION BUTTON ELEMENT */}
        {el.type === 'button' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Button Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Button Label</label>
              <input
                type="text"
                value={(el as StartScreenButtonElement).text}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    text: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Action Trigger</label>
              <select
                value={
                  (el as StartScreenButtonElement).action === 'start'
                    ? 'startGame'
                    : (el as StartScreenButtonElement).action === 'leaderboard'
                    ? 'viewLeaderboard'
                    : (el as StartScreenButtonElement).action === 'guide'
                    ? 'howToPlay'
                    : (el as StartScreenButtonElement).action || 'startGame'
                }
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    action: e.target.value as StartButtonAction,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="startGame">Start Game / Play</option>
                <option value="viewLeaderboard">Open Leaderboard</option>
                <option value="howToPlay">Open Rules / How to Play</option>
                <option value="settings">Open Settings</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Background</label>
                <input
                  type="text"
                  value={(el as StartScreenButtonElement).style?.backgroundColor || '#f59e0b'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenButtonElement).style,
                        backgroundColor: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Text Color</label>
                <input
                  type="text"
                  value={(el as StartScreenButtonElement).style?.textColor || '#020617'}
                  onChange={(e) =>
                    onUpdateElement((prev) => ({
                      ...prev,
                      style: {
                        ...(prev as StartScreenButtonElement).style,
                        textColor: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="btn-pulse"
                checked={(el as StartScreenButtonElement).style?.pulse !== false}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    style: {
                      ...(prev as StartScreenButtonElement).style,
                      pulse: e.target.checked,
                    },
                  }))
                }
                className="accent-amber-500 rounded"
              />
              <label htmlFor="btn-pulse" className="text-xs text-slate-300 cursor-pointer">
                Pulsing glow animation
              </label>
            </div>
          </div>
        )}

        {/* RULES ELEMENT */}
        {el.type === 'rules' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Rules Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Header Title</label>
              <input
                type="text"
                value={(el as StartScreenRulesElement).title || 'HOW TO PLAY'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Description</label>
              <textarea
                rows={3}
                value={(el as StartScreenRulesElement).description || ''}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
          </div>
        )}

        {/* LEADERBOARD PREVIEW ELEMENT */}
        {el.type === 'leaderboard' && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Leaderboard Settings
            </span>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Header Title</label>
              <input
                type="text"
                value={(el as StartScreenLeaderboardElement).headerText || 'TOP PLAYERS'}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    headerText: e.target.value,
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Max Rows</label>
              <input
                type="number"
                min="1"
                max="5"
                value={(el as StartScreenLeaderboardElement).maxRows ?? 3}
                onChange={(e) =>
                  onUpdateElement((prev) => ({
                    ...prev,
                    maxRows: Math.max(1, Math.min(5, parseInt(e.target.value) || 3)),
                  }))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
