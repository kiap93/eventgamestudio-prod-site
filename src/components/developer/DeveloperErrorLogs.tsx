import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import {
  AlertOctagon,
  Search,
  RefreshCw,
  Clock,
  Filter,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Server,
  Database,
  CreditCard,
  HardDrive,
  Cpu,
  Lock,
  FileCheck,
  HelpCircle,
} from 'lucide-react';

export interface ApiErrorLogItem {
  id: string;
  request_id: string;
  created_at: string;
  user_id: string | null;
  method: string | null;
  endpoint: string | null;
  status_code: number | null;
  error_type: string | null;
  error_code: string | null;
  error_message: string | null;
  stack_trace: string | null;
  service: string | null;
  metadata: Record<string, any> | null;
}

export const DeveloperErrorLogs: React.FC = () => {
  const { t } = useLocalization();
  const [logs, setLogs] = useState<ApiErrorLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedStatusCode, setSelectedStatusCode] = useState<string>('');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<ApiErrorLogItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      if (selectedService) {
        params.set('service', selectedService);
      }
      if (selectedStatusCode) {
        params.set('statusCode', selectedStatusCode);
      }

      if (selectedTimeRange === '24h') {
        const d = new Date();
        d.setHours(d.getHours() - 24);
        params.set('startDate', d.toISOString());
      } else if (selectedTimeRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.set('startDate', d.toISOString());
      } else if (selectedTimeRange === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.set('startDate', d.toISOString());
      }

      const res = await apiFetch(`/api/developer/error-logs?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: Failed to fetch error logs`);
      }

      const json = await res.json();
      setLogs(json.data || []);
      if (json.pagination) {
        setTotalPages(json.pagination.totalPages || 1);
        setTotalCount(json.pagination.total || 0);
      }
    } catch (err: any) {
      console.error('Error fetching admin error logs:', err);
      setError(err.message || 'Failed to load error logs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchQuery, selectedService, selectedStatusCode, selectedTimeRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedService('');
    setSelectedStatusCode('');
    setSelectedTimeRange('all');
    setPage(1);
  };

  const getServiceBadge = (service: string | null) => {
    const s = (service || 'unknown').toLowerCase();
    switch (s) {
      case 'postgres':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Database className="w-3 h-3 mr-1" />
            PostgreSQL
          </span>
        );
      case 'supabase':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Server className="w-3 h-3 mr-1" />
            Supabase
          </span>
        );
      case 'stripe':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <CreditCard className="w-3 h-3 mr-1" />
            Stripe
          </span>
        );
      case 'storage':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <HardDrive className="w-3 h-3 mr-1" />
            Storage
          </span>
        );
      case 'rpc':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Cpu className="w-3 h-3 mr-1" />
            RPC
          </span>
        );
      case 'authentication':
      case 'auth':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Lock className="w-3 h-3 mr-1" />
            Auth
          </span>
        );
      case 'validation':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            <FileCheck className="w-3 h-3 mr-1" />
            Validation
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3 h-3 mr-1" />
            {service || 'Unknown'}
          </span>
        );
    }
  };

  const getMethodBadge = (method: string | null) => {
    const m = (method || 'GET').toUpperCase();
    let color = 'bg-slate-800 text-slate-300';
    if (m === 'GET') color = 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
    if (m === 'POST') color = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (m === 'PUT' || m === 'PATCH') color = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    if (m === 'DELETE') color = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';

    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${color}`}>{m}</span>;
  };

  const getStatusBadge = (code: number | null) => {
    const c = code || 500;
    if (c >= 500) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
          {c}
        </span>
      );
    }
    if (c >= 400) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
          {c}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-slate-800 text-slate-300">
        {c}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/30">
            <AlertOctagon className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {t('developer.apiErrorLogsTitle')}
              <span className="px-2.5 py-0.5 text-xs rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {t('developer.totalLogsCount', { count: totalCount })}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {t('developer.apiErrorLogsDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search bar */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={t('developer.searchLogsPlaceholder')}
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          {/* Service filter */}
          <div>
            <select
              value={selectedService}
              onChange={e => {
                setSelectedService(e.target.value);
                setPage(1);
              }}
              aria-label={t('developer.filterByService')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">{t('developer.allServices')}</option>
              <option value="postgres">PostgreSQL</option>
              <option value="supabase">Supabase</option>
              <option value="stripe">Stripe</option>
              <option value="storage">Storage</option>
              <option value="rpc">RPC</option>
              <option value="authentication">Auth / Token</option>
              <option value="validation">Validation</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          {/* Status code filter */}
          <div>
            <select
              value={selectedStatusCode}
              onChange={e => {
                setSelectedStatusCode(e.target.value);
                setPage(1);
              }}
              aria-label={t('developer.filterByStatus')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="">{t('developer.allStatusCodes')}</option>
              <option value="500">500 (Internal Server Error)</option>
              <option value="400">400 (Bad Request)</option>
              <option value="401">401 (Unauthorized)</option>
              <option value="403">403 (Forbidden)</option>
              <option value="404">404 (Not Found)</option>
              <option value="409">409 (Conflict)</option>
              <option value="422">422 (Validation Error)</option>
              <option value="429">429 (Rate Limited)</option>
            </select>
          </div>

          {/* Time range filter */}
          <div>
            <select
              value={selectedTimeRange}
              onChange={e => {
                setSelectedTimeRange(e.target.value);
                setPage(1);
              }}
              aria-label={t('developer.filterByTimeRange', undefined, 'Filter by Time Range')}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">{t('developer.allTime', undefined, 'All Time')}</option>
              <option value="24h">{t('developer.last24Hours', undefined, 'Last 24 Hours')}</option>
              <option value="7d">{t('developer.last7Days', undefined, 'Last 7 Days')}</option>
              <option value="30d">{t('developer.last30Days', undefined, 'Last 30 Days')}</option>
            </select>
          </div>
        </div>

        {(searchQuery || selectedService || selectedStatusCode || selectedTimeRange !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400">Active filters applied</span>
            <button
              onClick={handleClearFilters}
              className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Error alert if fetch failed */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center space-x-3 text-rose-300 text-xs">
          <AlertOctagon className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Error logs table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Status & Time</th>
                <th className="py-3 px-4">Request / Correlation ID</th>
                <th className="py-3 px-4">Method & Endpoint</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Error Message / Type</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                    Loading API error audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No error logs found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const date = new Date(log.created_at);
                  const timeFormatted = date.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const dateFormatted = date.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Status and Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(log.status_code)}
                          <div className="text-[11px]">
                            <span className="text-slate-200 block font-mono">{timeFormatted}</span>
                            <span className="text-slate-500 text-[10px] block">{dateFormatted}</span>
                          </div>
                        </div>
                      </td>

                      {/* Request ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-slate-300 text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800 select-all">
                            {log.request_id ? `${log.request_id.slice(0, 8)}...` : 'N/A'}
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleCopy(log.request_id, `req-${log.id}`);
                            }}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
                            title={t('developer.copyFullRequestId', undefined, 'Copy full Request ID')}
                          >
                            {copiedField === `req-${log.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Method & Endpoint */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          {getMethodBadge(log.method)}
                          <span
                            className="font-mono text-slate-300 text-[11px] truncate max-w-[220px]"
                            title={log.endpoint || ''}
                          >
                            {log.endpoint || '/'}
                          </span>
                        </div>
                      </td>

                      {/* Service origin */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getServiceBadge(log.service)}
                      </td>

                      {/* Error Message & Type */}
                      <td className="py-3 px-4 max-w-[320px]">
                        <div className="truncate">
                          <span className="text-white font-medium block truncate">
                            {log.error_message || 'No error message'}
                          </span>
                          <span className="text-slate-500 text-[10px] font-mono block">
                            {log.error_type || 'Error'} {log.error_code ? `• ${log.error_code}` : ''}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-[11px] font-medium transition-colors"
                        >
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>{t('developer.inspect', undefined, 'Inspect')}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span>{t('developer.rowsPerPage', undefined, 'Rows per page:')}</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label={t('developer.rowsPerPage', undefined, 'Rows per page')}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="ml-2 text-slate-500">
              Showing {logs.length > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
              {Math.min(page * pageSize, totalCount)} of {totalCount}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-300 px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Log Modal / Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Diagnostic Inspection
                    {getStatusBadge(selectedLog.status_code)}
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400 block">
                    {new Date(selectedLog.created_at).toUTCString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                    Request ID
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-emerald-400 select-all truncate text-[11px]">
                      {selectedLog.request_id}
                    </span>
                    <button
                      onClick={() => handleCopy(selectedLog.request_id, 'modal-req-id')}
                      className="text-slate-400 hover:text-white ml-2 flex-shrink-0"
                    >
                      {copiedField === 'modal-req-id' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                    Method & Path
                  </span>
                  <div className="flex items-center space-x-2 truncate">
                    {getMethodBadge(selectedLog.method)}
                    <span className="font-mono text-slate-200 truncate">{selectedLog.endpoint}</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                    Service Origin
                  </span>
                  <div>{getServiceBadge(selectedLog.service)}</div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">
                    User Session
                  </span>
                  <span className="font-mono text-slate-300 truncate block">
                    {selectedLog.user_id ? selectedLog.user_id : 'Anonymous / Public'}
                  </span>
                </div>
              </div>

              {/* Error Details */}
              <div className="space-y-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  Error Classification & Message
                </span>
                <div className="bg-slate-950 p-4 rounded-xl border border-rose-500/20 text-rose-300 font-mono text-xs leading-relaxed select-all">
                  <div className="font-bold text-rose-400 mb-1">
                    {selectedLog.error_type || 'Error'}{' '}
                    {selectedLog.error_code && `(${selectedLog.error_code})`}
                  </div>
                  <div>{selectedLog.error_message || 'Unknown internal error'}</div>
                </div>
              </div>

              {/* Stack Trace */}
              {selectedLog.stack_trace && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      Sanitized Stack Trace
                    </span>
                    <button
                      onClick={() => handleCopy(selectedLog.stack_trace!, 'stack-trace')}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 text-[11px]"
                    >
                      {copiedField === 'stack-trace' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{t('developer.copyStack', undefined, 'Copy Stack')}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-400 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-56 select-all">
                    {selectedLog.stack_trace}
                  </pre>
                </div>
              )}

              {/* Request Metadata (Sanitized) */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      Sanitized Request Metadata (Headers, Body & Query)
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(JSON.stringify(selectedLog.metadata, null, 2), 'metadata')
                      }
                      className="text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 text-[11px]"
                    >
                      {copiedField === 'metadata' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{t('developer.copyJson', undefined, 'Copy JSON')}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-56 select-all">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
