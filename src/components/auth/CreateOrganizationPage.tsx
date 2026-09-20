import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CountrySelect } from '../common/CountrySelect';
import { navigateTo, navigateBack } from '../../hooks/useRouteContext';
import { Building2, Sparkles, ArrowRight, ArrowLeft, Shield, Loader2 } from 'lucide-react';

export const CreateOrganizationPage: React.FC = () => {
  const { createOrganization, logout, currentUser, cancelCreateOrganization, organizations } = useAuth();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownedOrgsCount = organizations.filter((o) => o.role === 'owner').length;
  const isOrgLimitReached = ownedOrgsCount >= 5;

  const handleGoBack = () => {
    // Safely restore previous active organization if user belongs to existing organization(s)
    if (cancelCreateOrganization) {
      cancelCreateOrganization();
    }
    // Navigate back to the previous route, safely falling back to /dashboard
    navigateBack('/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent double submission (Requirement 7)

    if (isOrgLimitReached) {
      setError('You have reached the maximum limit of 5 organizations for your account.');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your organization name');
      return;
    }
    if (!countryCode.trim()) {
      setError("Please select your organization's country");
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage('Creating workspace...');

    try {
      console.log('[CreateOrganizationPage] Submitting organization creation:', {
        name: name.trim(),
        hasLogo: Boolean(logoUrl.trim()),
        country_code: countryCode.trim(),
        user_id: currentUser?.id,
      });

      const orgId = await createOrganization(
        name.trim(),
        logoUrl.trim() || undefined,
        countryCode.trim()
      );

      console.log('[CreateOrganizationPage] Organization created successfully with id:', orgId);
      setStatusMessage('Launching Studio...');

      // Mandatory Onboarding Flow: Redirect immediately to /theme-setup after organization creation
      try {
        navigateTo('/theme-setup');
      } catch (navErr) {
        console.error('[CreateOrganizationPage] Navigation failure while navigating to /theme-setup:', navErr);
        // Direct browser fallback
        window.location.href = '/theme-setup';
      }
    } catch (err: any) {
      console.error('[CreateOrganizationPage] Organization creation failed:', err);
      setError(err.message || 'Failed to create organization');
      setLoading(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Top-left Go Back button above the form/card */}
      <div className="w-full max-w-lg mb-4 flex items-center justify-start z-10">
        <button
          id="create-org-go-back-btn"
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] bg-slate-900/90 hover:bg-slate-850 active:scale-95 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md group focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-amber-400 group-hover:-translate-x-0.5 transition-all shrink-0" />
          <span>Go Back</span>
        </button>
      </div>

      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Create Organization</h2>
              <p className="text-xs text-slate-400">Set up your company workspace</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Sign out
          </button>
        </div>

        {isOrgLimitReached && (
          <div id="org-limit-reached-banner" className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs space-y-1">
            <div className="font-bold flex items-center justify-between">
              <span>Organization Limit Reached (5 / 5)</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Each account can own a maximum of 5 organizations. To create another workspace, please manage or transfer ownership of an existing organization.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Organization / Company Name <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Games Studio, Apex Events"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <CountrySelect
              id="create-org-country"
              label="Business Country / Region"
              required
              value={countryCode}
              onChange={(code) => {
                setCountryCode(code);
                if (error && code) setError(null);
              }}
              helperText="Determines your default timezone, regional currency, and tax profile."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Logo Image URL (Optional)
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-200 font-medium">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>You will be assigned as Organization Owner</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              As the organization owner, you have full administrative control over event activations, custom game themes, and live leaderboards.
            </p>
          </div>

          <button
            id="create-org-submit-btn"
            type="submit"
            disabled={loading || isOrgLimitReached || !name.trim() || !countryCode}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>
              {isOrgLimitReached
                ? 'Limit Reached (5 Organizations Max)'
                : statusMessage || (loading ? 'Creating...' : 'Create Workspace & Launch Studio')}
            </span>
            {!loading && !isOrgLimitReached && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
