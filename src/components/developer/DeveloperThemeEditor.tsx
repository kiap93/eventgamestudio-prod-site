import React, { useState, useEffect, useRef } from 'react';
import { GameTheme, normalizeGameTheme } from '../../themes';
import { LiveThemePreview } from '../studio/LiveThemePreview';
import { VisualsTab } from '../studio/VisualsTab';
import { ItemsTab } from '../studio/ItemsTab';
import { GameplayTab } from '../studio/GameplayTab';
import { AudioTab } from '../studio/AudioTab';
import { BrandingTab } from '../studio/BrandingTab';
import { LayoutTab } from '../studio/LayoutTab';
import { LayoutElementKey, GameLayoutConfig } from '../../themes/layout';
import { DeveloperPlayTestModal } from './DeveloperPlayTestModal';
import { apiFetch } from '../../lib/api';
import {
  ArrowLeft,
  Palette,
  Layers,
  Sparkles,
  Zap,
  Volume2,
  Save,
  Check,
  CheckCircle2,
  AlertCircle,
  Play,
  Gamepad2,
  Grid,
  ShieldCheck,
  Star,
} from 'lucide-react';

interface DeveloperThemeEditorProps {
  gameId: string;
  themeId: string;
  onBack: () => void;
}

export const DeveloperThemeEditor: React.FC<DeveloperThemeEditorProps> = ({
  gameId,
  themeId,
  onBack,
}) => {
  const [theme, setTheme] = useState<GameTheme | null>(null);
  const [gameName, setGameName] = useState<string>('Durian Catcher');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'visuals' | 'items' | 'gameplay' | 'audio' | 'branding' | 'layout'>('visuals');
  const [selectedLayoutElement, setSelectedLayoutElement] = useState<LayoutElementKey>('clientLogo');

  // Load theme data from developer endpoint
  useEffect(() => {
    let isMounted = true;
    async function loadTheme() {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('app_token');
        const headers = { Authorization: `Bearer ${token}` };

        const res = await apiFetch(`/api/developer/themes/${themeId}`, { headers });
        if (!res.ok) throw new Error('Failed to load system theme');
        const data = await res.json();

        if (isMounted && data.theme) {
          const normalized = normalizeGameTheme(data.theme);
          setTheme(normalized);
          if (data.theme.game_name) {
            setGameName(data.theme.game_name);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error loading theme');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTheme();
    return () => {
      isMounted = false;
    };
  }, [themeId]);

  // Asset upload via API
  const handleUploadAsset = async (file: File): Promise<string> => {
    const token = localStorage.getItem('app_token');
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiFetch('/api/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload asset');
    }

    const data = await res.json();
    return data.url;
  };

  // Field change handler
  const handleFieldChange = (field: keyof GameTheme, value: any) => {
    setTheme((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [field]: value,
      };
    });
    setSavedSuccess(false);
  };

  // Layout changes
  const handleLayoutChange = (layoutUpdates: Partial<GameLayoutConfig>) => {
    setTheme((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        layout: {
          ...(prev.layout || {}),
          ...layoutUpdates,
        },
      };
    });
    setSavedSuccess(false);
  };

  // Save handler
  const handleSave = async () => {
    if (!theme) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('app_token');
      const res = await apiFetch(`/api/developer/themes/${themeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: theme.name,
          slug: theme.slug,
          description: theme.description,
          status: theme.status,
          is_default: theme.is_default,
          branding: theme.branding,
          background_url: theme.background_url,
          basket_config: theme.basket_config,
          items_config: theme.items_config,
          physics_config: theme.physics_config,
          visuals_config: theme.visuals_config,
          sounds_config: theme.sounds_config,
          layout: theme.layout,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save system theme');
      }

      const data = await res.json();
      setTheme(normalizeGameTheme(data.theme));
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error saving theme');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="text-center py-20 bg-slate-900/50 border border-slate-800 rounded-2xl p-8">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">Theme Not Found</h3>
        <p className="text-xs text-slate-400 mb-4">{error || 'Could not load system default theme.'}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Game Themes</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors shrink-0"
            title="Back to Game Details"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="cursor-pointer hover:text-white" onClick={onBack}>
                {gameName}
              </span>
              <span>/</span>
              <span className="text-amber-400 font-semibold flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                SYSTEM DEFAULT THEME
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <h1 className="text-xl font-bold text-white">{theme.name}</h1>
              {theme.is_default && (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold uppercase">
                  <Star className="w-3 h-3 fill-slate-950" />
                  <span>Primary</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setIsPlayingTest(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Test Play Live</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
              savedSuccess
                ? 'bg-emerald-500 text-white shadow-emerald-950/30'
                : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-950/30'
            }`}
          >
            {saving ? (
              <span>Saving...</span>
            ) : savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved to Platform</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save System Theme</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Grid: Tabs & Form on Left, Live Canvas Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Form Area */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          {/* Tabs Header */}
          <div className="flex items-center space-x-1 p-2 bg-slate-950/60 border-b border-slate-800 overflow-x-auto">
            <button
              onClick={() => setActiveTab('visuals')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'visuals' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Visuals</span>
            </button>

            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'items' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Items & Hazards</span>
            </button>

            <button
              onClick={() => setActiveTab('gameplay')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'gameplay' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Gameplay</span>
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'audio' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Audio</span>
            </button>

            <button
              onClick={() => setActiveTab('branding')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'branding' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Branding</span>
            </button>

            <button
              onClick={() => setActiveTab('layout')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'layout' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Layout & HUD</span>
            </button>
          </div>

          {/* Active Tab Body */}
          <div className="p-6 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
            {activeTab === 'visuals' && (
              <VisualsTab
                theme={theme}
                isViewer={false}
                onFieldChange={handleFieldChange}
                onUploadAsset={handleUploadAsset}
              />
            )}

            {activeTab === 'items' && (
              <ItemsTab
                theme={theme}
                isViewer={false}
                onFieldChange={handleFieldChange}
                onUploadAsset={handleUploadAsset}
              />
            )}

            {activeTab === 'gameplay' && (
              <GameplayTab
                theme={theme}
                isViewer={false}
                onFieldChange={handleFieldChange}
              />
            )}

            {activeTab === 'audio' && (
              <AudioTab
                theme={theme}
                isViewer={false}
                onFieldChange={handleFieldChange}
                onUploadAsset={handleUploadAsset}
              />
            )}

            {activeTab === 'branding' && (
              <BrandingTab
                theme={theme}
                isViewer={false}
                onFieldChange={handleFieldChange}
                onUploadAsset={handleUploadAsset}
              />
            )}

            {activeTab === 'layout' && (
              <LayoutTab
                theme={theme}
                isViewer={false}
                onLayoutChange={handleLayoutChange}
                onUploadAsset={handleUploadAsset}
                selectedElement={selectedLayoutElement}
                onSelectElement={setSelectedLayoutElement}
              />
            )}
          </div>
        </div>

        {/* Right Live Preview Area */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col h-full min-h-[520px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center">
                <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Live Preview
              </span>
              <button
                onClick={() => setIsPlayingTest(true)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Launch Test Play
              </button>
            </div>

            <div className="flex-1 w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative flex items-center justify-center">
              <LiveThemePreview theme={theme} />
            </div>
          </div>
        </div>
      </div>

      {/* Test Play Modal */}
      {isPlayingTest && (
        <DeveloperPlayTestModal
          theme={theme}
          gameName={gameName}
          onClose={() => setIsPlayingTest(false)}
        />
      )}
    </div>
  );
};
