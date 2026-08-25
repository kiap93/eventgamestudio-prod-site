import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { Users, Mail, UserPlus, Shield, Trash2, Copy, Check, Clock, ShieldCheck } from 'lucide-react';

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
}

export const TeamMembersPage: React.FC = () => {
  const { currentOrganization, token } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'designer' | 'viewer'>('designer');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      if (data.emailStatus === 'sent') {
        setMessage({
          type: 'success',
          text: `Invitation email successfully sent to ${inviteEmail} via official Gmail API!`,
        });
      } else if (data.emailStatus === 'failed') {
        setMessage({
          type: 'error',
          text: `Invitation created, but failed to deliver email (${data.emailError || 'Gmail API error'}). Share link manually: ${window.location.origin}${data.inviteUrl}`,
        });
      } else {
        setMessage({
          type: 'success',
          text: `Invitation generated for ${inviteEmail}! Share link: ${window.location.origin}${data.inviteUrl}`,
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
              <h1 className="text-2xl font-bold tracking-tight">Team Members & Access</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Collaborate with staff on game design, custom assets, and settings for {currentOrganization?.name}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">Your Role:</span>
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

      {/* Invite Staff Card */}
      {isOwnerOrAdmin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <UserPlus className="w-5 h-5 text-amber-400" />
            <span>Invite Company Staff Member</span>
          </div>

          <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-slate-400 mb-1">Staff Email Address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Assign Role</label>
              <select
                value={inviteRole}
                onChange={(e: any) => setInviteRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="admin">Admin (Full Control)</option>
                <option value="designer">Designer (Edit Assets & Physics)</option>
                <option value="viewer">Viewer (Read-only)</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={sendingInvite || !inviteEmail.trim()}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50"
              >
                {sendingInvite ? 'Generating...' : 'Send Invitation'}
              </button>
            </div>
          </form>

          <p className="text-[11px] text-slate-500">
            Invitations create an expiring token valid for 7 days. The staff member must sign in with their matching Google account email to accept.
          </p>
        </div>
      )}

      {/* Active Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold text-slate-200">Active Organization Members ({members.length})</h2>

        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading team members...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-slate-500 font-medium uppercase tracking-wider">
                <tr>
                  <th className="pb-3 pl-2">User</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Joined</th>
                  {isOwnerOrAdmin && <th className="pb-3 text-right pr-2">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pl-2 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 overflow-hidden flex items-center justify-center font-bold text-amber-300">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          m.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="font-semibold text-slate-200">{m.name}</span>
                    </td>
                    <td className="py-3 text-slate-400">{m.email}</td>
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
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <span>Pending Invitations ({invitations.length})</span>
          </h2>

          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{inv.email}</span>
                    <span className="uppercase text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">
                      {inv.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Expires: {new Date(inv.expires_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
