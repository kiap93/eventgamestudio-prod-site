import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  X,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Calendar,
  Building2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface EventInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
}

export const EventInvoiceModal: React.FC<EventInvoiceModalProps> = ({
  isOpen,
  onClose,
  event,
}) => {
  const [invoice, setInvoice] = useState<any | null>(null);
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = async () => {
    if (!event?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/events/${event.id}/invoice`);
      if (!res.ok) {
        throw new Error(`Failed to load event invoice (${res.status})`);
      }
      const data = await res.json();
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

  if (!isOpen) return null;

  const formatCurrency = (amount: number, curr: string = 'MYR') => {
    return `${curr} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleDownloadPdf = () => {
    if (!invoice?.id) return;
    window.open(`/api/invoices/${invoice.id}/pdf`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Official Tax Invoice</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
              <p className="text-xs">Retrieving authoritative invoice record...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !invoice ? (
            <div className="py-10 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-200">Invoice Scheduled on Event Conclusion</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Official tax invoices are finalized automatically upon event completion according to your event dates and business timezone.
              </p>
              <div className="pt-2 text-[11px] text-slate-500 font-mono">
                Scheduled End Date: {event.end_date || '—'}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Invoice Meta Bar */}
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Invoice Number</span>
                  <div className="font-mono text-sm font-bold text-emerald-400">{invoice.invoice_number}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Issue Date</span>
                  <div className="font-mono text-xs text-slate-300">{(invoice.issue_date || '').slice(0, 10)}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Status</span>
                  <div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      invoice.status === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : invoice.status === 'partially_paid'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {invoice.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                      {invoice.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seller & Customer Snapshot */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Issued By</span>
                  <div className="font-bold text-slate-200">{invoice.seller_details?.company_name}</div>
                  {invoice.seller_details?.registration_number && (
                    <div className="text-slate-400 font-mono text-[11px]">{invoice.seller_details.registration_number}</div>
                  )}
                  {invoice.seller_details?.tax_number && (
                    <div className="text-slate-500 font-mono text-[11px]">Tax ID: {invoice.seller_details.tax_number}</div>
                  )}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Billed To</span>
                  <div className="font-bold text-slate-200">{invoice.customer_details?.organization_name}</div>
                  <div className="text-slate-400 truncate">{invoice.customer_details?.contact_email}</div>
                  <div className="text-slate-500">Country: {invoice.customer_details?.country_code || 'MY'}</div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                      <th className="py-2 px-3 text-left">Description</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {invoice.line_items?.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-slate-300">{item.description}</td>
                        <td className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                          item.total_price < 0 ? 'text-amber-400 font-bold' : 'text-slate-200 font-semibold'
                        }`}>
                          {formatCurrency(item.total_price, invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Breakdown */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono tabular-nums text-slate-200">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.discount_amount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Applied Credits & Promotional Bonus:</span>
                    <span className="font-mono tabular-nums font-bold">-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
                  </div>
                )}
                {invoice.tax_amount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Tax ({(invoice.tax_rate * 100).toFixed(1)}%):</span>
                    <span className="font-mono tabular-nums text-slate-200">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-white">
                  <span>Total Amount:</span>
                  <span className="font-mono tabular-nums text-emerald-400">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>Amount Paid:</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>Outstanding Balance:</span>
                  <span className={`font-mono tabular-nums font-bold ${invoice.outstanding_balance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {formatCurrency(invoice.outstanding_balance, invoice.currency)}
                  </span>
                </div>
              </div>

              {/* Credit notes if any */}
              {creditNotes.length > 0 && (
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Credit Notes</span>
                  {creditNotes.map((cn: any) => (
                    <div key={cn.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="font-mono font-bold text-amber-400">{cn.credit_note_number}</span>
                        <p className="text-[11px] text-slate-400">{cn.reason}</p>
                      </div>
                      <span className="font-mono tabular-nums text-rose-400 font-bold">
                        -{formatCurrency(cn.amount, cn.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            {invoice?.pdf_status === 'generated' ? 'Durable PDF Ready' : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            {invoice && (
              <button
                onClick={handleDownloadPdf}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
