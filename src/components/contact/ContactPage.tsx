import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import {
  MessageCircle,
  Mail,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Calendar,
  Users,
  Building2,
  Phone,
  HelpCircle,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  Layers,
  Gamepad2,
  Tag,
  Wrench,
  Sliders,
  Radio,
  FileQuestion,
} from 'lucide-react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { navigateTo } from '../../hooks/useRouteContext';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';
import { apiFetch } from '../../lib/api';
import { InternalLink } from '../common/InternalLink';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  category: string;
  eventDate: string;
  expectedAttendees: string;
  message: string;
}

const INITIAL_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  category: 'Event booking / activation',
  eventDate: '',
  expectedAttendees: '',
  message: '',
};

interface FormErrors {
  fullName?: string;
  email?: string;
  message?: string;
}

export const ContactPage: React.FC = () => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();
  const {
    whatsappDisplay,
    whatsappUrl,
    enquiryEmail,
    mailtoUrl,
    supportHours,
    officeLocation,
  } = usePlatformContactSettings();

  const pageSeo = getPageSeo('/contact');

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ticketId, setTicketId] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // FAQ accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `egs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const categories = [
    { id: 'Event booking / activation', label: t('contact.typeSales') },
    { id: 'Custom branding & game design', label: t('contact.typeCustomGame') },
    { id: 'Agency partnership', label: t('contact.typePartnership') },
    { id: 'Technical support & kiosk setup', label: t('contact.typeSupport') },
    { id: 'General enquiry', label: t('contact.typeGeneral') },
  ];

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!form.fullName.trim()) {
      errs.fullName = t('contact.errNameRequired');
    } else if (form.fullName.trim().length < 2) {
      errs.fullName = t('contact.errNameMin');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) {
      errs.email = t('contact.errEmailRequired');
    } else if (!emailRegex.test(form.email.trim())) {
      errs.email = t('contact.errEmailInvalid');
    }

    if (!form.message.trim()) {
      errs.message = t('contact.errMessageRequired');
    } else if (form.message.trim().length < 10) {
      errs.message = t('contact.errMessageMin');
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data?.ticketId) {
        setTicketId(data.ticketId);
        setIsSuccess(true);
        setSubmitError(null);
      } else {
        const errorMessage =
          data?.error ||
          data?.message ||
          (res.status === 429
            ? 'Too many enquiry submissions from this connection. Please wait a few minutes before submitting again.'
            : 'Unable to submit your enquiry at this time. Please try again or reach out to us directly via WhatsApp.');
        setSubmitError(errorMessage);
        setIsSuccess(false);
        setTicketId('');
      }
    } catch (networkErr: any) {
      setSubmitError(
        'Network connection error. We could not reach the server. Please check your internet connection or contact us via WhatsApp.'
      );
      setIsSuccess(false);
      setTicketId('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setErrors({});
    setIsSuccess(false);
    setTicketId('');
    setSubmitError(null);
    idempotencyKeyRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `egs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login?redirect=/events');
    }
  };

  const faqItems = [
    { q: t('contact.faq1Q'), a: t('contact.faq1A') },
    { q: t('contact.faq2Q'), a: t('contact.faq2A') },
    { q: t('contact.faq3Q'), a: t('contact.faq3A') },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-amber-100 selection:text-amber-900 flex flex-col justify-between">
      {/* Central SEO Head Configuration */}
      <SEO config={pageSeo} />

      {/* Universal White Navigation Header */}
      <LandingHeader />

      <main className="flex-1 pt-12 pb-20 md:pt-16 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 md:space-y-16">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <button
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1 hover:text-amber-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('common.backToHome')}</span>
            </button>
            <span>/</span>
            <span className="text-slate-900 font-semibold">{t('nav.contact')}</span>
          </div>

          {/* Hero Section */}
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('contact.badge')}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              {t('contact.heroTitle')}
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              {t('contact.heroSubtitle')}
            </p>

            {/* Topic Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('contact.topicSetup')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                <Sliders className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('contact.topicCustomization')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                <Tag className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('contact.topicPricing')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                <Radio className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('contact.topicDeployments')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{t('contact.topicCustomRequirements')}</span>
              </span>
            </div>
          </div>

          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: Direct WhatsApp + Contact Info + Live Event CTA */}
            <div className="lg:col-span-5 space-y-6">
              {/* Option A: WhatsApp VIP Card */}
              {whatsappUrl && (
                <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-white border border-emerald-200 shadow-md shadow-emerald-500/5 relative overflow-hidden">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                        <MessageCircle className="w-6 h-6 fill-white" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          {t('contact.whatsappFastest')}
                        </div>
                        <h2 className="text-xl font-black text-slate-900">
                          {t('contact.whatsappCardTitle')}
                        </h2>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {t('contact.whatsappLiveSupport')}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {t('contact.whatsappCardDesc')}
                  </p>

                  <div className="space-y-2.5 mb-6 bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-emerald-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{t('contact.businessWhatsapp')}</span>
                      <span className="font-bold text-slate-900 font-mono">{whatsappDisplay}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{t('contact.averageReplyTime')}</span>
                      <span className="font-semibold text-emerald-700">{t('contact.fifteenMinutes')}</span>
                    </div>
                  </div>

                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-6 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-md shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all flex items-center justify-center gap-2.5 group cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>{t('contact.startWhatsapp')}</span>
                  </a>
                </div>
              )}

              {/* Option B: Direct Email & Support Hours */}
              <div className="rounded-3xl p-6 sm:p-8 bg-slate-50 border border-slate-200/80 space-y-6">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  {t('contact.infoTitle')}
                </h2>

                <div className="space-y-4 text-sm">
                  {/* Email */}
                  {enquiryEmail && (
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">{t('contact.emailEnquiries')}</div>
                        <a
                          href={mailtoUrl}
                          className="text-sm font-bold text-slate-900 hover:text-amber-600 transition-colors"
                        >
                          {enquiryEmail}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Hours */}
                  {supportHours && (
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">{t('contact.supportHours')}</div>
                        <div className="text-sm font-bold text-slate-900">
                          {supportHours}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location */}
                  {officeLocation && (
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">{t('contact.coverageRegion')}</div>
                        <div className="text-sm font-bold text-slate-900">
                          {officeLocation}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Priority Note */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-start gap-2.5 text-xs text-slate-600 bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/70">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('contact.weekendLiveEventTitle')}</strong> {t('contact.weekendLiveEventDesc')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Option C: Instant Event / Sales Action Card */}
              <div className="rounded-3xl p-6 sm:p-8 bg-slate-900 text-white space-y-4">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4" />
                  <span>24/7 Self-Serve Access</span>
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {t('contact.createEventCtaTitle')}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('contact.createEventCtaDesc')}
                </p>
                <button
                  onClick={handleCreateEvent}
                  className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <span>{t('contact.createEventBtn')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* FAQ Accordion in Sidebar */}
              <div className="rounded-3xl p-6 bg-white border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <HelpCircle className="w-4 h-4 text-amber-500" />
                  <span>{t('contact.linkFaq')}</span>
                </div>

                <div className="space-y-2 text-xs">
                  {faqItems.map((faq, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-xl overflow-hidden transition-colors"
                    >
                      <button
                        onClick={() => setOpenFaq(openFaq === index ? null : index)}
                        className="w-full text-left p-3 font-semibold text-slate-800 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span>{faq.q}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            openFaq === index ? 'rotate-180 text-amber-600' : ''
                          }`}
                        />
                      </button>
                      {openFaq === index && (
                        <div className="px-3 pb-3 text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Enquiry Form */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-10 shadow-sm relative">
                {isSuccess ? (
                  <div className="text-center py-10 sm:py-14 space-y-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-300">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                        {t('contact.reference')} {ticketId}
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        {t('contact.successTitle')}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {t('contact.successDesc', { name: form.fullName })}
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-md mx-auto text-left text-xs space-y-2">
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                        {t('contact.submissionSummary')}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{t('contact.contactEmailLabel')}</span>
                        <span className="font-semibold text-slate-800">{form.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">{t('contact.topicLabel')}</span>
                        <span className="font-semibold text-slate-800">{form.category}</span>
                      </div>
                      {form.eventDate && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">{t('contact.targetDateLabel')}</span>
                          <span className="font-semibold text-slate-800">{form.eventDate}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        onClick={handleReset}
                        className="px-6 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {t('contact.submitAnother')}
                      </button>
                      <button
                        onClick={() => navigateTo('/')}
                        className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-sm"
                      >
                        {t('contact.exploreGames')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                        {t('contact.formTitle')}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-600">
                        {t('contact.formSubtitle')}
                      </p>
                    </div>

                    {submitError && (
                      <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    {/* Category Selection Chips */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        {t('contact.categoryLabel')} <span className="text-amber-500">*</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {categories.map((cat) => (
                          <button
                            type="button"
                            key={cat.id}
                            onClick={() => setForm({ ...form, category: cat.id })}
                            className={`p-2.5 rounded-xl text-xs font-medium text-left border transition-all cursor-pointer ${
                              form.category === cat.id
                                ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Full Name & Work Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.fullName')} <span className="text-amber-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={form.fullName}
                          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                          placeholder={t('contact.namePlaceholder')}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 ${
                            errors.fullName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300 focus:border-amber-500'
                          }`}
                        />
                        {errors.fullName && (
                          <p className="text-[11px] text-rose-600">{errors.fullName}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.workEmail')} <span className="text-amber-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder={t('contact.emailPlaceholder')}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 ${
                            errors.email ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300 focus:border-amber-500'
                          }`}
                        />
                        {errors.email && (
                          <p className="text-[11px] text-rose-600">{errors.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Phone & Company Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.phone')}
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder={t('contact.phonePlaceholder')}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.company')}
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input
                            type="text"
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            placeholder={t('contact.companyPlaceholder')}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Optional Event Details (Date & Attendees) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.eventDate')}
                        </label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                          <input
                            type="date"
                            value={form.eventDate}
                            onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.audienceSize')}
                        </label>
                        <div className="relative">
                          <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                          <select
                            value={form.expectedAttendees}
                            onChange={(e) => setForm({ ...form, expectedAttendees: e.target.value })}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                          >
                            <option value="">{t('contact.selectAudienceTier')}</option>
                            <option value="Under 100 guests">{t('contact.tierUnder100')}</option>
                            <option value="100 - 500 guests">{t('contact.tier100to500')}</option>
                            <option value="500 - 2,000 guests">{t('contact.tier500to2000')}</option>
                            <option value="2,000+ guests">{t('contact.tier2000Plus')}</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Message Box */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          {t('contact.message')} <span className="text-amber-500">*</span>
                        </label>
                        <span className="text-[11px] text-slate-400">
                          {form.message.length}/500
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        maxLength={500}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder={t('contact.messagePlaceholder')}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 ${
                          errors.message ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300 focus:border-amber-500'
                        }`}
                      />
                      {errors.message && (
                        <p className="text-[11px] text-rose-600">{errors.message}</p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>{t('contact.sendingEnquiry')}</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>{t('contact.submitEnquiry')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{t('contact.privacyGuarantee')}</span>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: "Looking for something else?" Quick Help Cards */}
          <div className="pt-10 border-t border-slate-200/80 space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {t('contact.quickHelpTitle')}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                {t('contact.quickHelpSubtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pricing */}
              <InternalLink
                to="/#pricing"
                className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-amber-300 hover:bg-amber-50/40 transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Tag className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                    {t('contact.linkPricing')}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('contact.linkPricingDesc')}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-amber-700">
                  <span>{t('nav.pricing')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </InternalLink>

              {/* Games */}
              <InternalLink
                to="/game-showcase"
                className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-amber-300 hover:bg-amber-50/40 transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Gamepad2 className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                    {t('contact.linkGames')}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('contact.linkGamesDesc')}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-amber-700">
                  <span>{t('landing.viewFullCatalog')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </InternalLink>

              {/* Solutions */}
              <InternalLink
                to="/interactive-event-games"
                className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-amber-300 hover:bg-amber-50/40 transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                    {t('contact.linkSolutions')}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {t('contact.linkSolutionsDesc')}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1 text-xs font-bold text-slate-700 group-hover:text-amber-700">
                  <span>{t('landing.navSolutions')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </InternalLink>

              {/* Create Event */}
              <button
                onClick={handleCreateEvent}
                className="p-5 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition-all flex flex-col justify-between text-left group cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                    {t('contact.linkCreateEvent')}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t('contact.linkCreateEventDesc')}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-1 text-xs font-bold text-amber-400">
                  <span>{t('landing.createYourEvent')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Universal Footer */}
      <LandingFooter />
    </div>
  );
};
