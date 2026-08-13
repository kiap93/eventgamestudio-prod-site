import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Building2, Sparkles, ArrowRight, Shield } from 'lucide-react';

export const CreateOrganizationPage: React.FC = () => {
  const { createOrganization, logout, currentUser } = useAuth();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await createOrganization(name.trim(), logoUrl.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Create Organization</h2>
              <p className="text-xs text-slate-400">Set up your company workspace</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Organization / Company Name <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Games Studio, Durian Delights"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Logo Image URL (Optional)
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-200 font-medium">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>You will be assigned as Organization Owner</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              As owner, you can invite team members (admins, designers, viewers), customize backgrounds, items, and basket physics, and manage settings.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg active:scale-[0.99] disabled:opacity-50"
          >
            <span>{loading ? 'Creating...' : 'Create Workspace & Launch Studio'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
