import React, { useState, useEffect } from 'react';
import { PlatformGame } from '../../types/developer';
import { GAME_REGISTRY } from '../../games/registry';
import { X, Gamepad2, Layers, CheckCircle2, AlertCircle } from 'lucide-react';

interface CreateGameModalProps {
  initialGame?: PlatformGame | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (gameData: Partial<PlatformGame>) => Promise<void>;
}

export const CreateGameModal: React.FC<CreateGameModalProps> = ({
  initialGame,
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [gameType, setGameType] = useState<string>('catch-brand');
  const [description, setDescription] = useState<string>('');
  const [iconName, setIconName] = useState<string>('Gamepad2');
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('active');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialGame) {
      setName(initialGame.name || '');
      setSlug(initialGame.slug || '');
      setGameType(initialGame.game_type || 'catch-brand');
      setDescription(initialGame.description || '');
      setIconName(initialGame.icon_name || 'Gamepad2');
      setStatus(initialGame.status || 'active');
    } else {
      setName('');
      setSlug('');
      setGameType('catch-brand');
      setDescription('');
      setIconName('Gamepad2');
      setStatus('active');
    }
    setError(null);
  }, [initialGame, isOpen]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!initialGame) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Game name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        game_type: gameType,
        description: description.trim() || null,
        icon_name: iconName,
        status,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save game');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {initialGame ? 'Edit Platform Game' : 'Register New Platform Game'}
              </h3>
              <p className="text-xs text-slate-400">
                Configure core game metadata and schema definition
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Game Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Durian Catcher, Memory Match"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Slug <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="durian-catcher"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Game Engine / Type <span className="text-rose-400">*</span>
              </label>
              <select
                value={gameType}
                onChange={(e) => setGameType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {Object.keys(GAME_REGISTRY).map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {GAME_REGISTRY[typeKey]?.name || typeKey} ({typeKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the game mechanic and player experience..."
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Icon Name
              </label>
              <input
                type="text"
                value={iconName}
                onChange={(e) => setIconName(e.target.value)}
                placeholder="Gamepad2"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Platform Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="active">Active (Available to Orgs)</option>
                <option value="draft">Draft (Developer Only)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-lg shadow-emerald-900/30 transition-colors"
            >
              {saving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{initialGame ? 'Update Game' : 'Register Game'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
