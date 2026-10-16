import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  Download,
  RefreshCw,
  Mail,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  PlusCircle,
  X,
  Send,
  Sliders,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { DeveloperInvoiceSettings } from './DeveloperInvoiceSettings';

export interface InvoiceItem {
  id: string;
  invoice_number: string;
  event_id: string;
  organization_id: string;
  customer_user_id: string | null;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'cancelled';
  currency: string;
  subtotal: number;
  discount_amount: number;
  welcome_credit_amount: number;
  showcase_credit_amount?: number;
  topup_credit_amount?: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  outstanding_balance: number;
  issue_date: string;
  due_date: string;
  seller_details: Record<string, any>;
  customer_details: Record<string, any>;
  event_details: Record<string, any>;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  pdf_path: string | null;
  pdf_status: 'pending' | 'generated' | 'failed';
  email_status: 'pending' | 'sent' | 'failed' | 'skipped';
  created_at: string;
}

export interface CreditNoteItem {
  id: string;
  credit_note_number: string;
  invoice_id: string;
  event_id: string;
  currency: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
}

export interface InvoiceAuditLog {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  details: Record<string, any>;
  created_at: string;
}

export const DeveloperInvoicesManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'settings'>('invoices');

  // List states
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal / Detail state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNoteItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<InvoiceAuditLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Actions states
  const [retryingPdf, setRetryingPdf] = useState<boolean>(false);
  const [retryingEmail, setRetryingEmail] = useState<boolean>(false);

  // Credit Note Modal
  const [showCreditNoteModal, setShowCreditNoteModal] = useState<boolean>(false);
  const [creditNoteAmount, setCreditNoteAmount] = useState<string>('');
  const [creditNoteReason, setCreditNoteReason] = useState<string>('');
  const [issuingCreditNote, setIssuingCreditNote] = useState<boolean>(false);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '25');
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await apiFetch(`/api/developer/invoices?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch invoices (${res.status})`);
      }
      const data = await res.json();
      if (data.data) {
        setInvoices(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices') {
      fetchInvoices();
    }
  }, [page, statusFilter, activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  };

  const handleOpenDetail = async (inv: InvoiceItem) => {
    setSelectedInvoice(inv);
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/developer/invoices/${inv.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.invoice) setSelectedInvoice(data.invoice);
        if (data.credit_notes) setCreditNotes(data.credit_notes);
        if (data.audit_logs) setAuditLogs(data.audit_logs);
      }
    } catch {
      // Keep basic selection
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDownloadPdf = (inv: InvoiceItem) => {
    window.open(`/api/invoices/${inv.id}/pdf`, '_blank');
  };

  const handleRetryPdf = async (inv: InvoiceItem) => {
    setRetryingPdf(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/invoices/${inv.id}/retry-pdf`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retry PDF generation');
      setSuccess(`PDF regenerated successfully for ${inv.invoice_number}`);
      if (data.invoice) setSelectedInvoice(data.invoice);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.message || 'Error regenerating PDF');
    } finally {
      setRetryingPdf(false);
    }
  };

  const handleRetryEmail = async (inv: InvoiceItem) => {
    setRetryingEmail(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/invoices/${inv.id}/retry-email`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch email');
      setSuccess(`Notification email dispatched successfully for ${inv.invoice_number}`);
      handleOpenDetail(inv);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.message || 'Error dispatching email');
    } finally {
      setRetryingEmail(false);
    }
  };

  const handleCreateCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const amt = parseFloat(creditNoteAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid positive credit note amount');
      return;
    }
    setIssuingCreditNote(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/invoices/${selectedInvoice.id}/credit-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, reason: creditNoteReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue credit note');
      setSuccess(`Credit note issued successfully: ${data.credit_note?.credit_note_number}`);
      setShowCreditNoteModal(false);
      setCreditNoteAmount('');
      setCreditNoteReason('');
      handleOpenDetail(selectedInvoice);
      fetchInvoices();
    } catch (err: any) {
      setError(err?.message || 'Error issuing credit note');
    } finally {
      setIssuingCreditNote(false);
    }
  };

  const formatCurrency = (amount: number, curr: string = 'MYR') => {
    return `${curr} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'partially_paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Partially Paid
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Unpaid
          </span>
        );
      case 'cancelled':
      case 'void':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-3 h-3" />
            {status.toUpperCase()}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-slate-800 text-slate-300 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Subnav */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            Tax Invoices & Billing Engine
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative billing snapshot records, sequential numbering, automated PDF vector generation, and seller compliance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'invoices'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>All Invoices ({totalCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Seller Settings</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'settings' ? (
        <DeveloperInvoiceSettings />
      ) : (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row gap-3 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by invoice number (INV-2026-...) or organization..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                Search
              </button>
            </form>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="cancelled">Cancelled</option>
                <option value="void">Void</option>
              </select>

              <button
                onClick={fetchInvoices}
                disabled={loading}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* High-density Invoices Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Organization / Event</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Discounts</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">PDF</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading && invoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                        <span>Loading platform invoices...</span>
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                        <span>No invoices found matching your filters.</span>
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => handleOpenDetail(inv)}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                          {inv.invoice_number}
                        </td>
                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="font-semibold text-slate-200 truncate">
                            {inv.customer_details?.organization_name || 'Customer Organization'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {inv.event_details?.event_name || inv.event_id}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          {(inv.issue_date || '').slice(0, 10)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                          {formatCurrency(inv.subtotal, inv.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right text-amber-400/90">
                          {inv.discount_amount > 0 ? `-${formatCurrency(inv.discount_amount, inv.currency)}` : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right font-bold text-white">
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right text-emerald-400">
                          {formatCurrency(inv.amount_paid, inv.currency)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {renderStatusBadge(inv.status)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                              inv.pdf_status === 'generated'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : inv.pdf_status === 'failed'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {inv.pdf_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDownloadPdf(inv)}
                              className="p-1 bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 rounded transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenDetail(inv)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                              title="Inspect Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing Page <span className="font-bold text-white">{page}</span> of{' '}
                <span className="font-bold text-white">{totalPages}</span> ({totalCount} total)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Drawer / Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-mono text-emerald-400">
                      {selectedInvoice.invoice_number}
                    </h2>
                    {renderStatusBadge(selectedInvoice.status)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Event: {selectedInvoice.event_details?.event_name || selectedInvoice.event_id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Ribbon */}
              <div className="flex items-center gap-2 flex-wrap bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <button
                  onClick={() => handleDownloadPdf(selectedInvoice)}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>

                <button
                  onClick={() => handleRetryPdf(selectedInvoice)}
                  disabled={retryingPdf}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingPdf ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{retryingPdf ? 'Regenerating...' : 'Regenerate PDF'}</span>
                </button>

                <button
                  onClick={() => handleRetryEmail(selectedInvoice)}
                  disabled={retryingEmail}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Mail className={`w-3.5 h-3.5 ${retryingEmail ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{retryingEmail ? 'Sending...' : 'Resend Email'}</span>
                </button>

                <button
                  onClick={() => setShowCreditNoteModal(true)}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Issue Credit Note</span>
                </button>
              </div>

              {/* Customer & Event Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Customer</span>
                  <div className="font-bold text-slate-200">
                    {selectedInvoice.customer_details?.organization_name || 'Organization'}
                  </div>
                  <div className="text-slate-400">{selectedInvoice.customer_details?.contact_email}</div>
                  <div className="text-slate-500">Country: {selectedInvoice.customer_details?.country_code || 'MY'}</div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Dates & Terms</span>
                  <div className="text-slate-300">
                    Issue Date: <span className="font-mono tabular-nums text-white">{(selectedInvoice.issue_date || '').slice(0, 10)}</span>
                  </div>
                  <div className="text-slate-300">
                    Due Date: <span className="font-mono tabular-nums text-white">{(selectedInvoice.due_date || '').slice(0, 10)}</span>
                  </div>
                  <div className="text-slate-500">
                    Duration: {selectedInvoice.event_details?.duration_days || 1} Days
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Itemized Breakdown</h3>
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-slate-500 text-[10px] uppercase">
                        <th className="py-2 px-3 text-left">Description</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {selectedInvoice.line_items?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 text-slate-300">
                            {item.description}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                            item.total_price < 0 ? 'text-amber-400 font-bold' : 'text-slate-200 font-semibold'
                          }`}>
                            {formatCurrency(item.total_price, selectedInvoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono tabular-nums text-slate-200">{formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Applied Discounts & Promotional Credits:</span>
                    <span className="font-mono tabular-nums font-bold">-{formatCurrency(selectedInvoice.discount_amount, selectedInvoice.currency)}</span>
                  </div>
                )}
                {selectedInvoice.tax_amount > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Service Tax ({(selectedInvoice.tax_rate * 100).toFixed(1)}%):</span>
                    <span className="font-mono tabular-nums text-slate-200">{formatCurrency(selectedInvoice.tax_amount, selectedInvoice.currency)}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-white">
                  <span>Total Amount:</span>
                  <span className="font-mono tabular-nums text-emerald-400">{formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>Reconciled Payments Received:</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">{formatCurrency(selectedInvoice.amount_paid, selectedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-xs">
                  <span>Outstanding Balance:</span>
                  <span className={`font-mono tabular-nums font-bold ${selectedInvoice.outstanding_balance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {formatCurrency(selectedInvoice.outstanding_balance, selectedInvoice.currency)}
                  </span>
                </div>
              </div>

              {/* Credit Notes Section */}
              {creditNotes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Issued Credit Notes</h3>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-2">
                    {creditNotes.map((cn) => (
                      <div key={cn.id} className="flex justify-between items-center text-xs border-b border-slate-800/60 pb-2 last:border-0 last:pb-0">
                        <div>
                          <span className="font-mono font-bold text-amber-400">{cn.credit_note_number}</span>
                          <p className="text-slate-400 text-[11px]">{cn.reason}</p>
                        </div>
                        <div className="font-mono tabular-nums text-right font-bold text-rose-400">
                          -{formatCurrency(cn.amount, cn.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Logs */}
              {auditLogs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Trail History</h3>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-48 overflow-y-auto space-y-2 text-[11px]">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="border-b border-slate-800/50 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex justify-between text-slate-300">
                          <span className="font-mono font-semibold text-emerald-400">{log.action}</span>
                          <span className="text-slate-500">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        {log.actor_email && <div className="text-slate-500">By: {log.actor_email}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Close footer */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Note Issuance Modal */}
      {showCreditNoteModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                Issue Audited Credit Note
              </h3>
              <button
                onClick={() => setShowCreditNoteModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Issuing a credit note creates a permanent sequential credit document (CN-YYYY-NNNNN) linked to{' '}
              <span className="font-mono font-bold text-emerald-400">{selectedInvoice.invoice_number}</span>.
            </p>

            <form onSubmit={handleCreateCreditNote} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Credit Note Amount ({selectedInvoice.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedInvoice.total_amount}
                  required
                  value={creditNoteAmount}
                  onChange={(e) => setCreditNoteAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Maximum allowable: {formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audit Reason / Justification
                </label>
                <textarea
                  rows={2}
                  required
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  placeholder="e.g. Approved weather contingency refund or event duration modification credit"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreditNoteModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={issuingCreditNote}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {issuingCreditNote ? 'Issuing...' : 'Confirm & Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
