import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileText,
  Mail,
  Phone,
  MapPin,
  Globe,
  Percent,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useLocalization } from '../../context/LocalizationContext';

export interface SellerInvoiceSettings {
  company_name: string;
  registration_number: string;
  tax_number: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  default_tax_rate: number;
  payment_terms_days: number;
  notes_template: string;
  updated_at?: string;
  updated_by?: string | null;
}

export const DeveloperInvoiceSettings: React.FC = () => {
  const { t } = useLocalization();
  const [settings, setSettings] = useState<SellerInvoiceSettings>({
    company_name: '',
    registration_number: '',
    tax_number: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    default_tax_rate: 0,
    payment_terms_days: 14,
    notes_template: '',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/invoice-settings');
      if (!res.ok) {
        throw new Error(`Failed to load invoice settings (${res.status})`);
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (err: any) {
      setError(err?.message || t('invoices.errorFetchingSellerSettings', undefined, 'Error fetching seller settings'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch('/api/developer/invoice-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('invoices.failedUpdateInvoiceSettings', undefined, 'Failed to update invoice settings'));
      }

      if (data.settings) {
        setSettings(data.settings);
      }
      setSuccess(t('invoices.sellerSettingsUpdatedSuccess', undefined, 'Official seller invoice settings updated successfully.'));
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err?.message || t('invoices.errorSavingInvoiceSettings', undefined, 'Error saving invoice settings'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-emerald-400" />
        <span>{t('invoices.loadingSellerConfig', undefined, 'Loading seller billing configuration...')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            {t('invoices.officialSellerDetails', undefined, 'Official Seller Business Details')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t('invoices.officialSellerDetailsDesc', undefined, 'These legal business details are frozen immutably onto all customer tax invoices and credit notes generated across the platform.')}
          </p>
        </div>
        <button
          onClick={fetchSettings}
          disabled={loading || saving}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{t('common.reload', undefined, 'Reload')}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company Identity */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            {t('invoices.companyIdentityRegistration', undefined, 'Company Identity & Registration')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.registeredCompanyName', undefined, 'Registered Company Name')} <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={settings.company_name}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                placeholder={t('invoices.companyNamePlaceholder', undefined, 'e.g. Event Game Studio Sdn. Bhd.')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.businessRegNumber', undefined, 'Business Registration Number (SSM / ACRA / EIN)')}
              </label>
              <input
                type="text"
                value={settings.registration_number || ''}
                onChange={(e) => setSettings({ ...settings, registration_number: e.target.value })}
                placeholder={t('invoices.businessRegPlaceholder', undefined, 'e.g. 202601009876 (1509876-V)')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.taxRegId', undefined, 'Tax / SST / GST Registration ID')}
              </label>
              <input
                type="text"
                value={settings.tax_number || ''}
                onChange={(e) => setSettings({ ...settings, tax_number: e.target.value })}
                placeholder={t('invoices.taxRegPlaceholder', undefined, 'e.g. W10-2601-98765432')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.officialWebsite', undefined, 'Official Website')}
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={settings.website || ''}
                  onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                  placeholder="https://eventgamestudio.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Physical Address */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-400" />
            {t('invoices.billingContactAddress', undefined, 'Billing Contact & Legal Address')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.billingAccountsEmail', undefined, 'Billing & Accounts Email')} <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  placeholder="billing@eventgamestudio.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.billingPhoneSupport', undefined, 'Billing Phone / WhatsApp Support')}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="+60 11-3678 3717"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.fullRegisteredAddress', undefined, 'Full Registered Office Address')}
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <textarea
                  rows={2}
                  value={settings.address || ''}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  placeholder={t('invoices.addressPlaceholder', undefined, 'Level 28, The Exchange 106, Lingkaran TRX, 55188 Kuala Lumpur, Malaysia')}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tax, Payment Terms & Notes Template */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Percent className="w-4 h-4 text-emerald-400" />
            {t('invoices.taxationPaymentTerms', undefined, 'Taxation & Payment Terms')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.defaultTaxRate', undefined, 'Default Tax Rate (%)')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={Math.round(settings.default_tax_rate * 10000) / 100}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value) || 0;
                    setSettings({ ...settings, default_tax_rate: pct / 100 });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none transition-colors"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {t('invoices.taxRateHint', undefined, 'Enter 0 for 0% (Tax exempt / zero-rated), or 8 for 8% SST.')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.paymentDueWindow', undefined, 'Payment Due Window (Days)')}
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={settings.payment_terms_days}
                  onChange={(e) => setSettings({ ...settings, payment_terms_days: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {t('invoices.paymentDueHint', undefined, 'Default: 14 days from issue date.')}
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('invoices.defaultNotesTemplate', undefined, 'Default Invoice Notes & Legal Terms Template')}
              </label>
              <textarea
                rows={3}
                value={settings.notes_template || ''}
                onChange={(e) => setSettings({ ...settings, notes_template: e.target.value })}
                placeholder={t('invoices.notesTemplatePlaceholder', undefined, 'Official tax invoice issued for interactive event mini-game activation. All licensing fees are non-refundable once live event execution starts.')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-slate-500">
            {settings.updated_at && (
              <span>{t('invoices.lastUpdated', { date: new Date(settings.updated_at).toLocaleString() }, `Last updated: ${new Date(settings.updated_at).toLocaleString()}`)}</span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? t('common.saving', undefined, 'Saving...') : t('invoices.saveSellerSettings', undefined, 'Save Seller Settings')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
