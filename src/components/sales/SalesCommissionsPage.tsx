import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { SalesNavbar } from './SalesNavbar';
import { SEO } from '../common/SEO';
import {
  SalesCommission,
  PartnerCommissionSummary,
  SalesOpportunity,
  CustomerAttribution,
} from '../../types/sales';
import {
  Coins,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  TrendingUp,
  FileText,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Building2,
  Layers,
  ArrowRight,
  Info,
  X,
  BadgeAlert,
} from 'lucide-react';

export const SalesCommissionsPage: React.FC = () => {
  const { currentUser, isSalesPartner, isLoading, isAuthenticated } = useAuth();
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [summary, setSummary] = useState<PartnerCommissionSummary | null>(null);
  const [attributionWindows, setAttributionWindows] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New Opportunity Modal State
  const [showOpportunityModal, setShowOpportunityModal] = useState<boolean>(false);
  const [submittingOpportunity, setSubmittingOpportunity] = useState<boolean>(false);
  const [opportunityForm, setOpportunityForm] = useState({
    organizationId: '',
    title: '',
    description: '',
    expectedEventDate: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [commRes, oppRes, attrRes] = await Promise.all([
        apiFetch('/api/sales/commissions'),
        apiFetch('/api/sales/opportunities'),
        apiFetch('/api/sales/attribution-summary'),
      ]);

      if (!commRes.ok) throw new Error('Failed to load commission ledger');
      const commData = await commRes.json();
      setCommissions(commData.commissions || []);
      setSummary(commData.summary || null);

      if (oppRes.ok) {
        const oppData = await oppRes.json();
        setOpportunities(oppData.opportunities || []);
      }

      if (attrRes.ok) {
        const attrData = await attrRes.json();
        setAttributionWindows(attrData.summary || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading commissions data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isSalesPartner) {
      if (!isLoading && (!isAuthenticated || !isSalesPartner)) {
        setLoading(false);
      }
      return;
    }
    fetchData();
  }, [isLoading, isAuthenticated, isSalesPartner]);

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunityForm.organizationId || !opportunityForm.title.trim()) {
      alert('Please select an organization and enter a title');
      return;
    }

    try {
      setSubmittingOpportunity(true);
      const res = await apiFetch('/api/sales/opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(opportunityForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit sales opportunity request');
      }

      setShowOpportunityModal(false);
      setOpportunityForm({
        organizationId: '',
        title: '',
        description: '',
        expectedEventDate: '',
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingOpportunity(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Paid Out
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <CheckCircle2 className="w-3 h-3" /> Ready for Payout
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
      case 'clawback':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" /> Clawback (Refunded)
          </span>
        );
      case 'voided':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <AlertCircle className="w-3 h-3" /> Voided
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getOrderTypeBadge = (orderType: string) => {
    switch (orderType) {
      case 'first_order':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            1st Order (10%)
          </span>
        );
      case 'repeat_order':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Repeat (5%)
          </span>
        );
      case 'approved_opportunity':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Pre-Approved Opportunity (5%)
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{orderType}</span>;
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO robots="noindex, follow" title="Commissions & Payouts | Sales Partner Portal" />
      <SalesNavbar activeSection="commissions" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Authoritative Financial Ledger</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Commissions & Payouts</h1>
            <p className="text-sm text-slate-400">
              Track earned commissions, 12-month repeat windows, and request post-window sales opportunities.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
            <button
              onClick={() => setShowOpportunityModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-amber-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>Request Opportunity</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Performance Metrics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Earned */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Earned</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              RM{(summary?.total_earned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              Includes paid out and ready commissions
            </div>
          </div>

          {/* Card 2: Ready for Payout */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Ready for Payout</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 tracking-tight">
              RM{(summary?.ready_for_payout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              Approved after event completion
            </div>
          </div>

          {/* Card 3: Pending Review */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Pending Review</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-blue-400 tracking-tight">
              RM{(summary?.pending_review || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              Becomes payable upon event completion
            </div>
          </div>

          {/* Card 4: Total Paid Out */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Paid Out</span>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              RM{(summary?.total_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              Successfully disbursed via bank batches
            </div>
          </div>
        </div>

        {/* 2. 12-Month Customer Attribution Tracker */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                <span>12-Month Repeat Commission Windows</span>
              </h2>
              <p className="text-xs text-slate-400">
                You earn 5% repeat commissions on orders placed within 12 months of a customer's first qualifying order.
              </p>
            </div>
          </div>

          {attributionWindows.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-2">
              <Info className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No active attribution windows</div>
              <div className="text-xs text-slate-500 max-w-md mx-auto">
                Attribution windows begin automatically once an attributed customer places their first paid qualifying event order.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attributionWindows.map((win) => (
                <div
                  key={win.organization_id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>{win.organization_name}</span>
                    </div>
                    {win.is_window_expired ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        Window Expired
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {win.days_remaining} Days Left
                      </span>
                    )}
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-400">
                    <div className="flex justify-between">
                      <span>First Order:</span>
                      <span className="text-slate-200">
                        {win.first_qualifying_date ? new Date(win.first_qualifying_date).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Window Deadline:</span>
                      <span className="text-slate-200">
                        {win.window_end_date ? new Date(win.window_end_date).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Commissions Earned:</span>
                      <span className="text-amber-400 font-bold">
                        RM{win.total_commissions_earned.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {win.is_window_expired && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-500">
                        {win.active_opportunity_exists ? 'Opportunity pre-approved' : 'Requires opportunity request'}
                      </span>
                      {!win.active_opportunity_exists && (
                        <button
                          onClick={() => {
                            setOpportunityForm((prev) => ({ ...prev, organizationId: win.organization_id }));
                            setShowOpportunityModal(true);
                          }}
                          className="text-amber-400 hover:text-amber-300 font-bold cursor-pointer text-xs flex items-center gap-1"
                        >
                          <span>Request</span>
                          <span>→</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Authoritative Commission Ledger */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Commission Ledger</span>
              </h2>
              <p className="text-xs text-slate-400">
                Detailed transaction records with cash revenue basis and calculated commission.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {commissions.length} {commissions.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {commissions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Coins className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No commissions recorded yet</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Once your referred clients purchase event packages with cash, your commissions will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="px-4 py-3.5">Client & Event</th>
                    <th className="px-4 py-3.5">Order Type</th>
                    <th className="px-4 py-3.5 text-right">Cash Revenue</th>
                    <th className="px-4 py-3.5 text-right">Rate</th>
                    <th className="px-4 py-3.5 text-right">Commission</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5">Eligibility Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-normal">
                  {commissions.map((comm) => (
                    <tr key={comm.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">
                          {comm.event?.name || `Event #${comm.event_id.slice(0, 8)}`}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{comm.organization?.name || 'Client'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {getOrderTypeBadge(comm.order_type)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                        RM{comm.cash_collected_amount.toFixed(2)}
                        {comm.promo_discount_amount > 0 && (
                          <div className="text-[10px] text-slate-500">
                            (RM{comm.promo_discount_amount.toFixed(2)} promo excluded)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200">
                        {(comm.commission_rate * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-400">
                        RM{comm.commission_amount.toFixed(2)}
                        {comm.original_commission_amount && comm.original_commission_amount !== comm.commission_amount && (
                          <div className="text-[10px] text-slate-500 line-through">
                            RM{comm.original_commission_amount.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {getStatusBadge(comm.status)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                        {new Date(comm.eligibility_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 4. Sales Opportunities (Post-12-Month Requests) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Sales Opportunities (Post-12-Month Extension Requests)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Pre-approved opportunities allow earning a 5% commission on clients whose 12-month window has elapsed. Must be approved prior to order placement.
              </p>
            </div>
            <button
              onClick={() => setShowOpportunityModal(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              + New Request
            </button>
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-1">
              <div className="text-xs font-medium text-slate-400">No opportunity requests submitted</div>
              <div className="text-[11px] text-slate-500">
                If a past client is planning a new event after their 12-month window, request an opportunity here before they place their order.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Opportunity Title</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Validity Window</th>
                    <th className="px-4 py-3">Decision Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">
                        {opp.title}
                        {opp.description && (
                          <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                            {opp.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {opp.organization?.name || 'Organization'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            opp.status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : opp.status === 'consumed'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : opp.status === 'rejected'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : opp.status === 'expired'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {opp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {opp.valid_until ? (
                          <span>Valid until {new Date(opp.valid_until).toLocaleDateString()}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                        {opp.decision_notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Request Opportunity Modal */}
      {showOpportunityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowOpportunityModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Request Sales Opportunity Credit</span>
              </h3>
              <p className="text-xs text-slate-400">
                Submit an opportunity request for an attributed client whose 12-month window has elapsed. Must be reviewed and approved by an Admin BEFORE the client places their order.
              </p>
            </div>

            <form onSubmit={handleCreateOpportunity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Client Organization *
                </label>
                <select
                  value={opportunityForm.organizationId}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, organizationId: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select an attributed organization...</option>
                  {attributionWindows.map((win) => (
                    <option key={win.organization_id} value={win.organization_id}>
                      {win.organization_name} {win.is_window_expired ? '(Window Expired)' : `(${win.days_remaining}d remaining)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Opportunity Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Annual Gala Dinner Activation 2026"
                  value={opportunityForm.title}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Expected Event Date (Optional)
                </label>
                <input
                  type="date"
                  value={opportunityForm.expectedEventDate}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, expectedEventDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Description / Justification
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe your active re-engagement with this client..."
                  value={opportunityForm.description}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowOpportunityModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOpportunity}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors shadow-md shadow-amber-500/10"
                >
                  {submittingOpportunity ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
