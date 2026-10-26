import React, { useState, useEffect } from 'react';
import { SalesNavbar } from './SalesNavbar';
import { SEO } from '../common/SEO';
import { apiFetch } from '../../lib/api';
import { useLocalization } from '../../context/LocalizationContext';
import { CustomerAttribution, SalesReferralInfo } from '../../types/sales';
import {
  Share2,
  Copy,
  Check,
  Building2,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export const SalesReferralsPage: React.FC = () => {
  const { t } = useLocalization();
  const [referralInfo, setReferralInfo] = useState<SalesReferralInfo | null>(null);
  const [attributions, setAttributions] = useState<CustomerAttribution[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = async () => {
    try {
      const [refRes, attrRes] = await Promise.all([
        apiFetch('/api/sales/referral-code'),
        apiFetch('/api/sales/attributions'),
      ]);

      if (refRes.ok) {
        const refData = await refRes.json();
        setReferralInfo({
          referralCode: refData.referralCode,
          referralUrl: refData.referralUrl,
        });
      }

      if (attrRes.ok) {
        const attrData = await attrRes.json();
        setAttributions(attrData.attributions || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load referral details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopyCode = () => {
    if (!referralInfo?.referralCode) return;
    navigator.clipboard.writeText(referralInfo.referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!referralInfo?.referralUrl) return;
    navigator.clipboard.writeText(referralInfo.referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Metrics
  const totalCount = attributions.length;
  const approvedCount = attributions.filter((a) => a.status === 'approved').length;
  const pendingCount = attributions.filter((a) => a.status === 'pending').length;
  const needsReviewCount = attributions.filter((a) => a.status === 'needs_review').length;

  // Filtered list
  const filteredAttributions = attributions.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = a.referral_code?.toLowerCase().includes(q);
      const matchEmail = a.prospect_email?.toLowerCase().includes(q);
      const matchOrg = a.organization?.name?.toLowerCase().includes(q);
      const matchUser = a.referred_user?.name?.toLowerCase().includes(q);
      if (!matchCode && !matchEmail && !matchOrg && !matchUser) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {t('sales.commissions.statusApproved')}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            {t('sales.commissions.statusPending')}
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <AlertTriangle className="w-3 h-3" />
            {t('sales.commissions.pendingReview')}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            {t('sales.developer.reject')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3 h-3" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO robots="noindex, follow" title={`${t('sales.referrals.title')} | ${t('sales.nav.brandTitle')}`} />
      <SalesNavbar activeSection="referrals" />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5" />
                {t('sales.nav.portalSubtitle')}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {t('sales.referrals.title')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              {t('sales.referrals.subtitle')}
            </p>
          </div>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchData();
            }}
            disabled={refreshing}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? t('sales.dashboard.refreshing') : t('sales.dashboard.refresh')}</span>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchData();
              }}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            >
              {t('sales.aiTranslator.retry')}
            </button>
          </div>
        )}

        {/* Shareable Partner Code & Link Card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('sales.dashboard.activeStatus')} {t('sales.referrals.yourReferralCode')}
              </div>
              <h2 className="text-lg font-bold text-white">{t('sales.referrals.title')}</h2>
              <p className="text-xs text-slate-400 max-w-xl mt-0.5">
                {t('sales.referrals.subtitle')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Referral Code Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('sales.referrals.yourReferralCode')}
              </span>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl sm:text-2xl font-mono font-black text-amber-400 tracking-wider">
                  {referralInfo?.referralCode || 'Generating...'}
                </span>
                <button
                  onClick={handleCopyCode}
                  disabled={!referralInfo?.referralCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? t('sales.referrals.codeCopied') : t('sales.referrals.copyCode')}</span>
                </button>
              </div>
            </div>

            {/* Referral URL Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('sales.referrals.yourReferralUrl')}
              </span>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-slate-300 truncate max-w-[260px] sm:max-w-[320px]">
                  {referralInfo?.referralUrl || 'Loading...'}
                </span>
                <button
                  onClick={handleCopyLink}
                  disabled={!referralInfo?.referralUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? t('sales.referrals.linkCopied') : t('sales.referrals.copyLink')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 12-Month Attribution Explanation Steps */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{t('sales.referrals.attributionHowItWorks')}</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
              <h4 className="font-bold text-amber-400">{t('sales.referrals.step1Title')}</h4>
              <p className="text-slate-400 leading-relaxed">{t('sales.referrals.step1Desc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
              <h4 className="font-bold text-amber-400">{t('sales.referrals.step2Title')}</h4>
              <p className="text-slate-400 leading-relaxed">{t('sales.referrals.step2Desc')}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
              <h4 className="font-bold text-amber-400">{t('sales.referrals.step3Title')}</h4>
              <p className="text-slate-400 leading-relaxed">{t('sales.referrals.step3Desc')}</p>
            </div>
          </div>
        </div>

        {/* Metric Counter Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-slate-400 font-medium">{t('sales.customers.totalActivations')}</span>
            <div className="text-2xl font-black text-white">{totalCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-emerald-400 font-medium">{t('sales.commissions.statusApproved')}</span>
            <div className="text-2xl font-black text-emerald-400">{approvedCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-amber-400 font-medium">{t('sales.commissions.statusPending')}</span>
            <div className="text-2xl font-black text-amber-400">{pendingCount}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
            <span className="text-xs text-purple-400 font-medium">{t('sales.commissions.pendingReview')}</span>
            <div className="text-2xl font-black text-purple-400">{needsReviewCount}</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'all', label: `${t('sales.customers.filterAll')} (${totalCount})` },
              { id: 'approved', label: `${t('sales.commissions.statusApproved')} (${approvedCount})` },
              { id: 'pending', label: `${t('sales.commissions.statusPending')} (${pendingCount})` },
              { id: 'needs_review', label: `${t('sales.commissions.pendingReview')} (${needsReviewCount})` },
              { id: 'rejected', label: t('sales.developer.reject') },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('sales.customers.searchPlaceholder')}
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Attributions List */}
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">{t('sales.dashboard.refreshing')}</p>
          </div>
        ) : filteredAttributions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">{t('sales.referrals.noAttributions')}</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {t('sales.referrals.attributionNote')}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">{t('sales.customers.clientCol')}</th>
                    <th className="py-3 px-4">{t('sales.customers.registeredOn')}</th>
                    <th className="py-3 px-4">{t('sales.referrals.yourReferralCode')}</th>
                    <th className="py-3 px-4">{t('sales.commissions.dateCol')}</th>
                    <th className="py-3 px-4">{t('sales.customers.statusCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredAttributions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                      {/* Referred Customer */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{item.referred_user?.name || item.prospect_email || 'New Registration'}</span>
                          </div>
                          {item.prospect_email && (
                            <div className="text-[11px] text-slate-400">{item.prospect_email}</div>
                          )}
                        </div>
                      </td>

                      {/* Organization */}
                      <td className="py-3 px-4">
                        {item.organization ? (
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.organization.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">{t('sales.referrals.pendingOrgSetup')}</span>
                        )}
                      </td>

                      {/* Code */}
                      <td className="py-3 px-4 font-mono font-semibold text-amber-400">
                        {item.referral_code}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        {getStatusBadge(item.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
