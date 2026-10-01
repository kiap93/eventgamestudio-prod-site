import React, { useState } from 'react';
import { useAuth, Organization } from '../../context/AuthContext';
import { CountrySelect } from '../common/CountrySelect';
import { Globe, Building2, ArrowRight, Shield, AlertTriangle, LogOut } from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

interface SetOrganizationCountryModalProps {
  organization: Organization;
}

export const SetOrganizationCountryModal: React.FC<SetOrganizationCountryModalProps> = ({
  organization,
}) => {
  const { updateOrganizationCountry, logout } = useAuth();
  const { t } = useLocalization();
  const [countryCode, setCountryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwnerOrAdmin = organization.role === 'owner' || organization.role === 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    if (!countryCode.trim()) {
      setError(t('auth.selectCountry'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateOrganizationCountry(countryCode.trim());
    } catch (err: any) {
      setError(err.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{t('auth.setCountryTitle')}</h2>
              <p className="text-xs text-slate-400">{t('auth.setCountryDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector variant="compact" />
            <button
              type="button"
              onClick={logout}
              title={t('nav.logout')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('nav.logout')}</span>
            </button>
          </div>
        </div>

        {/* Current Organization Info */}
        <div className="mb-5 p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              {organization.name}
            </span>
          </div>
          <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            {organization.role}
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        {isOwnerOrAdmin ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                To configure regional settings for <strong className="text-slate-100">{organization.name}</strong>, please select your business country.
              </p>
              <p className="text-[11px] text-slate-400">
                {t('auth.operatingCountryDesc')}
              </p>
            </div>

            <div>
              <CountrySelect
                id="existing-org-country"
                label={t('auth.country')}
                required
                value={countryCode}
                onChange={(code) => {
                  setCountryCode(code);
                  if (error && code) setError(null);
                }}
                helperText={t('auth.operatingCountryDesc')}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !countryCode}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-5 rounded-xl transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer text-xs"
            >
              <span>{loading ? t('common.saving') : t('auth.confirmCountry')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90 leading-relaxed space-y-1">
                <p className="font-semibold text-amber-300">{t('auth.countrySetupPending')}</p>
                <p className="text-[11px]">
                  {t('auth.countrySetupPendingDesc')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              {t('auth.contactAdminCountry')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
