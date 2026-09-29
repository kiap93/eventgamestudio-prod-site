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
} from 'lucide-react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { navigateTo } from '../../hooks/useRouteContext';
import { usePlatformContactSettings } from '../../hooks/usePlatformContactSettings';
import { apiFetch } from '../../lib/api';

type EnquiryCategory =
  | 'Event booking / activation'
  | 'Custom branding & game design'
  | 'Agency partnership'
  | 'General enquiry'
  | 'Technical support & kiosk setup'
  | 'Other';

const CATEGORIES: EnquiryCategory[] = [
  'Event booking / activation',
  'Custom branding & game design',
  'Agency partnership',
  'General enquiry',
  'Technical support & kiosk setup',
  'Other',
];

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  category: EnquiryCategory;
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

  // FAQ open states
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `egs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!form.fullName.trim()) {
      errs.fullName = 'Please enter your full name.';
    } else if (form.fullName.trim().length < 2) {
      errs.fullName = 'Full name must be at least 2 characters.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) {
      errs.email = 'Please provide your work email address.';
    } else if (!emailRegex.test(form.email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }

    if (!form.message.trim()) {
      errs.message = 'Please tell us a little about your event or inquiry.';
    } else if (form.message.trim().length < 10) {
      errs.message = 'Message must be at least 10 characters.';
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
      // Post to backend API
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
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `egs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-amber-100 selection:text-amber-900 flex flex-col justify-between">
      {/* Central SEO Head Configuration */}
      <SEO config={pageSeo} />

      {/* Universal White Navigation Header */}
      <LandingHeader />

      <main className="flex-1 pt-24 pb-20 md:pt-32 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb & Navigation */}
          <div className="mb-8 flex items-center gap-2 text-xs font-medium text-slate-500">
            <button
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1 hover:text-amber-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Contact & Enquiries</span>
          </div>

          {/* Header Hero Title */}
          <div className="max-w-3xl mb-14 md:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 uppercase tracking-widest mb-4">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Event Producer & Agency Support</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-4">
              Let&apos;s Make Your Next Event Playable.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Have questions about branded arcade games, custom stage leaderboards, or multi-day activation packages? Talk to our event specialists directly.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left Column: Direct WhatsApp Card + Fast Contact Info + Operating Hours */}
            <div className="lg:col-span-5 space-y-6">
              {/* WhatsApp VIP Card */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-white border border-emerald-200 shadow-lg shadow-emerald-500/5 relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                      <MessageCircle className="w-6 h-6 fill-white" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        Fastest Response
                      </div>
                      <h2 className="text-xl font-black text-slate-900">
                        Chat on WhatsApp
                      </h2>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100/80 text-emerald-800 text-[11px] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Support
                  </span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Need a rapid quote, game recommendation, or emergency on-site kiosk assistance? Message our operations desk directly on WhatsApp.
                </p>

                <div className="space-y-3 mb-6 bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-emerald-100 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Business WhatsApp:</span>
                    <span className="font-bold text-slate-900 font-mono">{whatsappDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Average Reply Time:</span>
                    <span className="font-semibold text-emerald-700">~15 Minutes</span>
                  </div>
                </div>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-6 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-md shadow-emerald-600/25 hover:shadow-emerald-600/40 transition-all flex items-center justify-center gap-2.5 group"
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>Start WhatsApp Conversation</span>
                </a>
              </motion.div>

              {/* Direct Email & Office Details Card */}
              <div className="rounded-3xl p-6 sm:p-8 bg-slate-50 border border-slate-200/80 space-y-6">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Contact Information
                </h2>

                <div className="space-y-4 text-sm">
                  {/* Email */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Email Enquiries</div>
                      <a
                        href={mailtoUrl}
                        className="text-sm font-bold text-slate-900 hover:text-amber-600 transition-colors"
                      >
                        {enquiryEmail}
                      </a>
                    </div>
                  </div>

                  {/* Hours */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Support Hours</div>
                      <div className="text-sm font-bold text-slate-900">
                        {supportHours}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Coverage Region</div>
                      <div className="text-sm font-bold text-slate-900">
                        {officeLocation}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Urgent Weekend Event Note */}
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-start gap-2.5 text-xs text-slate-600 bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Running a live weekend event?</strong> Active paid event organizers receive priority emergency WhatsApp dispatch coverage on setup and event days.
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick FAQ Accordion */}
              <div className="rounded-3xl p-6 bg-white border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <HelpCircle className="w-4 h-4 text-amber-500" />
                  <span>Frequently Asked Questions</span>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    {
                      q: 'How quickly can we launch a branded game?',
                      a: 'With pre-built system themes, you can configure your event title and generate an active event QR link in under 5 minutes. Custom branding takes less than 20 minutes.',
                    },
                    {
                      q: 'Do we need special hardware or coding?',
                      a: 'Zero coding required. Games run natively in any modern web browser across iPads, touchscreen totems, kiosks, and big LED screens.',
                    },
                    {
                      q: 'Can event agencies manage multiple clients?',
                      a: 'Yes! Event Game Studio supports multi-tenant agency workspaces where you can invite team members and produce simultaneous client activations.',
                    },
                  ].map((faq, index) => (
                    <div
                      key={index}
                      className="border border-slate-200 rounded-xl overflow-hidden transition-colors"
                    >
                      <button
                        onClick={() => setOpenFaq(openFaq === index ? null : index)}
                        className="w-full text-left p-3 font-semibold text-slate-800 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
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
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-10 sm:py-14 space-y-6"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-300">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                        Reference: {ticketId}
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        Enquiry Received!
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Thank you, <strong className="text-slate-900">{form.fullName}</strong>. Our event specialists have received your message and will reply within <strong>24 hours</strong>.
                      </p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-md mx-auto text-left text-xs space-y-2">
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                        Submission Summary
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Contact Email:</span>
                        <span className="font-semibold text-slate-800">{form.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Topic:</span>
                        <span className="font-semibold text-slate-800">{form.category}</span>
                      </div>
                      {form.eventDate && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Target Date:</span>
                          <span className="font-semibold text-slate-800">{form.eventDate}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        onClick={handleReset}
                        className="px-6 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Submit Another Message
                      </button>
                      <button
                        onClick={() => navigateTo('/')}
                        className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-sm"
                      >
                        Explore Event Games
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                        Send an Enquiry
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-600">
                        Fill in the details below and we&apos;ll prepare custom recommendations tailored to your event format and audience size.
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
                        Enquiry Category <span className="text-amber-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {CATEGORIES.map((cat) => (
                          <button
                            type="button"
                            key={cat}
                            onClick={() => setForm({ ...form, category: cat })}
                            className={`p-2.5 rounded-xl text-xs font-medium text-left border transition-all ${
                              form.category === cat
                                ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Full Name & Work Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Full Name <span className="text-amber-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={form.fullName}
                          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                          placeholder="e.g. Alex Tan"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                            errors.fullName ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300 focus:border-amber-500'
                          }`}
                        />
                        {errors.fullName && (
                          <p className="text-[11px] text-rose-600">{errors.fullName}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Work Email <span className="text-amber-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="alex@company.com"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
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
                          Phone / WhatsApp Number
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder="+60 12-345 6789"
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Company / Event Agency
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input
                            type="text"
                            value={form.company}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            placeholder="e.g. Apex Events / Nexus Brand"
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Optional Event Details (Date & Attendees) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Planned Event Date (Optional)
                        </label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <input
                            type="date"
                            value={form.eventDate}
                            onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Expected Audience Size
                        </label>
                        <div className="relative">
                          <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <select
                            value={form.expectedAttendees}
                            onChange={(e) => setForm({ ...form, expectedAttendees: e.target.value })}
                            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                          >
                            <option value="">Select attendance tier</option>
                            <option value="Under 100 guests">Under 100 guests (Private / VIP)</option>
                            <option value="100 - 500 guests">100 – 500 guests (Corporate Dinner / Summit)</option>
                            <option value="500 - 2,000 guests">500 – 2,000 guests (Conference / Festival)</option>
                            <option value="2,000+ guests">2,000+ guests (Multi-day Exhibition / Roadshow)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Message Box */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Message & Requirements <span className="text-amber-500">*</span>
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
                        placeholder="Tell us about your event theme, required game customization, kiosk setup, or any specific questions..."
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
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
                            <span>Sending Your Message...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Submit Event Enquiry</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>We respect your privacy. No spam. Fast 24-hour response guarantee.</span>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Universal Footer */}
      <LandingFooter />
    </div>
  );
};
