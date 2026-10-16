import React, { useState, useEffect } from 'react';
import { SalesNavbar } from './SalesNavbar';
import { SEO } from '../common/SEO';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import {
  SalesPartnerCustomer,
  SalesPartnerCustomerDetail,
  AttributionStatus,
} from '../../types/sales';
import {
  Users,
  Search,
  Filter,
  Building2,
  Calendar,
  Coins,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  RefreshCw,
  Eye,
  Plus,
  ArrowRight,
  ShieldCheck,
  Zap,
  X,
  FileText,
  Mail,
  User,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Share2,
} from 'lucide-react';

export const SalesCustomersPage: React.FC = () => {
  const { currentUser, isSalesPartner, isLoading, isAuthenticated } = useAuth();
  const [customers, setCustomers] = useState<SalesPartnerCustomer[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest_activity');

  // Selected Customer for Details Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<SalesPartnerCustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // New Opportunity Modal from Customer view
  const [showOpportunityModal, setShowOpportunityModal] = useState<boolean>(false);
  const [opportunityOrgId, setOpportunityOrgId] = useState<string>('');
  const [opportunityOrgName, setOpportunityOrgName] = useState<string>('');
  const [opportunityTitle, setOpportunityTitle] = useState<string>('');
  const [opportunityDescription, setOpportunityDescription] = useState<string>('');
  const [opportunityExpectedDate, setOpportunityExpectedDate] = useState<string>('');
  const [submittingOpportunity, setSubmittingOpportunity] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Read status query from URL params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlStatus = params.get('status');
      if (urlStatus && ['all', 'approved', 'pending', 'needs_review', 'rejected'].includes(urlStatus)) {
        setStatusFilter(urlStatus);
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchCustomers = async () => {
    try {
      setError(null);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
      });

      if (debouncedSearch.trim()) {
        queryParams.set('search', debouncedSearch.trim());
      }

      if (statusFilter !== 'all') {
        queryParams.set('status', statusFilter);
      }

      const res = await apiFetch(`/api/sales/customers?${queryParams.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load customer list');
      }

      const data = await res.json();
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err: any) {
      setError(err?.message || 'Error loading customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isSalesPartner) {
      if (!isLoading && (!isAuthenticated || !isSalesPartner)) {
        setLoading(false);
      }
      return;
    }
    fetchCustomers();
  }, [isLoading, isAuthenticated, isSalesPartner, page, limit, debouncedSearch, statusFilter, sortBy]);

  const handleRefresh = () => {
    if (isLoading || !isAuthenticated || !isSalesPartner) return;
    setRefreshing(true);
    fetchCustomers();
  };

  // Open Detail Modal
  const handleViewDetail = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setLoadingDetail(true);
    setDetailError(null);
    setCustomerDetail(null);

    try {
      const res = await apiFetch(`/api/sales/customers/${encodeURIComponent(customerId)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Customer not found or unauthorized');
      }

      const data = await res.json();
      setCustomerDetail(data.customer);
    } catch (err: any) {
      setDetailError(err?.message || 'Failed to load customer details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenOpportunityModal = (orgId: string, orgName: string) => {
    setOpportunityOrgId(orgId);
    setOpportunityOrgName(orgName);
    setOpportunityTitle(`Repeat Event Activation — ${orgName}`);
    setOpportunityDescription('');
    setOpportunityExpectedDate('');
    setShowOpportunityModal(true);
  };

  const handleSubmitOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunityOrgId || !opportunityTitle.trim()) {
      alert('Please provide an opportunity title');
      return;
    }

    try {
      setSubmittingOpportunity(true);
      const res = await apiFetch('/api/sales/opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: opportunityOrgId,
          title: opportunityTitle.trim(),
          description: opportunityDescription.trim() || undefined,
          expectedEventDate: opportunityExpectedDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit sales opportunity request');
      }

      alert('Sales opportunity request submitted successfully for administrator review!');
      setShowOpportunityModal(false);
      // Refresh current view
      if (selectedCustomerId) {
        handleViewDetail(selectedCustomerId);
      }
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Error submitting opportunity');
    } finally {
      setSubmittingOpportunity(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'MYR') => {
    return `${currency === 'MYR' ? 'RM' : currency} ${amount.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getAttributionBadge = (status: AttributionStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> Flagged Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'reassigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Reassigned
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

  const getWindowBadge = (customer: SalesPartnerCustomer) => {
    if (customer.window_status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span>Active (5% repeat)</span>
          {customer.days_remaining !== null && (
            <span className="text-[10px] text-emerald-300">({customer.days_remaining}d)</span>
          )}
        </span>
      );
    }
    if (customer.window_status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span>Window Expired</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        <span>No orders yet (10% 1st order)</span>
      </span>
    );
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO robots="noindex, follow" title="Attributed Customers | Event Game Studio" />
      <SalesNavbar activeSection="customers" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-1">
              <Users className="w-3.5 h-3.5" />
              <span>Client Portfolio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Attributed Clients & Organizations
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Track client organizations registered through your referral codes, monitor event activation counts, and verify 12-month repeat order commission eligibility.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
              title="Refresh Client List"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={() => navigateTo('/sales/referrals')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-450 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Refer New Client</span>
            </button>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name, email, referral code..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs">
            {[
              { id: 'all', label: 'All Clients' },
              { id: 'approved', label: 'Approved' },
              { id: 'pending', label: 'Pending' },
              { id: 'needs_review', label: 'Review' },
              { id: 'rejected', label: 'Rejected' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="latest_activity">Latest Activity</option>
              <option value="commissions">Highest Commissions</option>
              <option value="name">Client Name</option>
              <option value="established">Date Established</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="text-xs text-rose-300">{error}</div>
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-800 mx-auto" />
            <div className="h-4 bg-slate-800 rounded w-48 mx-auto" />
            <div className="h-3 bg-slate-850 rounded w-64 mx-auto" />
          </div>
        )}

        {/* Customers Table / Card List */}
        {!loading && customers.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">Client / Organization</th>
                    <th className="py-3.5 px-4">Attribution Status</th>
                    <th className="py-3.5 px-4">Method & Code</th>
                    <th className="py-3.5 px-4">Events / Activations</th>
                    <th className="py-3.5 px-4">Earned Commission</th>
                    <th className="py-3.5 px-4">12-Mo Repeat Window</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {customers.map((cust) => (
                    <tr
                      key={cust.id}
                      className="hover:bg-slate-850/60 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetail(cust.id)}
                    >
                      {/* Name & Contact */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-white group-hover:text-amber-400 transition-colors truncate max-w-[200px]">
                              {cust.organization_name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {cust.contact_email || cust.contact_name || 'No contact email recorded'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {cust.organization_id || cust.attribution_id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <div>
                          {getAttributionBadge(cust.attribution_status)}
                          <div className="text-[10px] text-slate-500 mt-1">
                            Est: {new Date(cust.established_at || cust.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </td>

                      {/* Referral Method & Code */}
                      <td className="py-4 px-4 font-mono">
                        <span className="font-semibold text-slate-200">{cust.referral_code}</span>
                        <div className="text-[10px] text-slate-400 capitalize">
                          via {cust.referral_method}
                        </div>
                      </td>

                      {/* Events Count */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white">
                          {cust.total_events} Total
                        </div>
                        <div className="text-[11px] text-emerald-400">
                          {cust.total_paid_events} Paid & Active
                        </div>
                      </td>

                      {/* Commissions */}
                      <td className="py-4 px-4">
                        <div className="font-black text-amber-400">
                          {formatCurrency(cust.total_commissions_earned, cust.currency)}
                        </div>
                        {cust.total_commissions_pending > 0 && (
                          <div className="text-[10px] text-blue-400">
                            +{formatCurrency(cust.total_commissions_pending, cust.currency)} pending
                          </div>
                        )}
                      </td>

                      {/* 12-Month Window */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          {getWindowBadge(cust)}
                          {cust.active_opportunity_exists && (
                            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <Sparkles className="w-2.5 h-2.5" /> Opp Approved
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="py-4 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetail(cust.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="View Customer Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {cust.organization_id && (
                            <button
                              onClick={() => handleOpenOpportunityModal(cust.organization_id!, cust.organization_name)}
                              className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 transition-colors cursor-pointer"
                              title="Request Opportunity for Repeat Event"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-950/80 border-t border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-white">{(page - 1) * limit + 1}</span> to{' '}
                <span className="font-semibold text-white">
                  {Math.min(page * limit, total)}
                </span>{' '}
                of <span className="font-semibold text-white">{total}</span> client accounts
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="px-2 text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 cursor-pointer flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && customers.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No Attributed Clients Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'No clients match your search criteria. Try resetting your filter or search query.'
                  : 'You have not yet attributed any clients. Share your unique partner referral link with event planners to get started.'}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              {searchQuery || statusFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={() => navigateTo('/sales/referrals')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Get Referral Link</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Customer Detail Slideover / Modal */}
        {selectedCustomerId && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {customerDetail?.organization_name || 'Client Account Details'}
                    </h3>
                    <div className="text-xs text-slate-400">
                      Attribution ID: {selectedCustomerId}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Loading Detail */}
              {loadingDetail && (
                <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
                  Loading client details, events, and commission history...
                </div>
              )}

              {/* Detail Error */}
              {detailError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  {detailError}
                </div>
              )}

              {/* Detail Content */}
              {customerDetail && !loadingDetail && (
                <div className="space-y-6">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase font-semibold">Status</div>
                      <div className="mt-1">{getAttributionBadge(customerDetail.attribution_status)}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase font-semibold">Total Events</div>
                      <div className="mt-1 text-base font-black text-white">
                        {customerDetail.total_events} ({customerDetail.total_paid_events} paid)
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase font-semibold">Earned Commission</div>
                      <div className="mt-1 text-base font-black text-amber-400">
                        {formatCurrency(customerDetail.total_commissions_earned, customerDetail.currency)}
                      </div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-slate-400 text-[10px] uppercase font-semibold">12-Mo Repeat Window</div>
                      <div className="mt-1">{getWindowBadge(customerDetail)}</div>
                    </div>
                  </div>

                  {/* Contact & Attribution Details */}
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                    <h4 className="font-bold text-white text-xs">Attribution Profile</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="text-slate-500">Referral Code:</span>{' '}
                        <span className="font-mono font-bold text-amber-400">
                          {customerDetail.referral_code}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Referral Method:</span>{' '}
                        <span className="capitalize">{customerDetail.referral_method}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Contact Email:</span>{' '}
                        <span>{customerDetail.contact_email || 'Not provided'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Established Date:</span>{' '}
                        <span>
                          {new Date(
                            customerDetail.established_at || customerDetail.created_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Related Events Section */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-white text-xs flex items-center justify-between">
                      <span>Client Event Activations ({customerDetail.events.length})</span>
                      {customerDetail.organization_id && (
                        <button
                          onClick={() =>
                            handleOpenOpportunityModal(
                              customerDetail.organization_id!,
                              customerDetail.organization_name
                            )
                          }
                          className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Request Opportunity</span>
                        </button>
                      )}
                    </h4>

                    {customerDetail.events.length > 0 ? (
                      <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 text-xs">
                        {customerDetail.events.map((ev) => (
                          <div key={ev.id} className="p-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-white">{ev.name}</div>
                              <div className="text-[11px] text-slate-400">
                                {ev.start_date ? `Dates: ${ev.start_date} ~ ${ev.end_date}` : 'Unscheduled'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  ev.payment_status === 'PAID'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {ev.payment_status}
                              </span>
                              <div className="text-[11px] font-semibold text-slate-300 mt-0.5">
                                RM {ev.event_price?.toFixed(2) || '0.00'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        No events activated yet by this organization.
                      </div>
                    )}
                  </div>

                  {/* Commissions History for this Client */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-white text-xs">
                      Commissions Earned from this Client ({customerDetail.commissions.length})
                    </h4>
                    {customerDetail.commissions.length > 0 ? (
                      <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 text-xs">
                        {customerDetail.commissions.map((comm) => (
                          <div key={comm.id} className="p-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-white">
                                {comm.order_type === 'first_order'
                                  ? 'First Order Commission (10%)'
                                  : comm.order_type === 'repeat_order'
                                  ? 'Repeat Order Commission (5%)'
                                  : 'Opportunity Commission'}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Cash collected: {formatCurrency(comm.cash_collected_amount, comm.currency)} •{' '}
                                {new Date(comm.eligibility_date).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-black text-amber-400">
                                +{formatCurrency(comm.commission_amount, comm.currency)}
                              </div>
                              <span
                                className={`text-[10px] font-semibold ${
                                  comm.status === 'paid'
                                    ? 'text-emerald-400'
                                    : comm.status === 'approved'
                                    ? 'text-amber-400'
                                    : 'text-blue-400'
                                }`}
                              >
                                {comm.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        No commissions generated yet. Commissions record upon completed event activations.
                      </div>
                    )}
                  </div>

                  {/* Close button */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setSelectedCustomerId(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Opportunity Request Modal */}
        {showOpportunityModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">
                    Request Sales Opportunity
                  </h3>
                </div>
                <button
                  onClick={() => setShowOpportunityModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Submit an opportunity request to lock in commission eligibility for upcoming repeat event activations outside the 12-month window for <span className="font-bold text-white">{opportunityOrgName}</span>.
              </p>

              <form onSubmit={handleSubmitOpportunity} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Opportunity Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={opportunityTitle}
                    onChange={(e) => setOpportunityTitle(e.target.value)}
                    placeholder="e.g. Q4 Annual Conference Interactive Arena"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Expected Event Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={opportunityExpectedDate}
                    onChange={(e) => setOpportunityExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Details & Pitch Notes
                  </label>
                  <textarea
                    rows={3}
                    value={opportunityDescription}
                    onChange={(e) => setOpportunityDescription(e.target.value)}
                    placeholder="Provide details on the client pitch, proposed game formats, and timeline..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-850">
                  <button
                    type="button"
                    onClick={() => setShowOpportunityModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOpportunity}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {submittingOpportunity ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
