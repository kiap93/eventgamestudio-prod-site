import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { CountrySelect } from '../common/CountrySelect';
import { getCountryByCode, getDefaultTimezoneForCountry } from '../../lib/countryUtils';
import {
  Users,
  Mail,
  UserPlus,
  Shield,
  Trash2,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  RefreshCw,
  Send,
  AlertCircle,
  CheckCircle2,
  X,
  Globe,
  Edit2,
} from 'lucide-react';

interface Member {
  id: string;
  role: 'owner' | 'admin' | 'designer' | 'viewer';
  created_at: string;
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  email_status?: 'pending' | 'sent' | 'failed';
  email_error?: string | null;
}

export const TeamMembersPage: React.FC = () => {
  const { t } = useLocalization();
  const { currentOrganization, token, updateOrganizationCountry } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'designer' | 'viewer'>('designer');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isEditingCountry, setIsEditingCountry] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState(currentOrganization?.country_code || '');
  const [savingCountry, setSavingCountry] = useState(false);
  const [countryError, setCountryError] = useState<string | null>(null);

  // Close editing sub-states when navigating directly to root /team
  useEffect(() => {
    const handlePopState = () => {
      setIsEditingCountry(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (currentOrganization?.country_code) {
      setSelectedCountryCode(currentOrganization.country_code);
    }
  }, [currentOrganization?.country_code]);

  const handleSaveCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCountryCode.trim()) {
      setCountryError('Please select a country');
      return;
    }
    setSavingCountry(true);
    setCountryError(null);
    try {
      await updateOrganizationCountry(selectedCountryCode.trim());
      setIsEditingCountry(false);
      setMessage({
        type: 'success',
        text: 'Organization business country updated successfully!',
      });
    } catch (err: any) {
      setCountryError(err.message || 'Failed to update country');
    } finally {
      setSavingCountry(false);
    }
  };

  const fetchMembers = useCallback(async () => {
    if (!currentOrganization || !token) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
        setUserRole(data.userRole || 'viewer');
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, token]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !currentOrganization) return;

    setSendingInvite(true);
    setMessage(null);

    try {
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      const fullInviteLink = data.absoluteInviteUrl || `${window.location.origin}${data.inviteUrl}`;

      if (data.emailStatus === 'sent') {
        setMessage({
          type: 'success',
          text: `Invitation email successfully sent to ${inviteEmail} via official Gmail API!`,
        });
      } else if (data.emailStatus === 'failed') {
        setMessage({
          type: 'error',
          text: `Invitation created, but failed to deliver email (${data.emailError || 'Gmail API error'}). Share link manually: ${fullInviteLink}`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `Invitation generated for ${inviteEmail}! Share link: ${fullInviteLink}`,
        });
      }

      setInviteEmail('');
      fetchMembers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleResendInvite = async (invitationId: string, email: string) => {
    if (!currentOrganization) return;
    setResendingId(invitationId);
    setMessage(null);

    try {
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/invitations/${invitationId}/resend`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resend invitation');
      }

      const fullInviteLink = data.absoluteInviteUrl || `${window.location.origin}${data.inviteUrl}`;

      if (data.emailStatus === 'sent') {
        setMessage({
          type: 'success',
          text: `Fresh invitation email sent to ${email} successfully!`,
        });
      } else if (data.emailStatus === 'failed') {
        setMessage({
          type: 'error',
          text: `Failed to deliver email to ${email} (${data.emailError || 'Gmail API error'}). You can share the link manually: ${fullInviteLink}`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `Invitation token renewed for ${email}! Share link manually: ${fullInviteLink}`,
        });
      }

      fetchMembers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to resend invitation' });
    } finally {
      setResendingId(null);
    }
  };

  const handleRevokeInvite = async (invitationId: string, email: string) => {
    if (!currentOrganization || !confirm(`Revoke pending invitation for ${email}?`)) return;
    setRevokingId(invitationId);

    try {
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage({ type: 'success', text: `Invitation for ${email} has been revoked.` });
        fetchMembers();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Failed to revoke invitation' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemoveMember = async (memberId: string, email: string) => {
    if (!currentOrganization || !confirm(`Remove ${email} from ${currentOrganization.name}?`)) return;

    try {
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/members/${memberId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage({ type: 'success', text: `Removed ${email}` });
        fetchMembers();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const copyInviteLink = (inviteTokenUrl: string, id: string) => {
    const fullUrl = `${window.location.origin}${inviteTokenUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 text-slate-100 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('team.title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('team.desc')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">{t('auth.role', undefined, 'Your Role')}:</span>
          <span className="uppercase font-bold text-amber-300">{userRole}</span>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 font-bold opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {/* Organization Country & Business Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{t('common.businessProfile', undefined, 'Organization Business Profile')}</h2>
              <p className="text-xs text-slate-400">
                {t('common.businessProfileDesc', undefined, 'Primary business country, regional localization, and default timezone')}
              </p>
            </div>
          </div>

          {isOwnerOrAdmin && !isEditingCountry && (
            <button
              type="button"
              onClick={() => {
                setSelectedCountryCode(currentOrganization?.country_code || '');
                setIsEditingCountry(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{t('common.changeCountry', undefined, 'Change Country')}</span>
            </button>
          )}
        </div>

        {isEditingCountry ? (
          <form onSubmit={handleSaveCountry} className="space-y-4">
            <CountrySelect
              id="team-org-country"
              label={t('common.businessCountry', undefined, 'Business Country / Region')}
              required
              value={selectedCountryCode}
              onChange={(code) => {
                setSelectedCountryCode(code);
                if (countryError && code) setCountryError(null);
              }}
              error={countryError}
              helperText={t('common.businessCountryHelp', undefined, "Determines your organization's default timezone, regional currency, and tax profile.")}
            />
            <div className="flex items-center gap-2 justify-end pt-1">
              <button
                type="button"
                disabled={savingCountry}
                onClick={() => {
                  setIsEditingCountry(false);
                  setCountryError(null);
                  setSelectedCountryCode(currentOrganization?.country_code || '');
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingCountry || !selectedCountryCode.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {savingCountry ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('common.countryRegion', undefined, 'Country / Region')}
              </span>
              <div className="flex items-center gap-2 pt-0.5">
                {currentOrganization?.country_code ? (
                  <>
                    <span className="text-xl leading-none">
                      {getCountryByCode(currentOrganization.country_code)?.flag || '🌐'}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">
                      {getCountryByCode(currentOrganization.country_code)?.name || currentOrganization.country_code}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      ({currentOrganization.country_code})
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-amber-400 italic">{t('common.notSet', undefined, 'Not set')}</span>
                )}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('common.defaultTimezone', undefined, 'Default Timezone')}
              </span>
              <div className="flex items-center gap-2 pt-0.5 text-xs text-slate-300 font-mono">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {currentOrganization?.country_code
                    ? getDefaultTimezoneForCountry(currentOrganization.country_code)
                    : 'UTC'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t('common.rolePermissions', undefined, 'Role Permissions')}
              </span>
              <div className="flex items-center gap-2 pt-0.5 text-xs text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  {isOwnerOrAdmin
                    ? t('common.fullAccessSettings', undefined, 'Full access to update organization settings')
                    : t('common.viewOnlySettings', undefined, 'View only (Owners & Admins can edit)')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite Staff Card */}
      {isOwnerOrAdmin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <UserPlus className="w-5 h-5 text-amber-400" />
            <span>{t('team.inviteMember')}</span>
          </div>

          <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-slate-400 mb-1">{t('auth.email')}</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('team.emailPlaceholder')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">{t('team.selectRole')}</label>
              <select
                value={inviteRole}
                onChange={(e: any) => setInviteRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="admin">{t('team.roleAdmin')}</option>
                <option value="designer">{t('team.roleDesigner')}</option>
                <option value="viewer">{t('team.roleViewer')}</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={sendingInvite || !inviteEmail.trim()}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {sendingInvite ? t('team.sendingInvite') : t('team.inviteMember')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold text-slate-200">{t('team.activeMembers')} ({members.length})</h2>

        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-slate-500 font-medium uppercase tracking-wider">
                <tr>
                  <th className="pb-3 pl-2">{t('common.user', undefined, 'User')}</th>
                  <th className="pb-3">{t('auth.email')}</th>
                  <th className="pb-3">{t('auth.role', undefined, 'Role')}</th>
                  <th className="pb-3">{t('common.joined', undefined, 'Joined')}</th>
                  {isOwnerOrAdmin && <th className="pb-3 text-right pr-2">{t('common.action', undefined, 'Action')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.map((m) => {
                  const memberName = (m.name || '').trim() || (m.email ? m.email.split('@')[0] : 'Team Member');
                  const initial = memberName.charAt(0).toUpperCase() || 'U';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pl-2 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 overflow-hidden flex items-center justify-center font-bold text-amber-300 shrink-0">
                          {m.avatar_url ? (
                            <img
                              src={m.avatar_url}
                              alt={memberName}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            initial
                          )}
                        </div>
                        <span className="font-semibold text-slate-200">{memberName}</span>
                      </td>
                      <td className="py-3 text-slate-400 font-mono text-[11px]">{m.email || '-'}</td>
                      <td className="py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          m.role === 'owner'
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : m.role === 'admin'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : m.role === 'designer'
                            ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{new Date(m.created_at).toLocaleDateString()}</td>
                    {isOwnerOrAdmin && (
                      <td className="py-3 text-right pr-2">
                        {m.role !== 'owner' && (userRole === 'owner' || (userRole === 'admin' && m.role !== 'admin')) ? (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.email)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title={t('team.removeMember')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>{t('team.pendingInvites')} ({invitations.length})</span>
            </h2>
            <span className="text-xs text-slate-500 hidden sm:inline">
              {t('common.inviteAcceptNotice', undefined, 'Invited members sign in with their Google account to accept')}
            </span>
          </div>

          <div className="space-y-3">
            {invitations.map((inv) => {
              const isResending = resendingId === inv.id;
              const isRevoking = revokingId === inv.id;

              return (
                <div
                  key={inv.id}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-200 text-sm">{inv.email}</span>
                      <span className="uppercase text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
                        {inv.role}
                      </span>
                      {inv.email_status === 'sent' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('common.mailSent', undefined, 'Mail Sent')}
                        </span>
                      )}
                      {inv.email_status === 'failed' && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded"
                          title={inv.email_error || undefined}
                        >
                          <AlertCircle className="w-3 h-3" />
                          {t('common.mailFailed', undefined, 'Mail Failed')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {t('common.expires', undefined, 'Expires')}: {new Date(inv.expires_at).toLocaleString()}
                    </p>
                  </div>

                  {isOwnerOrAdmin && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      {/* Re-trigger / Resend Invitation Mail Button */}
                      <button
                        onClick={() => handleResendInvite(inv.id, inv.email)}
                        disabled={isResending || isRevoking}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                        title={t('common.resendInviteTooltip', undefined, 'Resend invitation email with a fresh 7-day token')}
                      >
                        {isResending ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{t('common.loading')}</span>
                          </>
                        ) : (
                          <>
                            <Mail className="w-3.5 h-3.5" />
                            <span>{t('common.resendInvite', undefined, 'Resend Invitation Mail')}</span>
                          </>
                        )}
                      </button>

                      {/* Revoke Invitation Button */}
                      <button
                        onClick={() => handleRevokeInvite(inv.id, inv.email)}
                        disabled={isResending || isRevoking}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                        title={t('common.revoke', undefined, 'Revoke invitation')}
                      >
                        {isRevoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
