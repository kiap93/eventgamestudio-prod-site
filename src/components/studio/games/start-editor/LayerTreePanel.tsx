import React, { useState, useMemo } from 'react';
import { useLocalization } from '../../../../context/LocalizationContext';
import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenElementType,
} from '../../../../games/shared/startScreenTypes';
import {
  getStartElementsGroupedByCategory,
  getDefaultStartElementLabel,
} from './startElementRegistry';
import {
  Layers,
  Square,
  Image as ImageIcon,
  Type,
  Award,
  Zap,
  Clock,
  Sparkles,
  Heading,
  AlignLeft,
  Grid3X3,
  Play,
  HelpCircle,
  Trophy,
  FolderTree,
  FolderMinus,
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
  ShieldAlert,
} from 'lucide-react';

interface LayerTreePanelProps {
  elements: StartScreenElement[];
  selectedIds: string[];
  gameType?: string;
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onMoveLayer: (id: string, direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onMoveToContainer?: (elementId: string, targetContainerId: string | null) => void;
  onAddChildElement: (parentId: string, type: StartScreenElementType) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function getStartElementIcon(type: StartScreenElementType): React.ElementType {
  switch (type) {
    case 'card':
      return Square;
    case 'group':
      return Layers;
    case 'image':
      return ImageIcon;
    case 'title':
      return Heading;
    case 'description':
      return AlignLeft;
    case 'text':
      return Type;
    case 'badge':
      return Grid3X3;
    case 'button':
      return Play;
    case 'rules':
      return HelpCircle;
    case 'icon':
      return Sparkles;
    case 'leaderboard':
      return Trophy;
    default:
      return Type;
  }
}

export function renderStartElementIcon(
  type: StartScreenElementType,
  className: string = 'w-3.5 h-3.5'
): React.ReactElement {
  const IconC = getStartElementIcon(type);
  return React.createElement(IconC, { className });
}

export const LayerTreePanel: React.FC<LayerTreePanelProps> = ({
  elements,
  selectedIds,
  gameType = 'memory-match',
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onDeleteElement,
  onDuplicateElement,
  onMoveLayer,
  onAddChildElement,
  isCollapsed = false,
  onToggleCollapse,
  canvasWidth = 1024,
  canvasHeight = 576,
}) => {
  const { t } = useLocalization();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedContainers, setCollapsedContainers] = useState<Record<string, boolean>>({});
  const [addingChildToParentId, setAddingChildToParentId] = useState<string | null>(null);

  const toggleContainerCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedContainers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const groupedElements = useMemo(
    () => getStartElementsGroupedByCategory(gameType),
    [gameType]
  );

  const renderLayerItem = (
    el: StartScreenElement,
    depth: number = 0,
    parent: StartScreenCardElement | StartScreenGroupElement | null = null
  ) => {
    const isSelected = selectedIds.includes(el.id);
    const isContainer = el.type === 'card' || el.type === 'group';
    const isExpanded = !collapsedContainers[el.id];
    const IconC = getStartElementIcon(el.type);

    const children = isContainer
      ? (el as StartScreenCardElement | StartScreenGroupElement).children || []
      : [];

    const label = getDefaultStartElementLabel(el.type, gameType);

    // Search filter
    if (
      searchQuery &&
      !label.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !el.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      children.length === 0
    ) {
      return null;
    }

    return (
      <div key={el.id} className="flex flex-col">
        <div
          onClick={(e) => onSelectElement(el.id, e)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
            isSelected
              ? 'bg-amber-500/20 text-amber-300 font-bold'
              : 'hover:bg-slate-800/80 text-slate-300'
          }`}
        >
          {/* Left: Expand arrow, Icon, Label */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isContainer ? (
              <button
                onClick={(e) => toggleContainerCollapse(el.id, e)}
                className="p-0.5 rounded hover:bg-slate-700 text-slate-400"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4.5" />
            )}

            <IconC
              className={`w-3.5 h-3.5 shrink-0 ${
                isSelected ? 'text-amber-400' : 'text-slate-400'
              }`}
            />

            <span className="truncate flex-1">
              {label}
              <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                #{el.id.slice(0, 6)}
              </span>
            </span>
          </div>

          {/* Right Action Icons: Lock, Visibility, Duplicate, Delete, Add Child */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isContainer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingChildToParentId(addingChildToParentId === el.id ? null : el.id);
                }}
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400"
                title={t('editor.addChildInsideContainer', undefined, 'Add Child Element inside Container')}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(el.id);
              }}
              className={`p-1 rounded hover:bg-slate-700 ${
                el.locked ? 'text-rose-400 opacity-100' : 'text-slate-400'
              }`}
              title={el.locked ? t('editor.unlockLayer', undefined, 'Unlock Layer') : t('editor.lockLayer', undefined, 'Lock Layer')}
            >
              {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(el.id);
              }}
              className={`p-1 rounded hover:bg-slate-700 ${
                el.visible === false ? 'text-slate-600 opacity-100' : 'text-slate-400'
              }`}
              title={el.visible === false ? t('editor.showLayer', undefined, 'Show Layer') : t('editor.hideLayer', undefined, 'Hide Layer')}
            >
              {el.visible === false ? (
                <EyeOff className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateElement(el.id);
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
              title={t('common.duplicate', undefined, 'Duplicate')}
            >
              <Copy className="w-3 h-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteElement(el.id);
              }}
              className="p-1 rounded hover:bg-rose-950 text-slate-400 hover:text-rose-400"
              title={t('common.delete', undefined, 'Delete')}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Add Child Dropdown for Container */}
        {addingChildToParentId === el.id && (
          <div className="ml-6 my-1 p-2 bg-slate-950 border border-slate-700 rounded-lg shadow-xl text-xs flex flex-col gap-1 z-20">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
              Insert into {label}
            </span>
            <div className="grid grid-cols-2 gap-1">
              {[
                { type: 'title', label: 'Title' },
                { type: 'description', label: 'Subtitle' },
                { type: 'badge', label: 'Info Badge' },
                { type: 'button', label: 'Button' },
                { type: 'image', label: 'Image' },
                { type: 'icon', label: 'Emblem' },
                { type: 'rules', label: 'Rules' },
                { type: 'text', label: 'Text' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChildElement(el.id, item.type as StartScreenElementType);
                    setAddingChildToParentId(null);
                  }}
                  className="px-2 py-1 bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 rounded text-left truncate"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recursive Children */}
        {isContainer && isExpanded && (
          <div className="flex flex-col">
            {children.map((child) =>
              renderLayerItem(child, depth + 1, el as StartScreenCardElement | StartScreenGroupElement)
            )}
          </div>
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-10 border-r border-slate-800 bg-slate-900/90 flex flex-col items-center py-3 select-none h-full shrink-0 z-20">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          title={t('editor.layersAndElements', undefined, 'Expand Layer Tree')}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-slate-800 bg-slate-900/95 flex flex-col shrink-0 select-none z-20 overflow-hidden h-full">
      {/* Header */}
      <div className="h-12 px-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-xs text-slate-200">{t('editor.layers', undefined, 'Layers')}</span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full font-mono">
            {elements.length}
          </span>
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title={t('common.close', undefined, 'Collapse Panel')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-slate-800/80">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder={t('editor.filterLayers', undefined, 'Search layers...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Layers Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {elements.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            {t('editor.emptyCanvas', undefined, 'No elements on canvas. Click "Add Element" above to create one.')}
          </div>
        ) : (
          elements.map((el) => renderLayerItem(el, 0, null))
        )}
      </div>

      {/* Footer info */}
      <div className="p-2 border-t border-slate-800 bg-slate-950/40 text-[10px] text-slate-500 flex items-center justify-between">
        <span>{t('editor.dragAndDrop', undefined, 'Click to select • Drag on canvas')}</span>
        <span className="font-mono">{canvasWidth}×{canvasHeight}</span>
      </div>
    </div>
  );
};
