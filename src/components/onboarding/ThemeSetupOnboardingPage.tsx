import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Palette,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Rocket,
  ShieldAlert,
  Loader2,
  Layers,
  Check,
  ChevronRight,
  Sliders,
  Image as ImageIcon,
} from 'lucide-react';

export const ThemeSetupOnboardingPage: React.FC = () => {
  const { currentOrganization, fetchThemes } = useAuth();
  const { t } = useLocalization();
  const [loading, setLoading] = useState(true);
  const [startingCustomization, setStartingCustomization] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [themeReadiness, setThemeReadiness] = useState<{
    hasValidTheme: boolean;
    themeCount: number;
    themeSetupRequired: boolean;
    suggestedThemeId: string | null;
  } | null>(null);

  // Check current theme readiness
  useEffect(() => {
    let isMounted = true;
    const checkReadiness = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/theme-readiness');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setThemeReadiness(data);
          }
        }
      } catch (err: any) {
        console.error('[ThemeSetupOnboardingPage] Error checking readiness:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkReadiness();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCustomizeTheme = async () => {
    setStartingCustomization(true);
    setError(null);

    try {
      // 1. Call endpoint to resolve or create the onboarding theme
      const res = await apiFetch('/api/themes/onboarding-theme', {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize theme setup');
      }

      const data = await res.json();
      const themeId = data.theme?.id;

      if (!themeId) {
        throw new Error('No theme ID returned from server');
      }

      // Refresh themes in context so the theme is available in state
      await fetchThemes();

      // 2. Direct to theme editor with onboarding query parameters
      navigateTo(`/games?editTheme=${encodeURIComponent(themeId)}&onboarding=true`);
    } catch (err: any) {
      console.error('[ThemeSetupOnboardingPage] Failed to start theme setup:', err);
      setError(err.message || 'Unable to start theme setup. Please try again.');
      setStartingCustomization(false);
    }
  };

  const handleReturnToDashboard = () => {
    navigateTo('/events');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-sm">
              EG
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 block">
                {t('onboarding.workspaceSetup')}
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {currentOrganization?.name || 'My Organization'}
              </span>
            </div>
          </div>

          <button
            onClick={handleReturnToDashboard}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            {t('nav.dashboard')}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col justify-center">
        {/* Onboarding Progress Stepper */}
        <div className="mb-10">
          <div className="flex items-center justify-between max-w-2xl mx-auto relative">
            {/* Connecting Track */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
            
            {/* Step 1: Active */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm shadow-md ring-4 ring-amber-100">
                1
              </div>
              <span className="text-xs font-bold text-slate-900 mt-2">{t('onboarding.stepTheme')}</span>
              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">{t('common.required')}</span>
            </div>

            {/* Step 2: Upcoming */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-300 text-slate-400 font-semibold flex items-center justify-center text-sm">
                2
              </div>
              <span className="text-xs font-medium text-slate-500 mt-2">{t('onboarding.stepEvent')}</span>
              <span className="text-[10px] text-slate-400">{t('onboarding.step2')}</span>
            </div>

            {/* Step 3: Upcoming */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-300 text-slate-400 font-semibold flex items-center justify-center text-sm">
                3
              </div>
              <span className="text-xs font-medium text-slate-500 mt-2">{t('onboarding.stepLaunch')}</span>
              <span className="text-[10px] text-slate-400">{t('onboarding.step3')}</span>
            </div>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* Card Top Banner */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent px-8 py-4 border-b border-amber-500/20 flex items-center gap-2 text-amber-800 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>{t('studio.mandatoryThemeSetup')}</span>
          </div>

          <div className="p-8 sm:p-12 text-center max-w-2xl mx-auto">
            {/* Visual Icon Badge */}
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Palette className="w-8 h-8" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {t('onboarding.heroTitle')}
            </h1>

            <p className="text-base text-slate-600 leading-relaxed mb-8">
              {t('onboarding.heroSubtitle')}
            </p>

            {/* Theme Ready Banner if already created */}
            {themeReadiness?.hasValidTheme ? (
              <div className="mb-8 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-left flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-emerald-900">{t('onboarding.themeReady')}</p>
                  <p className="text-emerald-700 mt-0.5">
                    {t('onboarding.themeReadyDesc')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold">{t('onboarding.themeRequired')}</p>
                  <p className="text-amber-700 mt-0.5">
                    {t('onboarding.themeRequiredDesc')}
                  </p>
                </div>
              </div>
            )}

            {/* Value Preview Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10 text-left">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white shadow-xs text-slate-700">
                  <Sliders className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">{t('onboarding.brandColors')}</div>
                  <div className="text-[11px] text-slate-500">{t('onboarding.brandColorsDesc')}</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white shadow-xs text-slate-700">
                  <ImageIcon className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">{t('onboarding.gameTargets')}</div>
                  <div className="text-[11px] text-slate-500">{t('onboarding.gameTargetsDesc')}</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white shadow-xs text-slate-700">
                  <Layers className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">{t('onboarding.audioSfx')}</div>
                  <div className="text-[11px] text-slate-500">{t('onboarding.audioSfxDesc')}</div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium text-left">
                {error}
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCustomizeTheme}
                disabled={startingCustomization}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {startingCustomization ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('onboarding.preparingThemeEditor')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('onboarding.customizeMyTheme')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {themeReadiness?.hasValidTheme ? (
                <button
                  type="button"
                  onClick={() => navigateTo('/events?create=true')}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>{t('onboarding.createFirstEvent')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReturnToDashboard}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
                >
                  {t('nav.dashboard')}
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-6">
              {t('onboarding.returnNotice')}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

