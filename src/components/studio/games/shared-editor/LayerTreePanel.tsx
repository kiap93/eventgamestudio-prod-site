/**
 * Shared Visual Editor Engine - Layer Tree & Outliner Panel
 * Displays tree hierarchy of canvas elements (containers, groups, components),
 * search filtering, z-order reordering, visibility/lock toggling, and layer deletion.
 */
import React, { useState, useMemo } from 'react';
import { BaseVisualElement } from './types';
import {
  Layers,
  Square,
  Image as ImageIcon,
  Type,
  Award,
  Zap,
  Clock,
  Sparkles,
  MousePointerClick,
  Trophy,
  FolderTree,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Search,
  PanelLeftClose,
  PanelLeft,
  Box,
  Heading,
  AlignLeft,
  Grid3X3,
  HelpCircle,
  Play,
  LayoutTemplate,
} from 'lucide-react';

export interface ElementCategoryGroup {
  category: string;
  items: Array<{
    type: string;
    label: string;
    description?: string;
    icon?: React.ElementType;
  }>;
}

export interface LayerTreePanelProps<T extends BaseVisualElement = BaseVisualElement> {
  elements: T[];
  selectedIds: string[];
  gameType?: string;
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onToggleVisibility: (id: string, e?: React.MouseEvent) => void;
  onToggleLock: (id: string, e?: React.MouseEvent) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onMoveLayer: (idOrIds: string | string[], direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onAddChildElement?: (parentId: string, type: any) => void;
  onAddNewRootElement?: (type: any) => void;
  getElementIcon?: (type: string) => React.ReactNode;
  getElementLabel?: (el: T) => string;
  availableElementCategories?: ElementCategoryGroup[];
  onGroup?: () => void;
  onUngroup?: (ids?: string[]) => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenPresets?: () => void;
}

export const defaultElementIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'card':
      return <Square className="w-3.5 h-3.5 text-blue-400" />;
    case 'image':
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
    case 'title':
      return <Heading className="w-3.5 h-3.5 text-amber-400" />;
    case 'description':
      return <AlignLeft className="w-3.5 h-3.5 text-slate-300" />;
    case 'text':
      return <Type className="w-3.5 h-3.5 text-amber-400" />;
    case 'score':
      return <Award className="w-3.5 h-3.5 text-yellow-400" />;
    case 'time':
      return <Clock className="w-3.5 h-3.5 text-sky-400" />;
    case 'accuracy':
    case 'average-reaction':
      return <Zap className="w-3.5 h-3.5 text-purple-400" />;
    case 'button':
      return <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />;
    case 'leaderboard':
      return <Trophy className="w-3.5 h-3.5 text-amber-400" />;
    case 'badge':
      return <Grid3X3 className="w-3.5 h-3.5 text-indigo-400" />;
    case 'rules':
      return <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />;
    case 'group':
      return <FolderTree className="w-3.5 h-3.5 text-slate-400" />;
    default:
      return <Box className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const LayerTreePanel = <T extends BaseVisualElement = BaseVisualElement>({
  elements,
  selectedIds,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onDeleteElement,
  onDuplicateElement,
  onMoveLayer,
  onAddChildElement,
  onAddNewRootElement,
  getElementIcon = defaultElementIcon,
  getElementLabel,
  availableElementCategories = [],
  onGroup,
  onUngroup,
  canGroup = false,
  canUngroup = false,
  isCollapsed = false,
  onToggleCollapse,
  onOpenPresets,
}: LayerTreePanelProps<T>) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedContainers, setCollapsedContainers] = useState<Record<string, boolean>>({});
  const [addingChildToParentId, setAddingChildToParentId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const toggleContainerCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedContainers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const hasSelection = selectedIds.length > 0;
  const primarySelectedId = selectedIds[0];

  const renderLayerItem = (el: T, depth: number = 0): React.ReactNode => {
    const isSelected = selectedIds.includes(el.id);
    const isPrimarySelected = primarySelectedId === el.id;
    const isContainer = el.type === 'card' || el.type === 'group';
    const children = (el.children as T[]) || [];
    const isCollapsedState = collapsedContainers[el.id];

    // Filter by query if searching
    const label = getElementLabel ? getElementLabel(el) : (el as any).label || (el as any).text || el.id;
    const matchesSearch = !searchQuery.trim() || label.toLowerCase().includes(searchQuery.toLowerCase()) || el.type.toLowerCase().includes(searchQuery.toLowerCase());

    return (
      <div key={el.id} className="flex flex-col">
        {matchesSearch && (
          <div
            onClick={(e) => onSelectElement(el.id, e)}
            className={`group relative flex items-center h-8 px-2 rounded-lg cursor-pointer text-xs font-medium transition-colors select-none ${
              isSelected
                ? isPrimarySelected
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-amber-500/10 text-amber-200/90 border border-amber-500/20'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {/* Collapse toggle arrow for containers */}
            {isContainer && children.length > 0 ? (
              <button
                onClick={(e) => toggleContainerCollapse(el.id, e)}
                className="w-4 h-4 flex items-center justify-center -ml-1 mr-1 text-slate-400 hover:text-white rounded"
              >
                {isCollapsedState ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-3 mr-1" />
            )}

            {/* Element Type Icon */}
            <div className="mr-2 shrink-0">{getElementIcon(el.type)}</div>

            {/* Element Name */}
            <span className="truncate flex-1 font-mono text-[11px]">{label}</span>

            {/* Action Buttons (Lock, Eye, Delete) */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              {/* Add child button for containers */}
              {isContainer && onAddChildElement && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingChildToParentId(addingChildToParentId === el.id ? null : el.id);
                  }}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                  title="Add child inside container"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}

              {/* Lock Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(el.id, e);
                }}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                  el.locked ? 'opacity-100 text-rose-400' : 'text-slate-400 hover:text-white'
                }`}
                title={el.locked ? 'Unlock layer' : 'Lock layer'}
              >
                {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>

              {/* Visibility Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(el.id, e);
                }}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                  el.visible === false ? 'opacity-100 text-slate-500' : 'text-slate-400 hover:text-white'
                }`}
                title={el.visible === false ? 'Show layer' : 'Hide layer'}
              >
                {el.visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}

        {/* Nested Add Child Dropdown */}
        {addingChildToParentId === el.id && onAddChildElement && (
          <div className="ml-6 my-1 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Add into {el.type}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {availableElementCategories.flatMap((cat) => cat.items).map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    onAddChildElement(el.id, item.type);
                    setAddingChildToParentId(null);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 cursor-pointer"
                >
                  {getElementIcon(item.type)}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recursive Children Rendering */}
        {isContainer && !isCollapsedState && children.length > 0 && (
          <div className="flex flex-col">
            {children.map((child) => renderLayerItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-3 gap-4 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Expand Layer Tree"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-slate-800" />
        <Layers className="w-4 h-4 text-amber-400" />
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Header */}
      <div className="h-12 border-b border-slate-800 px-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Layers
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {elements.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onOpenPresets && (
            <button
              onClick={onOpenPresets}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-400"
              title="Browse Preset Layouts"
            >
              <LayoutTemplate className="w-4 h-4" />
            </button>
          )}

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              title="Collapse Panel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Layer Operations Toolbar */}
      <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        {/* Layer reordering */}
        <div className="flex items-center gap-0.5">
          <button
            disabled={!hasSelection}
            onClick={() => onMoveLayer(selectedIds, 'front')}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            title="Bring to Front (Cmd Shift ])"
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasSelection}
            onClick={() => onMoveLayer(selectedIds, 'forward')}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            title="Bring Forward (Cmd ])"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasSelection}
            onClick={() => onMoveLayer(selectedIds, 'backward')}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            title="Send Backward (Cmd [)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={!hasSelection}
            onClick={() => onMoveLayer(selectedIds, 'back')}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            title="Send to Back (Cmd Shift [)"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Group / Ungroup / Duplicate / Delete */}
        <div className="flex items-center gap-0.5">
          {onGroup && (
            <button
              disabled={!canGroup}
              onClick={onGroup}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 disabled:opacity-30 disabled:pointer-events-none"
              title="Group Selection (Cmd G)"
            >
              <FolderTree className="w-3.5 h-3.5" />
            </button>
          )}

          {onUngroup && (
            <button
              disabled={!canUngroup}
              onClick={() => onUngroup()}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 disabled:opacity-30 disabled:pointer-events-none"
              title="Ungroup (Cmd Shift G)"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            disabled={!hasSelection}
            onClick={() => primarySelectedId && onDuplicateElement(primarySelectedId)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            title="Duplicate (Cmd D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            disabled={!hasSelection}
            onClick={() => primarySelectedId && onDeleteElement(primarySelectedId)}
            className="p-1 rounded hover:bg-slate-800 text-rose-400 hover:text-rose-300 disabled:opacity-30 disabled:pointer-events-none"
            title="Delete Layer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-slate-500" />
          <input
            type="text"
            placeholder="Search layers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Add New Root Element Button */}
      {onAddNewRootElement && availableElementCategories.length > 0 && (
        <div className="p-2 border-b border-slate-800 relative">
          <button
            onClick={() => setIsAddMenuOpen((o) => !o)}
            className="w-full py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Element</span>
          </button>

          {isAddMenuOpen && (
            <div className="absolute left-2 right-2 top-12 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl p-2 z-30 max-h-64 overflow-y-auto">
              {availableElementCategories.map((group) => (
                <div key={group.category} className="mb-2 last:mb-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
                    {group.category}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setIsAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-amber-300 flex items-center gap-2 cursor-pointer"
                      >
                        {getElementIcon(item.type)}
                        <span className="font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Element Layer List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {elements.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No layers on canvas.
          </div>
        ) : (
          elements.map((el) => renderLayerItem(el))
        )}
      </div>
    </div>
  );
};
