import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch, getApiBaseUrl } from '../../lib/api';
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Send,
  RefreshCw,
  Unplug,
  Key,
  Server,
  Lock,
  ArrowRight,
  Info,
} from 'lucide-react';

interface GmailStatusResponse {
  success: boolean;
  configured: boolean;
  connected: boolean;
  status: 'connected' | 'error' | 'disconnected';
  email: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  redirectUri: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
}

export const DeveloperEmailSettings: React.FC = () => {
  const { t } = useLocalization();
  const [statusData, setStatusData] = useState<GmailStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [testEmail, setTestEmail] = useState<string>('');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    messageId?: string;
    senderEmail?: string;
    error?: string;
  } | null>(null);
  const [uiNotice, setUiNotice] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/email/google/status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setUiNotice({
          type: 'error',
          text: err.error || 'Failed to fetch Gmail status',
        });
      }
    } catch (err: any) {
      console.error('Fetch Gmail status error:', err);
      setUiNotice({
        type: 'error',
        text: err.message || 'Network error fetching Gmail status',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Check URL query parameters for post-OAuth callback result (e.g., /developer/email?status=connected or ?status=error&reason=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackStatus = params.get('status');
    const callbackReason = params.get('reason') || params.get('error');
    const callbackDetail = params.get('detail');

    if (callbackStatus === 'connected') {
      setUiNotice({
        type: 'success',
        text: 'Gmail connected successfully.',
      });
      // Clean query parameters from URL without full reload
      window.history.replaceState({}, '', window.location.pathname);
      // Immediately fetch authoritative connection state from database/API
      fetchStatus();
    } else if (callbackStatus === 'error' || callbackReason) {
      let errorText = 'Failed to connect Gmail.';
      if (callbackReason === 'oauth_denied') {
        errorText = 'Google OAuth authorization was cancelled or denied.';
      } else if (callbackReason === 'invalid_state') {
        errorText = `OAuth security verification expired or failed.${callbackDetail ? ` (${decodeURIComponent(callbackDetail)})` : ' Please try connecting again.'}`;
      } else if (callbackReason === 'missing_refresh_token') {
        errorText = 'Google did not return a refresh token. Please re-authenticate with prompt consent.';
      } else if (callbackReason === 'exchange_failed') {
        errorText = `Failed to exchange authorization code with Google OAuth servers.${callbackDetail ? ` Details: ${decodeURIComponent(callbackDetail)}` : ''}`;
      } else if (callbackReason === 'missing_code') {
        errorText = 'Missing OAuth authorization code from Google callback.';
      } else if (callbackReason) {
        errorText = `Failed to connect Gmail: ${decodeURIComponent(callbackReason)}${callbackDetail ? ` - ${decodeURIComponent(callbackDetail)}` : ''}`;
      }

      setUiNotice({
        type: 'error',
        text: errorText,
      });
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    } else {
      // Normal page load without OAuth query params
      fetchStatus();
    }
  }, [fetchStatus]);

  const handleConnectGmail = async () => {
    setConnecting(true);
    setUiNotice(null);
    try {
      // 1. Fetch the server-constructed Google OAuth authorization URL
      const res = await apiFetch('/api/email/google/connect', {
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await res.json();

      if (res.ok && data.authUrl) {
        // Direct browser navigation to Google OAuth consent screen
        window.location.href = data.authUrl;
        return;
      }

      if (data.error) {
        setUiNotice({
          type: 'error',
          text: data.error,
        });
        setConnecting(false);
        return;
      }

      // Fallback: direct browser navigation with explicit redirect flag
      const token = localStorage.getItem('app_token') || '';
      const baseUrl = getApiBaseUrl();
      const connectUrl = `${baseUrl}/api/email/google/connect?redirect=true${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      window.location.href = connectUrl;
    } catch (err: any) {
      console.warn('apiFetch failed, falling back to direct navigation:', err);
      const token = localStorage.getItem('app_token') || '';
      const baseUrl = getApiBaseUrl();
      const connectUrl = `${baseUrl}/api/email/google/connect?redirect=true${token ? `&token=${encodeURIComponent(token)}` : ''}`;
      window.location.href = connectUrl;
    }
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect the platform Gmail sending account? Automated invitation emails will stop sending until reconnected.'
      )
    ) {
      return;
    }

    setDisconnecting(true);
    setUiNotice(null);
    try {
      const res = await apiFetch('/api/email/google/disconnect', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setUiNotice({
          type: 'info',
          text: 'Platform Gmail sending account disconnected.',
        });
        fetchStatus();
      } else {
        setUiNotice({
          type: 'error',
          text: data.error || 'Failed to disconnect Gmail',
        });
      }
    } catch (err: any) {
      setUiNotice({
        type: 'error',
        text: err.message || 'Error disconnecting Gmail',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim() || !testEmail.includes('@')) {
      setTestResult({
        success: false,
        message: 'Please enter a valid recipient email address',
      });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await apiFetch('/api/email/google/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Email successfully delivered to Gmail API queue!`,
          messageId: data.messageId,
          senderEmail: data.senderEmail,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Gmail API rejected the test email dispatch.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error sending test email.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const isConnected = Boolean(statusData?.connected && statusData.status === 'connected');
  const isError = Boolean(statusData?.status === 'error');

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Banner Notice */}
      {uiNotice && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between text-sm ${
            uiNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : uiNotice.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {uiNotice.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            {uiNotice.type === 'error' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
            {uiNotice.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
            <span>{uiNotice.text}</span>
          </div>
          <button
            onClick={() => setUiNotice(null)}
            className="text-slate-400 hover:text-white font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Page Title & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center space-x-3">
                <span>{t('developer.emailSettingsTitle')}</span>
                {loading ? (
                  <span className="text-xs font-normal text-slate-500 flex items-center">
                    <RefreshCw className="w-3 h-3 animate-spin mr-1" /> {t('developer.checkingStatus')}
                  </span>
                ) : isConnected ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {t('developer.activeSending')}
                  </span>
                ) : isError ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    <XCircle className="w-3.5 h-3.5 mr-1" /> {t('developer.connectionError')}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {t('developer.notConnected')}
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {t('developer.emailSettingsDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('developer.refreshStatus')}</span>
          </button>
        </div>
      </div>

      {/* Main Architecture & Connection Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Status & Connection Action */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Server className="w-5 h-5 text-indigo-400" />
              <span>{t('developer.sendingAccountStatus')}</span>
            </h2>

            {/* Connection Info Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block uppercase tracking-wider font-semibold text-[10px]">
                    {t('developer.sendingMethod')}
                  </span>
                  <span className="text-slate-200 font-mono mt-0.5 block font-bold">
                    Official Gmail API (v1 / users.messages.send)
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase tracking-wider font-semibold text-[10px]">
                    {t('developer.oauthScope')}
                  </span>
                  <span className="text-slate-200 font-mono mt-0.5 block">
                    https://www.googleapis.com/auth/gmail.send
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase tracking-wider font-semibold text-[10px]">
                    {t('developer.connectedAccount')}
                  </span>
                  <span className="text-indigo-400 font-bold text-sm mt-0.5 block font-mono">
                    {statusData?.email || t('developer.noneRequired')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block uppercase tracking-wider font-semibold text-[10px]">
                    {t('developer.lastConnectionTime')}
                  </span>
                  <span className="text-slate-300 mt-0.5 block">
                    {statusData?.lastConnectedAt
                      ? new Date(statusData.lastConnectedAt).toLocaleString()
                      : t('developer.never')}
                  </span>
                </div>
              </div>

              {statusData?.lastError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{t('developer.recentError')}</span> {statusData.lastError}
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Connect / Disconnect */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {!isConnected ? (
                <button
                  onClick={handleConnectGmail}
                  disabled={connecting || loading}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  <span>
                    {connecting ? t('developer.redirectingToGoogle') : t('developer.connectGmailBtn')}
                  </span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleConnectGmail}
                    disabled={connecting || loading}
                    className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('developer.reconnectAccount')}</span>
                  </button>

                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting || loading}
                    className="flex items-center space-x-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs rounded-xl transition-all"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    <span>{disconnecting ? t('developer.disconnecting') : t('developer.disconnectGmail')}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Test Email Dispatch Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Send className="w-5 h-5 text-emerald-400" />
              <span>{t('developer.sendTestEmailTitle')}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {t('developer.sendTestEmailDesc')}
            </p>

            <form onSubmit={handleSendTestEmail} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="developer@yourcompany.com"
                  disabled={!isConnected || sendingTest}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!isConnected || sendingTest || !testEmail.trim()}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <Send className={`w-4 h-4 ${sendingTest ? 'animate-pulse' : ''}`} />
                  <span>{sendingTest ? t('developer.sendingViaGmail') : t('developer.sendTestEmailBtn')}</span>
                </button>
              </div>

              {!isConnected && (
                <p className="text-[11px] text-amber-400/90 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t('developer.pleaseConnectFirst')}</span>
                </p>
              )}
            </form>

            {/* Test Result Display */}
            {testResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold text-sm">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{testResult.message}</span>
                </div>

                {testResult.success && (
                  <div className="font-mono text-[11px] bg-slate-950 p-2.5 rounded-lg border border-emerald-500/20 text-slate-300 space-y-1">
                    <div>
                      <span className="text-slate-500">Gmail Message ID:</span>{' '}
                      <span className="text-emerald-400 font-bold">{testResult.messageId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">From Account:</span> {testResult.senderEmail}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Architecture & Security Specifications */}
        <div className="space-y-6">
          {/* Security Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Production Security Architecture</span>
            </h3>

            <ul className="text-xs text-slate-300 space-y-3">
              <li className="flex items-start space-x-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-white">Server-Side AES-256-GCM:</strong> Refresh tokens are encrypted with a 256-bit secret key and never exposed to the frontend browser.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-white">HMAC-Signed OAuth State:</strong> Anti-CSRF verification prevents unauthorized callback hijacking.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-white">Single Platform Sender:</strong> Individual customers never connect personal inboxes; all team invites originate from the verified EventGameStudio platform address.
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-white">Zero Third-Party Relays:</strong> No SMTP relays, Nodemailer servers, or untrusted middleman services are used.
                </span>
              </li>
            </ul>
          </div>

          {/* Config Guidance Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span>Environment Variables</span>
            </h3>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Ensure the following keys are set in your environment / Cloudflare Worker secrets:
            </p>

            <div className="font-mono text-[10px] bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-300 space-y-1.5 overflow-x-auto">
              <div className="text-indigo-400"># Google Cloud OAuth Credentials</div>
              <div>GOOGLE_MAIL_CLIENT_ID="..."</div>
              <div>GOOGLE_MAIL_CLIENT_SECRET="..."</div>
              <div>GOOGLE_MAIL_REDIRECT_URI="{statusData?.redirectUri || 'https://eventgamestudio.com/api/email/google/callback'}"</div>
              <div className="text-indigo-400 pt-1"># Refresh Token Encryption</div>
              <div>GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY="..."</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
