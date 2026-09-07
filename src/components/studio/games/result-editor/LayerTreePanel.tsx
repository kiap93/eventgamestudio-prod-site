import React, { useState, useMemo } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultButtonElement,
  ResultLeaderboardElement,
  ResultScreenElementType,
} from '../../../../games/memory-match/types';
import {
  getResultElementsGroupedByCategory,
  getDefaultElementLabel,
} from './resultElementRegistry';
import {
  Layers,
  Square,
  Image as ImageIcon,
  Type,
  Award,
  Zap,
  Clock,
  Sparkles,
  RotateCcw,
  MousePointerClick,
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
  Box,
  LayoutTemplate,
} from 'lucide-react';

interface LayerTreePanelProps {
  elements: ResultScreenElement[];
  selectedIds: string[];
  gameType?: string;
  onSelectElement: (id: string, e?: React.MouseEvent) => void;
  onToggleVisibility: (id: string, e: React.MouseEvent) => void;
  onToggleLock: (id: string, e: React.MouseEvent) => void;
  onMoveLayer: (idOrIds: string | string[], direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onDuplicateElement: (id: string) => void;
  onDeleteElement: (id: string) => void;
  onAddChildElement: (parentId: string, type: ResultScreenElementType) => void;
  onAddNewRootElement: (type: ResultScreenElementType) => void;
  onGroup?: () => void;
  onUngroup?: (ids?: string[]) => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  onToggleLockSelected?: () => void;
  isSelectionLocked?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenPresets?: () => void;
}

export const getElementIcon = (type: ResultScreenElementType) => {
  switch (type) {
    case 'card':
      return <Square className="w-3.5 h-3.5 text-blue-400" />;
    case 'image':
      return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
    case 'text':
      return <Type className="w-3.5 h-3.5 text-amber-400" />;
    case 'score':
      return <Award className="w-3.5 h-3.5 text-yellow-400" />;
    case 'moves':
      return <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />;
    case 'pairs':
      return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
    case 'time':
      return <Clock className="w-3.5 h-3.5 text-sky-400" />;
    case 'accuracy':
      return <Zap className="w-3.5 h-3.5 text-purple-400" />;
    case 'average-reaction':
      return <Zap className="w-3.5 h-3.5 text-sky-400" />;
    case 'best-reaction':
      return <Award className="w-3.5 h-3.5 text-emerald-400" />;
    case 'worst-reaction':
      return <Clock className="w-3.5 h-3.5 text-rose-400" />;
    case 'round-results':
      return <Sparkles className="w-3.5 h-3.5 text-indigo-400" />;
    case 'rating':
      return <Award className="w-3.5 h-3.5 text-amber-400" />;
    case 'button':
      return <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />;
    case 'leaderboard':
      return <Trophy className="w-3.5 h-3.5 text-amber-400" />;
    case 'group':
      return <FolderTree className="w-3.5 h-3.5 text-slate-400" />;
    default:
      return <Box className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const LayerTreePanel: React.FC<LayerTreePanelProps> = ({
  elements,
  selectedIds,
  gameType,
  onSelectElement,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onDuplicateElement,
  onDeleteElement,
  onAddChildElement,
  onAddNewRootElement,
  onGroup,
  onUngroup,
  canGroup = false,
  canUngroup = false,
  onToggleLockSelected,
  isSelectionLocked = false,
  isCollapsed = false,
  onToggleCollapse,
  onOpenPresets,
}) => {
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChildMenuId, setActiveChildMenuId] = useState<string | null>(null);
  const [rootAddMenuOpen, setRootAddMenuOpen] = useState(false);

  const groupedElements = useMemo(() => getResultElementsGroupedByCategory(gameType), [gameType]);

  // Count all elements in tree
  const countElements = (items: ResultScreenElement[]): number => {
    let count = 0;
    for (const item of items) {
      count += 1;
      if (item.type === 'card' && (item as ResultCardElement).children) {
        count += countElements((item as ResultCardElement).children || []);
      } else if (item.type === 'group' && (item as ResultGroupElement).children) {
        count += countElements((item as ResultGroupElement).children || []);
      }
    }
    return count;
  };

  const totalCount = countElements(elements);

  // Filter elements recursively
  const matchesSearch = (el: ResultScreenElement): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (el.type.toLowerCase().includes(q)) return true;
    if (el.type === 'text' && (el as ResultTextElement).text?.toLowerCase().includes(q)) return true;
    if (el.type === 'button' && (el as ResultButtonElement).text?.toLowerCase().includes(q)) return true;
    if (el.type === 'leaderboard' && (el as ResultLeaderboardElement).headerText?.toLowerCase().includes(q)) return true;
    return false;
  };

  const renderLayerItem = (
    el: ResultScreenElement,
    depth = 0,
    parentEl: ResultCardElement | ResultGroupElement | null = null
  ): React.ReactNode => {
    const isSelected = selectedIds.includes(el.id);
    const isVisible = el.visible !== false;
    const isLocked = el.locked === true;
    const isCardOrGroup = el.type === 'card' || el.type === 'group';
    const isGroup = el.type === 'group';
    const isExpanded = expandedCardIds[el.id] !== false; // expanded by default
    const children =
      el.type === 'card'
        ? (el as ResultCardElement).children
        : el.type === 'group'
        ? (el as ResultGroupElement).children
        : undefined;

    const isChildAddOpen = activeChildMenuId === el.id;

    if (!matchesSearch(el) && (!children || !children.some(matchesSearch))) {
      return null;
    }

    return (
      <div key={el.id} className="space-y-0.5 relative">
        <div
          onClick={(e) => onSelectElement(el.id, e)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-xl cursor-pointer transition-all text-xs font-semibold select-none group relative ${
            isSelected
              ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm'
              : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
          }`}
        >
          {/* Tree guide line for nested children */}
          {depth > 0 && (
            <div
              style={{ left: `${(depth - 1) * 14 + 14}px` }}
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-3.5 border-l border-b border-slate-700/70 rounded-bl-sm pointer-events-none"
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {/* Expand / Collapse Chevron */}
            {isCardOrGroup ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedCardIds((prev) => ({ ...prev, [el.id]: !isExpanded }));
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                title={isExpanded ? 'Collapse Container' : 'Expand Container'}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 h-3.5 flex items-center justify-center text-slate-600 text-[10px]">
                •
              </span>
            )}

            <div className="shrink-0">{getElementIcon(el.type)}</div>

            <span className="truncate max-w-[105px]">
              {el.type === 'text'
                ? `"${(el as ResultTextElement).text || 'Text'}"`
                : el.type === 'button'
                ? `Btn: ${(el as ResultButtonElement).text || 'Action'}`
                : el.type === 'leaderboard'
                ? (el as ResultLeaderboardElement).headerText || 'Leaderboard'
                : getDefaultElementLabel(el.type, gameType)}
            </span>

            {/* Container Count Badge */}
            {isCardOrGroup && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                {children?.length || 0}
              </span>
            )}

            {/* Z-Index Badge */}
            <span
              className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1 py-0.2 rounded border border-slate-700/60 shrink-0 select-none"
              title={`Layer Stacking Order: Z-${el.zIndex ?? 1}`}
            >
              z:{el.zIndex ?? 1}
            </span>
          </div>

          {/* Action buttons on hover/selection */}
          <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
            {/* Ungroup button specifically for Group element */}
            {isGroup && onUngroup && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUngroup([el.id]);
                }}
                className="p-1 rounded hover:bg-sky-950 text-slate-400 hover:text-sky-300 transition-colors"
                title="Ungroup this Group"
              >
                <FolderMinus className="w-3 h-3 text-sky-400" />
              </button>
            )}

            {/* Lock / Unlock Toggle */}
            <button
              type="button"
              onClick={(e) => onToggleLock(el.id, e)}
              className={`p-1 rounded transition-colors ${
                isLocked
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  : 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={isLocked ? 'Unlock Element (Click to unlock)' : 'Lock Element (Prevent accidental drag/resize)'}
            >
              {isLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-slate-500" />}
            </button>

            {/* Visibility Toggle */}
            <button
              type="button"
              onClick={(e) => onToggleVisibility(el.id, e)}
              className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                isVisible ? 'text-slate-400 hover:text-slate-200' : 'text-rose-400 hover:text-rose-300'
              }`}
              title={isVisible ? 'Hide from canvas' : 'Show on canvas'}
            >
              {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
            </button>

            {/* Bring To Front */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(el.id, 'front');
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-300"
              title="Bring To Front"
            >
              <ChevronsUp className="w-3 h-3" />
            </button>

            {/* Move Forward */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(el.id, 'forward');
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
              title="Bring Forward (1 step)"
            >
              <ArrowUp className="w-3 h-3" />
            </button>

            {/* Move Backward */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(el.id, 'backward');
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
              title="Send Backward (1 step)"
            >
              <ArrowDown className="w-3 h-3" />
            </button>

            {/* Send To Back */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLayer(el.id, 'back');
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-300"
              title="Send To Back"
            >
              <ChevronsDown className="w-3 h-3" />
            </button>

            {/* Add Child Menu for Card/Group */}
            {isCardOrGroup && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveChildMenuId(isChildAddOpen ? null : el.id);
                  }}
                  className={`p-1 rounded transition-colors ${
                    isChildAddOpen
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-blue-900/50 text-blue-400 hover:text-blue-200'
                  }`}
                  title="Add child into container"
                >
                  <Plus className="w-3 h-3" />
                </button>

                {isChildAddOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveChildMenuId(null);
                      }}
                    />
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-2 max-h-[70vh] overflow-y-auto"
                    >
                      <div className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                        Add to {el.type === 'card' ? 'Card' : 'Group'}
                      </div>

                      {/* Visual Elements */}
                      {groupedElements.visual.length > 0 && (
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                            Visual Elements
                          </span>
                          {groupedElements.visual.map((item) => (
                            <button
                              key={item.type}
                              type="button"
                              onClick={() => {
                                onAddChildElement(el.id, item.type);
                                setActiveChildMenuId(null);
                              }}
                              className="w-full text-left px-2 py-1 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                            >
                              {getElementIcon(item.type)}
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Live Game Stats */}
                      {groupedElements.stat.length > 0 && (
                        <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                            Live Game Stats
                          </span>
                          {groupedElements.stat.map((item) => (
                            <button
                              key={item.type}
                              type="button"
                              onClick={() => {
                                onAddChildElement(el.id, item.type);
                                setActiveChildMenuId(null);
                              }}
                              className="w-full text-left px-2 py-1 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center justify-between transition-colors"
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
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                            Interactive Controls
                          </span>
                          {groupedElements.control.map((item) => (
                            <button
                              key={item.type}
                              type="button"
                              onClick={() => {
                                onAddChildElement(el.id, item.type);
                                setActiveChildMenuId(null);
                              }}
                              className="w-full text-left px-2 py-1 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                            >
                              {getElementIcon(item.type)}
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Containers */}
                      <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                          Containers
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onAddChildElement(el.id, 'group');
                            setActiveChildMenuId(null);
                          }}
                          className="w-full text-left px-2 py-1 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                        >
                          {getElementIcon('group')}
                          <span>Group Wrapper</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Duplicate */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateElement(el.id);
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
              title="Duplicate"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteElement(el.id);
              }}
              className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Render child elements */}
        {isCardOrGroup && isExpanded && Array.isArray(children) && children.length > 0 && (
          <div className="space-y-0.5 border-l border-slate-800/80 ml-3 pl-1">
            {children.map((child) =>
              renderLayerItem(child, depth + 1, el as ResultCardElement | ResultGroupElement)
            )}
          </div>
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-slate-800 bg-slate-950 flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
          title="Expand Layers Panel"
        >
          <PanelLeft className="w-4 h-4 text-amber-400" />
        </button>
        <div className="writing-mode-vertical text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          <span>Layers ({totalCount})</span>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-72 sm:w-80 border-r border-slate-800 bg-slate-950 flex flex-col shrink-0 select-none relative z-20">
      {/* Panel Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 relative z-30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-200">Layers</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-400 font-bold border border-slate-700">
                {totalCount}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Stacking hierarchy</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Presets Button */}
          {onOpenPresets && (
            <button
              type="button"
              onClick={onOpenPresets}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 hover:text-amber-200 text-xs flex items-center gap-1 font-semibold transition-colors"
              title="Browse Result Screen Presets"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Presets</span>
            </button>
          )}

          {/* Add Root Element Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRootAddMenuOpen(!rootAddMenuOpen)}
              className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow transition-colors"
              title="Add New Root Element"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span className="text-[11px]">Add</span>
            </button>

            {rootAddMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setRootAddMenuOpen(false)}
                />
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2 space-y-2 max-h-[80vh] overflow-y-auto"
                >
                  <div className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1">
                    New Canvas Element
                  </div>

                  {/* Containers */}
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                      Containers
                    </span>
                    {groupedElements.container.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          onAddNewRootElement(item.type);
                          setRootAddMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                      >
                        {getElementIcon(item.type)}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Visual Elements */}
                  {groupedElements.visual.length > 0 && (
                    <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                        Visual Elements
                      </span>
                      {groupedElements.visual.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setRootAddMenuOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                        >
                          {getElementIcon(item.type)}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Live Game Stats */}
                  {groupedElements.stat.length > 0 && (
                    <div className="space-y-0.5 pt-1 border-t border-slate-800/80">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                        Live Game Stats
                      </span>
                      {groupedElements.stat.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setRootAddMenuOpen(false);
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
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-1.5">
                        Interactive Controls
                      </span>
                      {groupedElements.control.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            onAddNewRootElement(item.type);
                            setRootAddMenuOpen(false);
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

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Collapse Layers Panel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Layer Search Filter & Selection Quick Actions */}
      <div className="px-3 pt-2.5 pb-1 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search layers..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Multi-Selection Layer Toolbar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between p-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-[10px]">
            <span className="font-mono text-amber-400 font-bold px-1">
              {selectedIds.length} sel
            </span>

            <div className="flex items-center gap-1">
              {onGroup && (
                <button
                  type="button"
                  disabled={!canGroup}
                  onClick={onGroup}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-300 disabled:opacity-30 disabled:hover:bg-slate-800 disabled:hover:text-slate-200 transition-colors flex items-center gap-1 font-semibold"
                  title="Group selected elements (Ctrl+G)"
                >
                  <FolderTree className="w-3 h-3 text-amber-400" />
                  <span>Group</span>
                </button>
              )}

              {onUngroup && (
                <button
                  type="button"
                  disabled={!canUngroup}
                  onClick={() => onUngroup(selectedIds)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-sky-300 disabled:opacity-30 disabled:hover:bg-slate-800 disabled:hover:text-slate-200 transition-colors flex items-center gap-1 font-semibold"
                  title="Ungroup selected (Ctrl+Shift+G)"
                >
                  <FolderMinus className="w-3 h-3 text-sky-400" />
                  <span>Ungroup</span>
                </button>
              )}

              {onToggleLockSelected && (
                <button
                  type="button"
                  onClick={onToggleLockSelected}
                  className={`p-1 rounded transition-colors ${
                    isSelectionLocked
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title={isSelectionLocked ? 'Unlock Selection (Ctrl+L)' : 'Lock Selection (Ctrl+L)'}
                >
                  {isSelectionLocked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Layer List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {elements.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No elements on canvas. Click + Add above to start.
          </div>
        ) : (
          elements.map((el) => renderLayerItem(el))
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-slate-800 bg-slate-950/60 text-[10px] text-slate-500 flex items-center justify-between font-mono">
        <span>Click to select</span>
        <span>Shift+Click multi-select</span>
      </div>
    </aside>
  );
};

