import React from 'react';
import { GameTheme, getThemeGameType } from '../../themes/types';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
  getQuickPositionCoords,
  QuickPositionAnchor,
  getLayoutElementKeys,
  getDefaultUILayout,
} from '../../themes/layout';
import {
  Image,
  Trophy,
  Timer,
  Type,
  Megaphone,
  Eye,
  EyeOff,
  RotateCcw,
  Move,
  Maximize2,
  Layers,
  Sparkles,
  Info,
  Grid,
  Footprints,
} from 'lucide-react';

interface LayoutTabProps {
  theme: GameTheme;
  onChange: (updatedTheme: GameTheme) => void;
  selectedElementKey: LayoutElementKey | null;
  onSelectElementKey: (key: LayoutElementKey) => void;
}

export const LayoutTab: React.FC<LayoutTabProps> = ({
  theme,
  onChange,
  selectedElementKey = 'clientLogo',
  onSelectElementKey,
}) => {
  const gameType = getThemeGameType(theme);
  const elementKeys = getLayoutElementKeys(gameType);
  const defaultLayout = getDefaultUILayout(gameType);
  const layout: GameLayoutConfig = normalizeGameLayout(theme.layout, gameType);

  const activeKey: LayoutElementKey =
    selectedElementKey && elementKeys.includes(selectedElementKey as LayoutElementKey)
      ? (selectedElementKey as LayoutElementKey)
      : 'clientLogo';

  const activeMeta = LAYOUT_ELEMENTS_META[activeKey];
  const activeElement = layout[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey];

  // Helper to update layout configuration
  const handleUpdateLayout = (updater: (prev: GameLayoutConfig) => GameLayoutConfig) => {
    const nextLayout = updater(layout);
    onChange({
      ...theme,
      layout: nextLayout,
    });
  };

  // Update specific field for the active element
  const handleUpdateElementField = (
    field: 'visible' | 'x' | 'y' | 'width' | 'height',
    value: boolean | number
  ) => {
    handleUpdateLayout((prev) => ({
      ...prev,
      [activeKey]: {
        ...(prev[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey]),
        [field]: value,
      },
    }));
  };

  // Toggle visibility
  const handleToggleVisibility = (key: LayoutElementKey, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleUpdateLayout((prev) => {
      const currentEl = prev[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
      return {
        ...prev,
        [key]: {
          ...currentEl,
          visible: !currentEl.visible,
        },
      };
    });
  };

  // Reset active element to default
  const handleResetActiveElement = () => {
    handleUpdateLayout((prev) => ({
      ...prev,
      [activeKey]: { ...(defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey]) },
    }));
  };

  // Reset entire layout to default
  const handleResetAllLayout = () => {
    const isMemory = gameType === 'memory-match';
    const message = isMemory
      ? 'Reset all Memory Match UI elements (Logo, Score, Moves, Timer, Title, Footer) to standard defaults?'
      : 'Reset all UI elements (Logo, Score, Timer, Title, Footer) to standard arcade defaults?';

    if (window.confirm(message)) {
      onChange({
        ...theme,
        layout: getDefaultUILayout(gameType),
      });
    }
  };

  // Apply 9-point quick position
  const handleApplyQuickPosition = (anchor: QuickPositionAnchor) => {
    const elWidth = activeElement.width || activeMeta.defaultWidth;
    const coords = getQuickPositionCoords(anchor, elWidth);
    handleUpdateLayout((prev) => ({
      ...prev,
      [activeKey]: {
        ...(prev[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey]),
        x: coords.x,
        y: coords.y,
      },
    }));
  };

  const getElementIcon = (key: LayoutElementKey) => {
    switch (key) {
      case 'clientLogo':
        return <Image className="w-4 h-4 text-emerald-400" />;
      case 'scoreHud':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'movesHud':
        return <Footprints className="w-4 h-4 text-sky-400" />;
      case 'timer':
        return <Timer className="w-4 h-4 text-teal-400" />;
      case 'gameTitle':
        return <Type className="w-4 h-4 text-indigo-400" />;
      case 'footerSponsor':
        return <Megaphone className="w-4 h-4 text-purple-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <Grid className="w-4 h-4 text-amber-400" /> Game UI Layout & Positioning
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Customize the positions and sizes of in-game HUD elements. Coordinates are percentage-based
            (0-100%) so your layout automatically scales across phone screens and widescreen displays.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetAllLayout}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 shrink-0 transition-all"
          title="Reset all element coordinates to factory defaults"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>Reset All Layout</span>
        </button>
      </div>

      {/* Elements Selection Tabs / Badges */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          Select UI Element to Position
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {elementKeys.map((key) => {
            const meta = LAYOUT_ELEMENTS_META[key];
            const elem = layout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
            const isSelected = activeKey === key;
            const isVisible = elem.visible;

            return (
              <div
                key={key}
                onClick={() => onSelectElementKey(key)}
                className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-amber-500/15 border-amber-400/80 shadow-md ring-1 ring-amber-400/50'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {getElementIcon(key)}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-xs text-slate-200 truncate flex items-center gap-1.5">
                      <span>{meta.label}</span>
                      {!isVisible && (
                        <span className="text-[10px] text-slate-500 font-normal px-1 py-0.2 bg-slate-800 rounded">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      X: {Math.round(elem.x)}% | Y: {Math.round(elem.y)}% | W: {Math.round(elem.width || meta.defaultWidth)}%
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleToggleVisibility(key, e)}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isVisible
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-400'
                  }`}
                  title={isVisible ? 'Click to hide element in game' : 'Click to show element in game'}
                >
                  {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTIVE ELEMENT CONTROLS CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              {getElementIcon(activeKey)}
            </div>
            <div>
              <h4 className="font-black text-sm text-slate-100 flex items-center gap-2">
                <span>{activeMeta.label}</span>
                <span className="text-[10px] font-mono text-amber-400 uppercase px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  {activeKey}
                </span>
              </h4>
              <p className="text-xs text-slate-400">{activeMeta.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetActiveElement}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all"
              title="Reset this element to default position"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Visibility Toggle */}
        <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center gap-2.5">
            {activeElement.visible ? (
              <Eye className="w-4 h-4 text-emerald-400" />
            ) : (
              <EyeOff className="w-4 h-4 text-slate-500" />
            )}
            <div>
              <div className="text-xs font-bold text-slate-200">Element Visibility</div>
              <div className="text-[11px] text-slate-400">
                {activeElement.visible
                  ? 'Element is active and displayed in the game'
                  : 'Element is hidden from the game viewport'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdateElementField('visible', !activeElement.visible)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
              activeElement.visible
                ? 'bg-emerald-500 text-slate-950 shadow-md ring-1 ring-emerald-400'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {activeElement.visible ? 'VISIBLE' : 'HIDDEN'}
          </button>
        </div>

        {/* Position & Size Sliders & Numeric Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* X POSITION */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-amber-400" />
                <span>Horizontal X (%)</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(activeElement.x)}
                  onChange={(e) =>
                    handleUpdateElementField(
                      'x',
                      Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                    )
                  }
                  className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-400 text-right focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={activeElement.x}
              onChange={(e) => handleUpdateElementField('x', parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0% (Left)</span>
              <span>50%</span>
              <span>100% (Right)</span>
            </div>
          </div>

          {/* Y POSITION */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-teal-400" />
                <span>Vertical Y (%)</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(activeElement.y)}
                  onChange={(e) =>
                    handleUpdateElementField(
                      'y',
                      Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                    )
                  }
                  className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-teal-400 text-right focus:outline-none focus:border-teal-400"
                />
                <span className="text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={activeElement.y}
              onChange={(e) => handleUpdateElementField('y', parseFloat(e.target.value))}
              className="w-full accent-teal-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0% (Top)</span>
              <span>50%</span>
              <span>100% (Bottom)</span>
            </div>
          </div>

          {/* WIDTH SIZE */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Width Size (%)</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={activeMeta.minWidth}
                  max={activeMeta.maxWidth}
                  value={Math.round(activeElement.width || activeMeta.defaultWidth)}
                  onChange={(e) =>
                    handleUpdateElementField(
                      'width',
                      Math.max(
                        activeMeta.minWidth,
                        Math.min(activeMeta.maxWidth, parseFloat(e.target.value) || activeMeta.defaultWidth)
                      )
                    )
                  }
                  className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-indigo-400 text-right focus:outline-none focus:border-indigo-400"
                />
                <span className="text-xs text-slate-500 font-mono">%</span>
              </div>
            </div>
            <input
              type="range"
              min={activeMeta.minWidth}
              max={activeMeta.maxWidth}
              step="1"
              value={activeElement.width || activeMeta.defaultWidth}
              onChange={(e) => handleUpdateElementField('width', parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>{activeMeta.minWidth}% (Min)</span>
              <span>Def: {activeMeta.defaultWidth}%</span>
              <span>{activeMeta.maxWidth}% (Max)</span>
            </div>
          </div>
        </div>

        {/* 9-POINT QUICK ALIGNMENT PALETTE */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-amber-400" />
              <span>Quick 9-Point Alignment Grid</span>
            </label>
            <span className="text-[11px] text-slate-500">1-click snap to preset position</span>
          </div>

          <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto sm:mx-0">
            {(
              [
                { anchor: 'top-left', label: '↖ Top Left' },
                { anchor: 'top-center', label: '↑ Top Center' },
                { anchor: 'top-right', label: '↗ Top Right' },
                { anchor: 'center-left', label: '← Mid Left' },
                { anchor: 'center', label: '• Center' },
                { anchor: 'center-right', label: '→ Mid Right' },
                { anchor: 'bottom-left', label: '↙ Btm Left' },
                { anchor: 'bottom-center', label: '↓ Btm Center' },
                { anchor: 'bottom-right', label: '↘ Btm Right' },
              ] as { anchor: QuickPositionAnchor; label: string }[]
            ).map((pos) => (
              <button
                key={pos.anchor}
                type="button"
                onClick={() => handleApplyQuickPosition(pos.anchor)}
                className="px-2.5 py-2 bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 rounded-xl text-xs font-bold transition-all text-center"
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Tips Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-300">Live Drag & Resize in Simulation Viewport:</div>
            <div className="text-[11px] text-amber-200/90 leading-relaxed">
              You can also click and drag UI elements directly inside the live simulation preview on the right.
              Drag from the bounding box to move, or drag the side handle to change width!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
