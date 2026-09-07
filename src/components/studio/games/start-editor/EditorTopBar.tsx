import React, { useState, useMemo } from 'react';
import {
  StartScreenElementType,
  StartScreenElement,
} from '../../../../games/shared/startScreenTypes';
import { getStartElementsGroupedByCategory } from './startElementRegistry';
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
  onAddNewRootElement: (type: StartScreenElementType) => void;
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
  isAllSelectedLocked?: boolean;
  isModal?: boolean;
  onToggleFullscreen?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  selectedIds,
  totalElementsCount,
  gameType = 'memory-match',
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
  isAllSelectedLocked = false,
  isModal = false,
  onToggleFullscreen,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const groupedElements = useMemo(
    () => getStartElementsGroupedByCategory(gameType),
    [gameType]
  );

  return (
    <div className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* LEFT SECTION: Add Element & Undo/Redo */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Element</span>
          </button>

          {showAddMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowAddMenu(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-2 text-slate-200 text-xs flex flex-col gap-2 max-h-96 overflow-y-auto">
                {/* Containers */}
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                    Containers
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {groupedElements.containers.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setShowAddMenu(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                        >
                          <IconComponent className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{item.label}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">
                              {item.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Visuals */}
                <div className="border-t border-slate-800 pt-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                    Visuals
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {groupedElements.visuals.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setShowAddMenu(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                        >
                          <IconComponent className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{item.label}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">
                              {item.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Info & Typography */}
                <div className="border-t border-slate-800 pt-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                    Info & Text
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {groupedElements.info.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setShowAddMenu(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                        >
                          <IconComponent className="w-4 h-4 text-sky-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{item.label}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">
                              {item.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Controls */}
                <div className="border-t border-slate-800 pt-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                    Controls
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {groupedElements.controls.map((item) => {
                      const IconComponent = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setShowAddMenu(false);
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                        >
                          <IconComponent className="w-4 h-4 text-purple-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{item.label}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">
                              {item.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition-colors ${
              canUndo
                ? 'text-slate-200 hover:bg-slate-800 active:scale-95'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition-colors ${
              canRedo
                ? 'text-slate-200 hover:bg-slate-800 active:scale-95'
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CENTER SECTION: Quick Actions on Selection */}
      <div className="flex items-center gap-1.5">
        {selectedIds.length > 0 ? (
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
            {/* Alignment Tools */}
            <button
              onClick={onCenterSelectedHorizontal}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Center Horizontally"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCenterSelectedVertical}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Center Vertically"
            >
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

            {/* Layer Ordering */}
            <button
              onClick={() => onMoveSelectedLayer('front')}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Bring to Front"
            >
              <ChevronsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveSelectedLayer('forward')}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Bring Forward"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveSelectedLayer('backward')}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Send Backward"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveSelectedLayer('back')}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Send to Back"
            >
              <ChevronsDown className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

            {/* Grouping */}
            {canGroup && onGroupSelected && (
              <button
                onClick={onGroupSelected}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                title="Group Selected (Ctrl+G)"
              >
                <FolderTree className="w-3.5 h-3.5 text-amber-400" />
              </button>
            )}
            {canUngroup && onUngroupSelected && (
              <button
                onClick={onUngroupSelected}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                title="Ungroup (Ctrl+Shift+G)"
              >
                <FolderMinus className="w-3.5 h-3.5 text-amber-400" />
              </button>
            )}

            {/* Lock / Unlock */}
            {onToggleLockSelected && (
              <button
                onClick={onToggleLockSelected}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                title={isAllSelectedLocked ? 'Unlock Selected' : 'Lock Selected'}
              >
                {isAllSelectedLocked ? (
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* Duplicate */}
            <button
              onClick={onDuplicateSelected}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              title="Duplicate (Ctrl+D)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            {/* Delete */}
            <button
              onClick={onDeleteSelected}
              className="p-1.5 rounded hover:bg-rose-950/60 text-slate-300 hover:text-rose-400"
              title="Delete (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500 font-medium">
            {totalElementsCount} elements on canvas • Click element to edit
          </span>
        )}
      </div>

      {/* RIGHT SECTION: Presets, Save Template, Fullscreen & Done */}
      <div className="flex items-center gap-2">
        {onOpenPresets && (
          <button
            onClick={onOpenPresets}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
            title="Load Pre-designed Layout Presets"
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-amber-400" />
            <span>Presets</span>
          </button>
        )}

        {onSaveAsTemplate && (
          <button
            onClick={onSaveAsTemplate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
            title="Save Layout as Custom Template"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-sky-400" />
            <span>Save Template</span>
          </button>
        )}

        <button
          onClick={onResetLayout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold border border-slate-700/60 transition-colors"
          title="Reset to Default Layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title={isModal ? 'Exit Fullscreen' : 'Open Studio Fullscreen'}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}

        {isModal && (
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 ml-1"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Done</span>
          </button>
        )}
      </div>
    </div>
  );
};
