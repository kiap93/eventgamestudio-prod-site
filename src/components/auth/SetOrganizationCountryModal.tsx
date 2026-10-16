import React, { useState } from 'react';
import { useAuth, Organization } from '../../context/AuthContext';
import { CountrySelect } from '../common/CountrySelect';
import { useLocalization } from '../../context/LocalizationContext';
import { Building2, Globe, AlertCircle, ArrowRight } from 'lucide-react';

interface SetOrganizationCountryModalProps {
  organization: Organization;
}

export const SetOrganizationCountryModal: React.FC<SetOrganizationCountryModalProps> = ({
  organization,
}) => {
  const { t } = useLocalization();
  const { updateOrganizationCountry } = useAuth();
  const [selectedCountryCode, setSelectedCountryCode] = useState(
    organization.country_code || 'MY'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCountryCode.trim()) {
      setError(t('org.selectCountryError', undefined, 'Please select your operating country.'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateOrganizationCountry(selectedCountryCode.trim());
    } catch (err: any) {
      setError(err.message || t('org.updateCountryFailed', undefined, 'Failed to update organization country.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow header accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-80" />

        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-400">
            <Globe className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            {t('org.selectCountryTitle', undefined, 'Set Organization Country')}
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {t(
              'org.selectCountryDesc',
              { orgName: organization.name },
              `Select the primary operating country for "${organization.name}" to configure currency and pricing defaults.`
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <CountrySelect
            value={selectedCountryCode}
            onChange={(code) => {
              setSelectedCountryCode(code);
              setError(null);
            }}
            label={t('org.countryLabel', undefined, 'Operating Country')}
            helperText={t('org.countryHelper', undefined, 'Used for regional pricing currency and event timezone standards.')}
          />

          <button
            type="submit"
            disabled={saving || !selectedCountryCode.trim()}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{t('common.continue', undefined, 'Confirm & Continue')}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
