import React, { useState } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { useLocalization } from '../../context/LocalizationContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';
import { apiFetch } from '../../lib/api';
import { InternalLink } from '../common/InternalLink';
import {
  MessageSquare,
  Mail,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Building2,
  Users,
} from 'lucide-react';

export const ContactPage: React.FC = () => {
  const { t } = useLocalization();
  const pageSeo = getPageSeo('/contact');
  const { settings } = usePlatformContactSettings();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState('Event booking / activation');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Anti-bot honeypot
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage(t('contact.errNameMin', undefined, 'Full name must be at least 2 characters.'));
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage(t('contact.errEmailInvalid', undefined, 'Please enter a valid email address.'));
      return;
    }

    if (!message.trim() || message.trim().length < 10) {
      setErrorMessage(t('contact.errMessageMin', undefined, 'Message must be at least 10 characters.'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          company: company.trim(),
          category,
          message: message.trim(),
          website: website.trim(), // honeypot
          idempotencyKey,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t('contact.errSubmitFailed', undefined, 'Unable to submit enquiry.'));
      }

      setSubmitSuccess(true);
      setTicketId(data.ticketId || null);
    } catch (err: any) {
      setErrorMessage(err.message || t('contact.errSubmitFailed', undefined, 'Unable to submit enquiry.'));
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappClean = (settings.whatsapp_number || '601136783717').replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${whatsappClean}?text=${encodeURIComponent(
    settings.whatsapp_prefill_message || "Hello Event Game Studio! I'm interested in interactive game activations for an upcoming event."
  )}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO
        title={pageSeo.title}
        description={pageSeo.description}
        canonical={pageSeo.canonical}
        h1={pageSeo.h1}
        breadcrumbs={pageSeo.breadcrumbs}
      />

      <LandingHeader onOpenCatalog={() => {}} />

      <main className="flex-1 pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('contact.badge', undefined, 'Event Producer & Agency Support')}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-100 tracking-tight">
              {t('contact.heroTitle', undefined, "Let's Make Your Event Playable.")}
            </h1>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto">
              {t('contact.heroSubtitle', undefined, 'Connect with our event specialists about event setup, game customization, transparent pricing, large-scale deployments, or custom requirements.')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Direct WhatsApp & Info */}
            <div className="lg:col-span-5 space-y-6">
              {/* WhatsApp Card */}
              <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center text-emerald-400">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {t('contact.whatsappFastest', undefined, 'Fastest Response')}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-2">
                  {t('contact.whatsappCardTitle', undefined, 'Chat on WhatsApp')}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  {t('contact.whatsappCardDesc', undefined, 'Need a rapid quote, game recommendation, or emergency on-site kiosk assistance? Message our operations desk directly on WhatsApp.')}
                </p>

                <div className="space-y-3 mb-6 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>{t('contact.businessWhatsapp', undefined, 'Business WhatsApp:')}</span>
                    <span className="font-mono font-bold text-emerald-400">{settings.whatsapp_display}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>{t('contact.averageReplyTime', undefined, 'Average Reply Time:')}</span>
                    <span className="font-bold text-slate-200">{t('contact.fifteenMinutes', undefined, '~15 Minutes')}</span>
                  </div>
                </div>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{t('contact.startWhatsapp', undefined, 'Start WhatsApp Conversation')}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Operations Information */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  {t('contact.infoTitle', undefined, 'Contact Information')}
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="flex items-start gap-3 text-slate-300">
                    <Mail className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-200">{t('contact.emailEnquiries', undefined, 'Email Enquiries')}</p>
                      <a href={`mailto:${settings.enquiry_email}`} className="text-slate-400 hover:text-amber-400 transition-colors">
                        {settings.enquiry_email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-slate-300">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-200">{t('contact.supportHours', undefined, 'Support Hours')}</p>
                      <p className="text-slate-400 leading-relaxed">{settings.support_hours}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-slate-300">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-200">{t('contact.coverageRegion', undefined, 'Coverage Region')}</p>
                      <p className="text-slate-400 leading-relaxed">{settings.office_location}</p>
                    </div>
                  </div>
                </div>

                {/* Priority dispatch banner */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-xs text-amber-300/90 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-400">{t('contact.weekendLiveEventTitle', undefined, 'Running a live event?')} </span>
                    {t('contact.weekendLiveEventDesc', undefined, 'Active paid event organizers receive priority emergency WhatsApp dispatch coverage on setup and event days.')}
                  </div>
                </div>
              </div>

              {/* Quick links card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 text-xs">
                <h4 className="font-bold text-slate-200">{t('contact.quickHelpTitle', undefined, 'Looking for something else?')}</h4>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <InternalLink to="/#pricing" className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all block">
                    <p className="font-bold">{t('contact.linkPricing', undefined, 'Pricing & Calculator')}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t('contact.linkPricingDesc', undefined, 'Duration tiers')}</p>
                  </InternalLink>
                  <InternalLink to="/games" className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all block">
                    <p className="font-bold">{t('contact.linkGames', undefined, 'Game Catalog')}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t('contact.linkGamesDesc', undefined, 'Explore mini-games')}</p>
                  </InternalLink>
                  <InternalLink to="/#solutions" className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all block">
                    <p className="font-bold">{t('contact.linkSolutions', undefined, 'Event Solutions')}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t('contact.linkSolutionsDesc', undefined, 'Corporate & roadshows')}</p>
                  </InternalLink>
                  <InternalLink to="/events" className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-400 transition-all block">
                    <p className="font-bold">{t('contact.linkCreateEvent', undefined, 'Create an Event')}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t('contact.linkCreateEventDesc', undefined, 'Instant activation')}</p>
                  </InternalLink>
                </div>
              </div>
            </div>

            {/* Right Column: Contact Form */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative">
              <div className="mb-6 space-y-1">
                <h2 className="text-xl font-bold text-slate-100">
                  {t('contact.formTitle', undefined, 'Send an Enquiry')}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('contact.formSubtitle', undefined, "Fill in the details below and we'll prepare custom recommendations tailored to your event format and audience size.")}
                </p>
              </div>

              {submitSuccess ? (
                <div className="space-y-6 py-6">
                  <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
                    <div className="flex items-center gap-3 text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                      <h3 className="text-base font-bold text-emerald-300">
                        {t('contact.successTitle', undefined, 'Enquiry Received!')}
                      </h3>
                    </div>
                    <p className="text-xs text-emerald-300/90 leading-relaxed">
                      {t('contact.successDesc', { name: fullName }, `Thank you, ${fullName}. Our event specialists have received your message and will reply within 24 hours.`)}
                    </p>
                    {ticketId && (
                      <div className="pt-2 text-xs text-slate-400 flex items-center gap-2">
                        <span>{t('contact.reference', undefined, 'Reference:')}</span>
                        <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          {ticketId}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitSuccess(false);
                        setMessage('');
                        setTicketId(null);
                      }}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      {t('contact.submitAnother', undefined, 'Submit Another Message')}
                    </button>
                    <InternalLink
                      to="/games"
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all text-center"
                    >
                      {t('contact.exploreGames', undefined, 'Explore Event Games')}
                    </InternalLink>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span className="leading-relaxed">{errorMessage}</span>
                    </div>
                  )}

                  {/* Honeypot field for anti-spam bots */}
                  <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
                    <label htmlFor="contact_website">
                      <span>{t('contact.website', undefined, 'Website')}</span>
                    </label>
                    <input
                      id="contact_website"
                      type="text"
                      name="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  {/* Category Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {t('contact.categoryLabel', undefined, 'Enquiry Category')}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-all cursor-pointer"
                    >
                      <option value="Event booking / activation">{t('contact.typeSales', undefined, 'Event Game Licensing & Sales')}</option>
                      <option value="Custom Mini-Game Development">{t('contact.typeCustomGame', undefined, 'Custom Mini-Game Development')}</option>
                      <option value="Agency & Reseller Partnership">{t('contact.typePartnership', undefined, 'Agency & Reseller Partnership')}</option>
                      <option value="Technical Support">{t('contact.typeSupport', undefined, 'Technical Support')}</option>
                      <option value="General Inquiry">{t('contact.typeGeneral', undefined, 'General Inquiry')}</option>
                    </select>
                  </div>

                  {/* Two columns: Name and Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        {t('contact.fullName', undefined, 'Full Name')} <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={t('contact.namePlaceholder', undefined, 'e.g. Alex Tan')}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        {t('contact.workEmail', undefined, 'Work Email')} <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('contact.emailPlaceholder', undefined, 'you@company.com')}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                        required
                      />
                    </div>
                  </div>

                  {/* Two columns: Phone and Company */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        {t('contact.phone', undefined, 'Phone / WhatsApp Number')}
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder={t('contact.phonePlaceholder', undefined, '+60 12-345 6789')}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        {t('contact.company', undefined, 'Company / Event Agency')}
                      </label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder={t('contact.companyPlaceholder', undefined, 'e.g. Apex Events / Nexus Brand')}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {t('contact.message', undefined, 'Message & Requirements')} <span className="text-amber-400">*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('contact.messagePlaceholder', undefined, 'Tell us about your event format, dates, target audience size, or required game customization...')}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600 resize-y"
                      required
                    />
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {t('contact.privacyGuarantee', undefined, 'We respect your privacy. No spam. Fast 24-hour response guarantee.')}
                  </p>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>{t('contact.submitEnquiry', undefined, 'Submit Event Enquiry')}</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};
