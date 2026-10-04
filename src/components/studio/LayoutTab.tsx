import React, { useState, useMemo } from 'react';
import { GameTheme, getThemeGameType, GameOrientation } from '../../themes/types';
import { useLocalization } from '../../context/LocalizationContext';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
  getQuickPositionCoords,
  getBoardQuickPositionCoords,
  QuickPositionAnchor,
  getLayoutElementKeys,
  getDefaultUILayout,
} from '../../themes/layout';
import { getEditableGameLayout } from '../../themes/responsive';
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
  Smartphone,
  Monitor,
  Compass,
} from 'lucide-react';

interface LayoutTabProps {
  theme: GameTheme;
  onChange: (updatedTheme: GameTheme) => void;
  selectedElementKey: LayoutElementKey | null;
  onSelectElementKey: (key: LayoutElementKey) => void;
  activeOrientation?: 'landscape' | 'portrait';
  onOrientationChange?: (orientation: 'landscape' | 'portrait') => void;
}

export const LayoutTab: React.FC<LayoutTabProps> = ({
  theme,
  onChange,
  selectedElementKey = 'clientLogo',
  onSelectElementKey,
  activeOrientation: controlledOrientation,
  onOrientationChange,
}) => {
  const { t } = useLocalization();
  const gameType = getThemeGameType(theme);
  const elementKeys = getLayoutElementKeys(gameType);
  const defaultLayout = getDefaultUILayout(gameType);

  const [internalOrientation, setInternalOrientation] = useState<'landscape' | 'portrait'>(() => {
    return theme.layout?.orientation === 'portrait' ? 'portrait' : 'landscape';
  });
  const activeOrientation = controlledOrientation ?? internalOrientation;
  const isPortraitMode = activeOrientation === 'portrait';

  const handleSetOrientation = (orient: 'landscape' | 'portrait') => {
    setInternalOrientation(orient);
    onOrientationChange?.(orient);
  };

  const activeLayout: GameLayoutConfig = useMemo(
    () => getEditableGameLayout(theme.layout, isPortraitMode, gameType),
    [theme.layout, isPortraitMode, gameType]
  );

  const activeKey: LayoutElementKey =
    selectedElementKey && elementKeys.includes(selectedElementKey as LayoutElementKey)
      ? (selectedElementKey as LayoutElementKey)
      : 'clientLogo';

  const activeMeta = LAYOUT_ELEMENTS_META[activeKey];
  const activeElement =
    activeLayout[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey];

  // Helper to update layout configuration
  const handleUpdateLayout = (updater: (prev: GameLayoutConfig) => GameLayoutConfig) => {
    const rawLayout = theme.layout || getDefaultUILayout(gameType);
    const nextLayout = updater(rawLayout);
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
    handleUpdateLayout((prev) => {
      if (isPortraitMode) {
        const currentPortrait = prev.portraitLayout || {};
        const currentElem =
          (currentPortrait as any)[activeKey] ||
          activeLayout[activeKey] ||
          defaultLayout[activeKey] ||
          DEFAULT_GAME_LAYOUT[activeKey];
        return {
          ...prev,
          portraitLayout: {
            ...currentPortrait,
            [activeKey]: {
              ...currentElem,
              [field]: value,
            },
          },
        };
      }
      const currentElem = prev[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey];
      return {
        ...prev,
        [activeKey]: {
          ...currentElem,
          [field]: value,
        },
      };
    });
  };

  // Toggle visibility
  const handleToggleVisibility = (key: LayoutElementKey, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleUpdateLayout((prev) => {
      if (isPortraitMode) {
        const currentPortrait = prev.portraitLayout || {};
        const currentElem =
          (currentPortrait as any)[key] ||
          activeLayout[key] ||
          defaultLayout[key] ||
          DEFAULT_GAME_LAYOUT[key];
        return {
          ...prev,
          portraitLayout: {
            ...currentPortrait,
            [key]: {
              ...currentElem,
              visible: !currentElem.visible,
            },
          },
        };
      }
      const currentElem = prev[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
      return {
        ...prev,
        [key]: {
          ...currentElem,
          visible: !currentElem.visible,
        },
      };
    });
  };

  // Reset active element to default
  const handleResetActiveElement = () => {
    handleUpdateLayout((prev) => {
      if (isPortraitMode) {
        const currentPortrait = { ...(prev.portraitLayout || {}) };
        delete (currentPortrait as any)[activeKey];
        return {
          ...prev,
          portraitLayout: currentPortrait,
        };
      }
      return {
        ...prev,
        [activeKey]: { ...(defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey]) },
      };
    });
  };

  // Reset entire layout to default
  const handleResetAllLayout = () => {
    const isMemory = gameType === 'memory-match';
    if (isPortraitMode) {
      const message = isMemory
        ? 'Reset all Memory Match portrait UI elements to default portrait layout?'
        : 'Reset all portrait UI elements to default portrait layout?';
      if (window.confirm(message)) {
        handleUpdateLayout((prev) => {
          const { portraitLayout, ...rest } = prev;
          return rest;
        });
      }
    } else {
      const message = isMemory
        ? 'Reset all Memory Match landscape UI elements to standard defaults?'
        : 'Reset all landscape UI elements to standard defaults?';
      if (window.confirm(message)) {
        handleUpdateLayout((prev) => ({
          ...getDefaultUILayout(gameType),
          ...(prev.portraitLayout ? { portraitLayout: prev.portraitLayout } : {}),
        }));
      }
    }
  };

  // Apply 9-point quick position
  const handleApplyQuickPosition = (anchor: QuickPositionAnchor) => {
    if (activeKey === 'memoryCardBoard') {
      const coords = getBoardQuickPositionCoords(anchor);
      handleUpdateElementField('x', coords.x);
      handleUpdateElementField('y', coords.y);
      return;
    }

    const elWidth = activeElement.width || activeMeta.defaultWidth;
    const coords = getQuickPositionCoords(anchor, elWidth);
    handleUpdateLayout((prev) => {
      if (isPortraitMode) {
        const currentPortrait = prev.portraitLayout || {};
        const currentElem =
          (currentPortrait as any)[activeKey] ||
          activeLayout[activeKey] ||
          defaultLayout[activeKey] ||
          DEFAULT_GAME_LAYOUT[activeKey];
        return {
          ...prev,
          portraitLayout: {
            ...currentPortrait,
            [activeKey]: {
              ...currentElem,
              x: coords.x,
              y: coords.y,
            },
          },
        };
      }
      const currentElem = prev[activeKey] || defaultLayout[activeKey] || DEFAULT_GAME_LAYOUT[activeKey];
      return {
        ...prev,
        [activeKey]: {
          ...currentElem,
          x: coords.x,
          y: coords.y,
        },
      };
    });
  };

  const getElementIcon = (key: LayoutElementKey) => {
    switch (key) {
      case 'clientLogo':
        return <Image className="w-4 h-4 text-emerald-400" />;
      case 'scoreHud':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'movesHud':
        return <Footprints className="w-4 h-4 text-sky-400" />;
      case 'pairsHud':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'memoryCardBoard':
        return <Grid className="w-4 h-4 text-amber-400" />;
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
          title={t('studio.resetAllLayoutTitle')}
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('studio.resetAllLayout')}</span>
        </button>
      </div>

      {/* Target Device Orientation Setting */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-emerald-400" /> Target Orientation & Responsiveness
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            Choose how this theme displays on mobile devices and kiosks. In Auto mode, the game adapts seamlessly between portrait and landscape.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            {
              id: 'auto' as GameOrientation,
              title: 'Auto Responsive',
              desc: 'Adapts to phone portrait or desktop landscape dynamically',
              icon: <Compass className="w-4 h-4 text-emerald-400" />,
            },
            {
              id: 'landscape' as GameOrientation,
              title: 'Landscape Preferred',
              desc: 'Best for widescreen kiosks, iPads & desktop monitors',
              icon: <Monitor className="w-4 h-4 text-sky-400" />,
            },
            {
              id: 'portrait' as GameOrientation,
              title: 'Portrait Preferred',
              desc: 'Optimized for mobile upright play & vertical totems',
              icon: <Smartphone className="w-4 h-4 text-amber-400" />,
            },
          ].map((mode) => {
            const currentOrientation = theme.layout?.orientation || 'auto';
            const isSelected = currentOrientation === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  handleUpdateLayout((prev) => ({
                    ...prev,
                    orientation: mode.id,
                  }));
                  if (mode.id === 'portrait') {
                    handleSetOrientation('portrait');
                  } else if (mode.id === 'landscape') {
                    handleSetOrientation('landscape');
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-400/80 shadow-md ring-1 ring-emerald-400/40'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {mode.icon}
                  <span className="text-xs font-black text-slate-200">{mode.title}</span>
                </div>
                <span className="text-[11px] text-slate-400 leading-snug">{mode.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Layout Editing Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-amber-400" /> Active Layout Editing Mode
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Switch between Landscape and Portrait to position elements independently for each orientation.
            </p>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 self-start sm:self-auto ${
              isPortraitMode
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            Editing: {activeOrientation}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => handleSetOrientation('landscape')}
            className={`p-3 rounded-xl border text-left font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
              !isPortraitMode
                ? 'bg-sky-500/15 border-sky-400 text-sky-200 shadow-md ring-1 ring-sky-400/40'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Monitor className="w-4 h-4 text-sky-400" />
              <div>
                <div>{t('studio.landscapeLayout')}</div>
                <div className="text-[10px] font-normal text-slate-400">{t('studio.landscapeLayoutDesc')}</div>
              </div>
            </div>
            {!isPortraitMode && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-sky-500/20 text-sky-300 rounded font-semibold border border-sky-500/30">
                {t('common.active')}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSetOrientation('portrait')}
            className={`p-3 rounded-xl border text-left font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
              isPortraitMode
                ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/40'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <div>
                <div>{t('studio.portraitLayout')}</div>
                <div className="text-[10px] font-normal text-slate-400">{t('studio.portraitLayoutDesc')}</div>
              </div>
            </div>
            {isPortraitMode && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold border border-amber-500/30">
                {t('common.active')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Elements Selection Tabs / Badges */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          Select UI Element to Position ({isPortraitMode ? 'Portrait' : 'Landscape'})
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {elementKeys.map((key) => {
            const meta = LAYOUT_ELEMENTS_META[key];
            const elem = activeLayout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
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
                      {meta.allowResize === false
                        ? `Center: X: ${Math.round(elem.x)}% | Y: ${Math.round(elem.y)}%`
                        : `X: ${Math.round(elem.x)}% | Y: ${Math.round(elem.y)}% | W: ${Math.round(elem.width || meta.defaultWidth)}%`}
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
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              title={t('studio.resetElementPosition')}
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>{t('common.reset')}</span>
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
              <div className="text-xs font-bold text-slate-200">{t('studio.elementVisibility')}</div>
              <div className="text-[11px] text-slate-400">
                {activeElement.visible
                  ? t('common.visible')
                  : t('common.hidden')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleUpdateElementField('visible', !activeElement.visible)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeElement.visible
                ? 'bg-emerald-500 text-slate-950 shadow-md ring-1 ring-emerald-400'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {activeElement.visible ? t('common.visible').toUpperCase() : t('common.hidden').toUpperCase()}
          </button>
        </div>

        {/* Position & Size Sliders & Numeric Controls */}
        <div
          className={`grid grid-cols-1 ${
            activeMeta.allowResize === false ? 'md:grid-cols-2' : 'md:grid-cols-3'
          } gap-4`}
        >
          {/* X POSITION */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('studio.horizontalX')}</span>
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
              <span>{t('studio.alignLeftPct')}</span>
              <span>{t('studio.alignCenterPct')}</span>
              <span>{t('studio.alignRightPct')}</span>
            </div>
          </div>

          {/* Y POSITION */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-teal-400" />
                <span>{t('studio.verticalY')}</span>
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
              <span>{t('studio.alignTopPct')}</span>
              <span>{t('studio.alignMiddlePct')}</span>
              <span>{t('studio.alignBottomPct')}</span>
            </div>
          </div>

          {/* WIDTH SIZE */}
          {activeMeta.allowResize !== false && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('studio.widthSize')}</span>
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
                          Math.min(
                            activeMeta.maxWidth,
                            parseFloat(e.target.value) || activeMeta.defaultWidth
                          )
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
          )}
        </div>

        {/* 9-POINT QUICK ALIGNMENT PALETTE */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('studio.quickAlignmentGrid')}</span>
            </label>
            <span className="text-[11px] text-slate-500">{t('studio.oneClickSnap')}</span>
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
            <div className="font-bold text-amber-300">{t('studio.liveDragResizeViewport')}</div>
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
