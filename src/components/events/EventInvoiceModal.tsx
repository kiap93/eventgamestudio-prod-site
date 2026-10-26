import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  X,
  CheckCircle2,
  Clock,
  Building2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { downloadInvoicePdf } from '../../lib/invoiceDownload';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';

interface EventInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  onInvoiceUpdated?: (invoice: any) => void;
}

export const EventInvoiceModal: React.FC<EventInvoiceModalProps> = ({
  isOpen,
  onClose,
  event,
  onInvoiceUpdated,
}) => {
  const { currentUser } = useAuth();
  const { t } = useLocalization();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PDF Download State
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadPdfError, setDownloadPdfError] = useState<string | null>(null);

  // Eligibility & Developer Retry State
  const [eligible, setEligible] = useState<boolean>(false);
  const [eligibilityReason, setEligibilityReason] = useState<string>('');
  const [canRetry, setCanRetry] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrySuccess, setRetrySuccess] = useState<string | null>(null);

  const fetchInvoice = async () => {
    if (!event?.id) return;
    setLoading(true);
    setError(null);
    setRetryError(null);
    setRetrySuccess(null);
    setDownloadPdfError(null);
    try {
      const res = await apiFetch(`/api/events/${event.id}/invoice`);
      if (!res.ok) {
        throw new Error(`Failed to load event invoice (${res.status})`);
      }
      const data = await res.json();
      setEligible(Boolean(data.eligible));
      setEligibilityReason(data.eligibility_reason || '');
      setCanRetry(Boolean(data.can_retry || (currentUser?.is_developer && data.eligible && (!data.invoice || data.invoice?.pdf_status === 'failed'))));

      if (data.invoice) {
        setInvoice(data.invoice);
        // Fetch credit notes
        try {
          const cnRes = await apiFetch(`/api/invoices/${data.invoice.id}/credit-notes`);
          if (cnRes.ok) {
            const cnData = await cnRes.json();
            if (cnData.credit_notes) setCreditNotes(cnData.credit_notes);
          }
        } catch {}
      } else {
        setInvoice(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading event invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvoice();
    }
  }, [isOpen, event?.id]);

  const handleRetryInvoice = async () => {
    if (!event?.id || isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    setRetrySuccess(null);

    try {
      const res = await apiFetch(`/api/developer/events/${event.id}/retry-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || data.message || `Failed to retry invoice generation (${res.status})`;
        throw new Error(errorMsg);
      }

      if (data.invoice) {
        setInvoice(data.invoice);
        setRetrySuccess(data.message || (data.recovered ? 'Existing invoice recovered successfully.' : 'Invoice generated successfully.'));
        setCanRetry(Boolean(data.invoice.pdf_status === 'failed'));

        // Refresh credit notes if invoice recovered or created
        try {
          const cnRes = await apiFetch(`/api/invoices/${data.invoice.id}/credit-notes`);
          if (cnRes.ok) {
            const cnData = await cnRes.json();
            if (cnData.credit_notes) setCreditNotes(cnData.credit_notes);
          }
        } catch {}

        if (onInvoiceUpdated) {
          onInvoiceUpdated(data.invoice);
        }
      } else {
        throw new Error('Invoice data missing from retry response');
      }
    } catch (err: any) {
      setRetryError(err?.message || 'Failed to retry invoice generation');
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isOpen) return null;

  const formatCurrency = (amount: number, curr: string = 'MYR') => {
    return `${curr} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleDownloadPdf = async () => {
    if (!invoice?.id || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setDownloadPdfError(null);
    try {
      const result = await downloadInvoicePdf(invoice.id, invoice.invoice_number);
      if (!result.success) {
        setDownloadPdfError(result.error || 'Failed to download official invoice PDF');
      }
    } catch (err: any) {
      setDownloadPdfError(err?.message || 'Failed to download official invoice PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">{t('invoices.officialTaxInvoice', undefined, 'Official Tax Invoice')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Download Error Notification Banner */}
          {downloadPdfError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs space-y-2 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="font-bold">{t('invoices.pdfDownloadFailed', undefined, 'PDF Download Failed')}</span>
                </div>
                <button
                  onClick={() => setDownloadPdfError(null)}
                  className="text-rose-400 hover:text-rose-200 text-xs font-mono cursor-pointer"
                >
                  {t('common.dismiss', undefined, 'Dismiss')}
                </button>
              </div>
              <p className="text-rose-300 text-[11px] leading-relaxed pl-6">{downloadPdfError}</p>
            </div>
          )}

          {/* Retry Success Notification Banner */}
          {retrySuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="font-medium truncate">{retrySuccess}</span>
              </div>
              <button
                onClick={() => setRetrySuccess(null)}
                className="text-emerald-400 hover:text-emerald-200 text-xs font-mono shrink-0 cursor-pointer"
              >
                {t('common.dismiss', undefined, 'Dismiss')}
              </button>
            </div>
          )}

          {/* Retry Error Notification Banner */}
          {retryError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs space-y-2 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="font-bold">{t('invoices.retryFailed', undefined, 'Invoice Retry Failed')}</span>
                </div>
                <button
                  onClick={() => setRetryError(null)}
                  className="text-rose-400 hover:text-rose-200 text-xs font-mono cursor-pointer"
                >
                  {t('common.dismiss', undefined, 'Dismiss')}
                </button>
              </div>
              <p className="text-rose-300 text-[11px] leading-relaxed pl-6">{retryError}</p>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
              <p className="text-xs">{t('invoices.retrievingRecord', undefined, 'Retrieving authoritative invoice record...')}</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !invoice ? (
            <div className="py-8 text-center text-slate-400 space-y-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                canRetry
                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                  : 'bg-slate-800 border border-slate-700 text-slate-400'
              }`}>
                {canRetry ? <AlertTriangle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>

              {canRetry ? (
                <div className="space-y-3 max-w-md mx-auto">
                  <h4 className="text-sm font-bold text-amber-400">{t('invoices.missingOrIncomplete', undefined, 'Invoice Missing or Generation Incomplete')}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {t('invoices.missingOrIncompleteDesc', undefined, 'This event is completed and fully paid, but the authoritative tax invoice has not yet been finalized. As a Developer Admin, you can manually trigger canonical invoice generation now.')}
                  </p>
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-left space-y-1 text-[11px] text-slate-400 font-mono">
                    <div><span className="text-slate-500">{t('invoices.eventId', undefined, 'Event ID:')}</span> {event.id}</div>
                    <div><span className="text-slate-500">{t('event.paymentStatus', undefined, 'Payment Status:')}</span> {event.payment_status || 'PAID'}</div>
                    <div><span className="text-slate-500">{t('invoices.eligibility', undefined, 'Eligibility:')}</span> {eligibilityReason || 'Eligible for invoice generation'}</div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleRetryInvoice}
                      disabled={isRetrying}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                      <span>{isRetrying ? t('invoices.generatingInvoice', undefined, 'Generating Invoice...') : t('invoices.retryInvoiceGeneration', undefined, 'Retry Invoice Generation')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-200">{t('invoices.scheduledOnConclusion', undefined, 'Invoice Scheduled on Event Conclusion')}</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    {t('invoices.scheduledOnConclusionDesc', undefined, 'Official tax invoices are finalized automatically upon event completion according to your event dates and business timezone.')}
                  </p>
                  <div className="pt-2 text-[11px] text-slate-500 font-mono">
                    {t('invoices.scheduledEndDate', { date: event.end_date || '—' }, 'Scheduled End Date: {{date}}')}
                  </div>
                  {eligibilityReason && (
                    <div className="text-[11px] text-slate-500">
                      {t('invoices.reasonLabel', { reason: eligibilityReason }, 'Reason: {{reason}}')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* PDF Status Warning Banner if failed */}
              {invoice.pdf_status === 'failed' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{t('invoices.pdfNeedsRetryDesc', undefined, 'Durable PDF generation failed. The invoice record exists, but PDF rendering needs retry.')}</span>
                  </div>
                  {canRetry && (
                    <button
                      onClick={handleRetryInvoice}
                      disabled={isRetrying}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                      <span>{t('common.retry', undefined, 'Retry')}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Official White Paper Document Sheet */}
              <div className="bg-white text-slate-800 rounded-2xl p-6 sm:p-8 border border-[#CBD5E1] shadow-2xl space-y-6">
                {/* 1. Header Section — Company Details & Invoice Information */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#CBD5E1]">
                  {/* Left Side: Company Information */}
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#172B4D] tracking-tight">EVENTGAMESTUDIO</h2>
                    {invoice.seller_details?.company_name && invoice.seller_details.company_name !== 'EVENTGAMESTUDIO' && (
                      <div className="text-xs font-semibold text-[#334155]">{invoice.seller_details.company_name}</div>
                    )}
                    {invoice.seller_details?.registration_number && (
                      <div className="text-xs text-[#64748B] font-mono">{t('invoices.regNo', { regNo: invoice.seller_details.registration_number }, 'Reg No: {{regNo}}')}</div>
                    )}
                    {invoice.seller_details?.tax_number && (
                      <div className="text-xs text-[#64748B] font-mono">{t('invoices.taxId', { taxId: invoice.seller_details.tax_number }, 'Tax ID: {{taxId}}')}</div>
                    )}
                    {invoice.seller_details?.address && (
                      <div className="text-xs text-[#64748B] leading-relaxed max-w-sm">{invoice.seller_details.address}</div>
                    )}
                  </div>

                  {/* Right Side: Invoice Information */}
                  <div className="text-left sm:text-right space-y-1.5">
                    <h1 className="text-2xl font-black text-[#172B4D] tracking-tight">{t('invoices.invoiceTitle', undefined, 'INVOICE')}</h1>
                    <div className="text-xs text-[#64748B]">
                      <span>{t('invoices.invoiceNo', undefined, 'Invoice No.')} </span>
                      <span className="font-mono font-bold text-[#172B4D]">{invoice.invoice_number}</span>
                    </div>

                    {/* Dynamic Invoice Payment Status Badge */}
                    <div className="sm:flex sm:justify-end">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-md border ${
                        invoice.status === 'paid'
                          ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                          : invoice.status === 'partially_paid'
                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                          : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                      }`}>
                        {invoice.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Bill To and Invoice Dates Section */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start pb-5 border-b border-[#CBD5E1]">
                  {/* Left Side: Bill To in #F8FAFC Panel */}
                  <div className="sm:col-span-7 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">{t('invoices.billTo', undefined, 'BILL TO')}</span>
                    <div className="font-bold text-sm text-[#172B4D]">{invoice.customer_details?.organization_name || 'Customer Organization'}</div>
                    {invoice.customer_details?.contact_name && (
                      <div className="text-[#334155]">{t('invoices.attn', { name: invoice.customer_details.contact_name }, 'Attn: {{name}}')}</div>
                    )}
                    {invoice.customer_details?.contact_email && (
                      <div className="text-[#334155]">{invoice.customer_details.contact_email}</div>
                    )}
                    {invoice.customer_details?.country_code && (
                      <div className="text-[#334155]">{t('invoices.country', { code: invoice.customer_details.country_code }, 'Country: {{code}}')}</div>
                    )}
                    {invoice.customer_details?.billing_address && (
                      <div className="text-[#334155] leading-relaxed max-w-sm">{invoice.customer_details.billing_address}</div>
                    )}
                  </div>

                  {/* Right Side: Invoice Dates */}
                  <div className="sm:col-span-5 text-left sm:text-right space-y-3 pt-1">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">{t('invoices.issueDate', undefined, 'ISSUE DATE')}</span>
                      <span className="font-mono text-sm font-bold text-[#172B4D]">
                        {(invoice.issue_date || '').slice(0, 10) || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">{t('invoices.dueDate', undefined, 'DUE DATE')}</span>
                      <span className="font-mono text-sm font-bold text-[#172B4D]">
                        {(invoice.due_date || '').slice(0, 10) || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Description of Services */}
                <div className="space-y-3 pb-5 border-b border-[#CBD5E1]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">{t('invoices.descriptionOfServices', undefined, 'DESCRIPTION OF SERVICES')}</h3>

                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] font-bold uppercase text-[#172B4D]">
                          <th className="py-2.5 px-3.5 text-left">{t('invoices.serviceItem', undefined, 'Service / Item')}</th>
                          <th className="py-2.5 px-3.5 text-right w-16">{t('invoices.qty', undefined, 'Qty')}</th>
                          <th className="py-2.5 px-3.5 text-right w-28">{t('invoices.unitPrice', undefined, 'Unit Price')}</th>
                          <th className="py-2.5 px-3.5 text-right w-28">{t('invoices.amount', undefined, 'Amount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] bg-white">
                        {invoice.line_items?.map((item: any, i: number) => {
                          const isCredit = item.total_price < 0;
                          return (
                            <tr key={i}>
                              <td className="py-3 px-3.5 text-[#334155]">
                                <div className={`font-semibold ${isCredit ? 'text-[#166534]' : 'text-[#172B4D]'}`}>{item.description}</div>
                                {i === 0 && invoice.event_details?.event_name && (
                                  <div className="text-[11px] text-[#64748B] mt-0.5">
                                    {t('invoices.eventDetailsSubtext', { name: invoice.event_details.event_name, days: invoice.event_details.duration_days || 1 }, 'Event: "{{name}}" · Duration: {{days}} Day(s)')}
                                    {invoice.event_details.start_date && invoice.event_details.end_date && (
                                      <span> ({invoice.event_details.start_date} – {invoice.event_details.end_date})</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono text-[#334155]">{item.quantity || 1}</td>
                              <td className="py-3 px-3.5 text-right font-mono text-[#334155]">
                                {formatCurrency(item.unit_price, invoice.currency)}
                              </td>
                              <td className={`py-3 px-3.5 text-right font-mono tabular-nums ${
                                isCredit ? 'text-[#166534] font-bold' : 'text-[#172B4D] font-bold'
                              }`}>
                                {formatCurrency(item.total_price, invoice.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Invoice Totals and Payment Summary */}
                <div className="flex flex-col sm:flex-row sm:justify-end pb-5 border-b border-[#CBD5E1]">
                  <div className="w-full sm:w-80 space-y-2 text-xs">
                    {invoice.subtotal && invoice.subtotal !== invoice.total_amount && (
                      <div className="flex justify-between text-[#64748B]">
                        <span>{t('invoices.subtotal', undefined, 'Subtotal:')}</span>
                        <span className="font-mono tabular-nums text-[#334155]">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                      </div>
                    )}
                    {invoice.discount_amount > 0 && (
                      <div className="flex justify-between text-[#166534]">
                        <span>{t('invoices.appliedCreditsDiscount', undefined, 'Applied Credits / Discount:')}</span>
                        <span className="font-mono tabular-nums font-bold">-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
                      </div>
                    )}
                    {invoice.tax_amount > 0 && (
                      <div className="flex justify-between text-[#64748B]">
                        <span>{t('invoices.tax', { rate: (invoice.tax_rate * 100).toFixed(1) }, 'Tax ({{rate}}%):')}</span>
                        <span className="font-mono tabular-nums text-[#334155]">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                      </div>
                    )}

                    {/* Row 1: Total Amount */}
                    <div className="flex justify-between text-sm font-bold text-[#172B4D] pt-1">
                      <span>{t('invoices.totalAmount', undefined, 'Total Amount')}</span>
                      <span className="font-mono tabular-nums">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
                    </div>

                    {/* Row 2: Payments Received */}
                    <div className="flex justify-between text-xs text-[#64748B]">
                      <span>{t('invoices.paymentsReceived', undefined, 'Payments Received')}</span>
                      <span className="font-mono tabular-nums text-[#334155] font-semibold">{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
                    </div>

                    {/* Row 3: Balance Due */}
                    <div className="flex justify-between text-sm pt-1">
                      <span className="font-bold text-[#172B4D]">{t('invoices.balanceDue', undefined, 'Balance Due')}</span>
                      <span className={`font-mono tabular-nums font-bold ${
                        invoice.outstanding_balance <= 0 ? 'text-[#166534]' : 'text-[#92400E]'
                      }`}>
                        {formatCurrency(invoice.outstanding_balance, invoice.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Credit notes if any */}
                {creditNotes.length > 0 && (
                  <div className="space-y-2 pb-5 border-b border-[#CBD5E1]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">{t('invoices.creditNotes', undefined, 'Credit Notes')}</span>
                    {creditNotes.map((cn: any) => (
                      <div key={cn.id} className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] flex justify-between items-center text-xs">
                        <div>
                          <span className="font-mono font-bold text-[#92400E]">{cn.credit_note_number}</span>
                          <p className="text-[11px] text-[#64748B]">{cn.reason}</p>
                        </div>
                        <span className="font-mono tabular-nums text-[#991B1B] font-bold">
                          -{formatCurrency(cn.amount, cn.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 5. Footer — Exact Latest Format */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-start justify-between gap-4 text-xs">
                  {/* Left Footer Section */}
                  <div className="text-left space-y-1 text-[#64748B]">
                    <p>{t('invoices.paymentVerifiedSettled', undefined, 'Payment verified and settled via platform wallet.')}</p>
                    <p>{t('invoices.thankYouChoosing', undefined, 'Thank you for choosing EventGameStudio.')}</p>
                  </div>

                  {/* Right Footer Section */}
                  <div className="text-left sm:text-right space-y-1">
                    <p className="font-semibold text-[#172B4D]">{t('invoices.interactiveSolutions', undefined, 'Interactive Event Gaming Solutions')}</p>
                    <p className="text-[#64748B]">{t('invoices.websiteLabel', undefined, 'Website: eventgamestudio.com')}</p>
                    <p className="text-[#64748B]">{t('invoices.emailLabel', undefined, 'Email: eventgamestudio@gmail.com')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
            {invoice?.pdf_status === 'generated' ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('invoices.durablePdfReady', undefined, 'Durable PDF Ready')}
              </span>
            ) : invoice?.pdf_status === 'failed' ? (
              <span className="text-amber-400">{t('invoices.pdfRenderingIncomplete', undefined, 'PDF Rendering Incomplete')}</span>
            ) : canRetry ? (
              <span className="text-amber-400">{t('invoices.retryAvailable', undefined, 'Retry Available')}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {t('common.close', undefined, 'Close')}
            </button>

            {canRetry && (
              <button
                onClick={handleRetryInvoice}
                disabled={isRetrying}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                title={t('invoices.retryInvoiceTooltip', undefined, 'Retry canonical invoice generation for this event')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? t('invoices.retrying', undefined, 'Retrying...') : t('invoices.retryInvoice', undefined, 'Retry Invoice')}</span>
              </button>
            )}

            {invoice && invoice.pdf_status !== 'failed' && (
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
                title={t('invoices.downloadPdfTooltip', undefined, 'Download official PDF using authenticated session')}
              >
                {isDownloadingPdf ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('invoices.downloadingPdf', undefined, 'Downloading PDF...')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('invoices.downloadOfficialPdf', undefined, 'Download Official PDF')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
