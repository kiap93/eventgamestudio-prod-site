import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { PlatformContactSettings } from '../../types/developer';
import {
  MessageCircle,
  Phone,
  Mail,
  Clock,
  MapPin,
  Save,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Globe,
  Sliders,
  RotateCcw,
  Send,
  HelpCircle,
} from 'lucide-react';

const DEFAULT_SETTINGS: PlatformContactSettings = {
  whatsapp_number: '60162128913',
  whatsapp_display: '+60 16-212 8913',
  whatsapp_prefill_message: "Hello Event Game Studio! I'm interested in interactive game activations for an upcoming event. Could you share more details?",
  enquiry_email: 'contact@eventgamestudio.com',
  support_hours: 'Mon – Sat, 9:00 AM – 7:00 PM (UTC+8) | <15 min reply during live events',
  office_location: 'Kuala Lumpur, Malaysia (UTC+8)',
};

export const DeveloperContactSettings: React.FC = () => {
  const [settings, setSettings] = useState<PlatformContactSettings>(DEFAULT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<PlatformContactSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form Fields
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [whatsappDisplay, setWhatsappDisplay] = useState<string>('');
  const [whatsappPrefill, setWhatsappPrefill] = useState<string>('');
  const [enquiryEmail, setEnquiryEmail] = useState<string>('');
  const [supportHours, setSupportHours] = useState<string>('');
  const [officeLocation, setOfficeLocation] = useState<string>('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/contact-settings');
      if (res.ok) {
        const data = await res.json();
        const s: PlatformContactSettings = data.settings || data;
        setSettings(s);
        setInitialSettings(s);
        setWhatsappNumber(s.whatsapp_number || DEFAULT_SETTINGS.whatsapp_number);
        setWhatsappDisplay(s.whatsapp_display || DEFAULT_SETTINGS.whatsapp_display);
        setWhatsappPrefill(s.whatsapp_prefill_message || DEFAULT_SETTINGS.whatsapp_prefill_message);
        setEnquiryEmail(s.enquiry_email || DEFAULT_SETTINGS.enquiry_email);
        setSupportHours(s.support_hours || DEFAULT_SETTINGS.support_hours);
        setOfficeLocation(s.office_location || DEFAULT_SETTINGS.office_location);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to fetch contact settings');
      }
    } catch (err: any) {
      console.error('Fetch contact settings error:', err);
      setError(err.message || 'Network error fetching contact settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isDirty =
    whatsappNumber !== (initialSettings.whatsapp_number || '') ||
    whatsappDisplay !== (initialSettings.whatsapp_display || '') ||
    whatsappPrefill !== (initialSettings.whatsapp_prefill_message || '') ||
    enquiryEmail !== (initialSettings.enquiry_email || '') ||
    supportHours !== (initialSettings.support_hours || '') ||
    officeLocation !== (initialSettings.office_location || '');

  const handleReset = () => {
    setWhatsappNumber(initialSettings.whatsapp_number || DEFAULT_SETTINGS.whatsapp_number);
    setWhatsappDisplay(initialSettings.whatsapp_display || DEFAULT_SETTINGS.whatsapp_display);
    setWhatsappPrefill(initialSettings.whatsapp_prefill_message || DEFAULT_SETTINGS.whatsapp_prefill_message);
    setEnquiryEmail(initialSettings.enquiry_email || DEFAULT_SETTINGS.enquiry_email);
    setSupportHours(initialSettings.support_hours || DEFAULT_SETTINGS.support_hours);
    setOfficeLocation(initialSettings.office_location || DEFAULT_SETTINGS.office_location);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Client-side validations
    const cleanDigits = whatsappNumber.replace(/\D/g, '');
    if (cleanDigits.length < 5) {
      setError('Please provide a valid WhatsApp number including country code (e.g. 60162128913).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(enquiryEmail.trim())) {
      setError('Please provide a valid enquiry email address.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<PlatformContactSettings> = {
        whatsapp_number: cleanDigits,
        whatsapp_display: whatsappDisplay.trim() || `+${cleanDigits}`,
        whatsapp_prefill_message: whatsappPrefill.trim(),
        enquiry_email: enquiryEmail.trim().toLowerCase(),
        support_hours: supportHours.trim(),
        office_location: officeLocation.trim(),
      };

      const res = await apiFetch('/api/developer/contact-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const updated: PlatformContactSettings = data.settings || payload;
        setSettings(updated);
        setInitialSettings(updated);
        setWhatsappNumber(updated.whatsapp_number);
        setWhatsappDisplay(updated.whatsapp_display);
        setWhatsappPrefill(updated.whatsapp_prefill_message);
        setEnquiryEmail(updated.enquiry_email);
        setSupportHours(updated.support_hours);
        setOfficeLocation(updated.office_location);
        setSuccessMsg('Platform contact settings updated and published live across all marketing surfaces!');
        setTimeout(() => setSuccessMsg(null), 6000);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to update contact settings');
      }
    } catch (err: any) {
      console.error('Update contact settings error:', err);
      setError(err.message || 'Network error updating contact settings');
    } finally {
      setSaving(false);
    }
  };

  // Precomputed live preview URLs
  const cleanPreviewDigits = whatsappNumber.replace(/\D/g, '') || '60162128913';
  const previewWhatsappUrl = `https://wa.me/${cleanPreviewDigits}?text=${encodeURIComponent(whatsappPrefill)}`;
  const previewMailtoUrl = `mailto:${enquiryEmail.trim() || 'contact@eventgamestudio.com'}?subject=${encodeURIComponent('Event Game Studio Inquiry')}`;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3 h-3" />
              Platform Configuration
            </span>
            {isDirty && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                Unsaved Changes
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <span>Contact & Enquiry Variables</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Configure the central WhatsApp click-to-chat line, prefilled message, official enquiry email, support hours, and office location. Changes take effect across the public website immediately.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fetchSettings()}
            disabled={loading || saving}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            title="Reload settings from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !isDirty}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              isDirty
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40 hover:scale-[1.02]'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-sm text-rose-300 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Error: </span>
            {error}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-sm text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Success: </span>
            {successMsg}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: WhatsApp Configuration */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 fill-[#25D366]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  WhatsApp Contact Configuration
                </h2>
                <p className="text-xs text-slate-400">
                  Controls the primary WhatsApp Click-to-Chat number, human-readable display, and prefilled message.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-center">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Direct Chat
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp Number (Raw Digits) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                WhatsApp Phone Number (Digits Only with Country Code)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="e.g. 60162128913"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 transition-colors"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Used in <code className="text-emerald-400">https://wa.me/&lt;number&gt;</code>. Include international country code (e.g. <strong className="text-slate-400">60</strong> for Malaysia, <strong className="text-slate-400">65</strong> for Singapore) without plus sign or dashes.
              </p>
            </div>

            {/* WhatsApp Display Label */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                WhatsApp Display Label (Formatted for Humans)
              </label>
              <input
                type="text"
                value={whatsappDisplay}
                onChange={(e) => setWhatsappDisplay(e.target.value)}
                placeholder="e.g. +60 16-212 8913"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-600 transition-colors"
                required
              />
              <p className="text-[11px] text-slate-500">
                The visual text shown to attendees and clients in the footer and contact page (e.g. <strong className="text-slate-400">+60 16-212 8913</strong>).
              </p>
            </div>

            {/* Prefilled Message */}
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Default Prefill WhatsApp Message
              </label>
              <textarea
                value={whatsappPrefill}
                onChange={(e) => setWhatsappPrefill(e.target.value)}
                rows={3}
                placeholder="e.g. Hello Event Game Studio! I'm interested in interactive game activations for an upcoming event..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3 text-sm text-white placeholder-slate-600 transition-colors leading-relaxed"
              />
              <p className="text-[11px] text-slate-500">
                Automatically populates in the attendee&apos;s WhatsApp composer when they click the chat button.
              </p>
            </div>
          </div>

          {/* WhatsApp Live Preview Box */}
          <div className="rounded-2xl p-4 bg-slate-950/80 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Live Preview & Validation
              </span>
              <a
                href={previewWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366]/30 border border-[#25D366]/40 text-[#25D366] text-xs font-bold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-[#25D366]" />
                <span>Test WhatsApp Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-xs font-mono text-slate-400 bg-slate-900 p-2.5 rounded-xl border border-slate-800 overflow-x-auto break-all">
              {previewWhatsappUrl}
            </div>
          </div>
        </div>

        {/* Section 2: Email & Office Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Enquiry Email & Operations Details
                </h2>
                <p className="text-xs text-slate-400">
                  Official correspondence email address, operating office region, and stated response commitments.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-center">
              <Globe className="w-3 h-3" />
              Regional Desk
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Enquiry Email */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Official Enquiry Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={enquiryEmail}
                  onChange={(e) => setEnquiryEmail(e.target.value)}
                  placeholder="contact@eventgamestudio.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 transition-colors"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Shown as the primary email contact on the public contact page and used for mailto links.
              </p>
            </div>

            {/* Office Location */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Office / Regional Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={officeLocation}
                  onChange={(e) => setOfficeLocation(e.target.value)}
                  placeholder="Kuala Lumpur, Malaysia (UTC+8)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 transition-colors"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Displayed in the footer and contact page office information block.
              </p>
            </div>

            {/* Support Hours */}
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Support Hours & Response Time Commitment
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={supportHours}
                  onChange={(e) => setSupportHours(e.target.value)}
                  placeholder="Mon – Sat, 9:00 AM – 7:00 PM (UTC+8) | <15 min reply during live events"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 transition-colors"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Shown to clients explaining operational coverage and expected response turnaround.
              </p>
            </div>
          </div>

          {/* Email Preview Link */}
          <div className="rounded-2xl p-4 bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Mailto Target: </span>
              <code className="text-amber-400 font-mono">{previewMailtoUrl}</code>
            </div>
            <a
              href={previewMailtoUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors shrink-0 ml-4"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Test Mailto Link</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Section 3: Surfaces Affected Summary */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Public Surface Impact</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Landing Page Footer
              </div>
              <p className="text-slate-400 leading-relaxed">
                Direct WhatsApp link and formatted display label dynamically mirror these variables.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Dedicated Contact Page
              </div>
              <p className="text-slate-400 leading-relaxed">
                VIP WhatsApp chat card, official enquiry email, support hours, and office address automatically sync.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Attendee Direct Enquiries
              </div>
              <p className="text-slate-400 leading-relaxed">
                Enquiries submitted via web form link directly to the operational contact and support desk.
              </p>
            </div>
          </div>

          {settings.updated_at && (
            <div className="pt-2 text-[11px] text-slate-500 text-right">
              Last updated:{' '}
              <span className="text-slate-400 font-mono">
                {new Date(settings.updated_at).toLocaleString('en-SG', {
                  timeZone: 'Asia/Singapore',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>{' '}
              (Asia/Singapore UTC+8)
            </div>
          )}
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-end gap-3 pt-4">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Discard Changes
            </button>
          )}

          <button
            type="submit"
            disabled={saving || !isDirty}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xl ${
              isDirty
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40 hover:scale-[1.02]'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Contact Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
