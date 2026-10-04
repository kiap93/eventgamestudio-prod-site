import React, { useState, useEffect, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { PlatformGame } from '../../types/developer';
import { GAME_REGISTRY } from '../../games/registry';
import { getGameTypeIcon } from '../../games';
import { X, Gamepad2, CheckCircle2, AlertCircle, Info, Lock } from 'lucide-react';

interface CreateGameModalProps {
  initialGame?: PlatformGame | null;
  existingGames?: PlatformGame[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (gameData: Partial<PlatformGame>) => Promise<void>;
}

export const CreateGameModal: React.FC<CreateGameModalProps> = ({
  initialGame,
  existingGames = [],
  isOpen,
  onClose,
  onSave,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [gameType, setGameType] = useState<string>('catch-brand');
  const [description, setDescription] = useState<string>('');
  const [iconName, setIconName] = useState<string>('Gamepad2');
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('active');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Set of game types registered by other system games
  const registeredTypeKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of existingGames) {
      if (!initialGame || g.id !== initialGame.id) {
        if (g.game_type) set.add(g.game_type);
      }
    }
    return set;
  }, [existingGames, initialGame]);

  const allAvailableTypes = useMemo(() => Object.keys(GAME_REGISTRY), []);
  const isAllRegistered = useMemo(
    () => !initialGame && allAvailableTypes.every((k) => registeredTypeKeys.has(k)),
    [allAvailableTypes, registeredTypeKeys, initialGame]
  );

  // Slugs used by other games
  const usedSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const g of existingGames) {
      if (!initialGame || g.id !== initialGame.id) {
        if (g.slug) set.add(g.slug.toLowerCase());
      }
    }
    return set;
  }, [existingGames, initialGame]);

  useEffect(() => {
    if (initialGame) {
      setName(initialGame.name || '');
      setSlug(initialGame.slug || '');
      setGameType(initialGame.game_type || 'catch-brand');
      setDescription(initialGame.description || '');
      setIconName(initialGame.icon_name || 'Gamepad2');
      setStatus(initialGame.status || 'active');
    } else {
      // Find the first available game type
      const firstAvailable = allAvailableTypes.find((k) => !registeredTypeKeys.has(k)) || allAvailableTypes[0] || 'catch-brand';
      const def = GAME_REGISTRY[firstAvailable];
      setGameType(firstAvailable);
      setName(def?.name || '');
      setSlug(firstAvailable);
      setDescription(def?.description || '');
      setIconName(def?.iconName || (firstAvailable === 'reaction-tap' ? 'Zap' : firstAvailable === 'memory-match' ? 'Grid3X3' : firstAvailable === 'catch-brand' ? 'ShoppingBasket' : 'Gamepad2'));
      setStatus('active');
    }
    setError(null);
  }, [initialGame, isOpen, allAvailableTypes, registeredTypeKeys]);

  const handleGameTypeSelect = (selectedType: string) => {
    setGameType(selectedType);
    if (GAME_REGISTRY[selectedType]?.isAvailable === false) {
      setStatus('draft');
    }
    if (!initialGame) {
      const def = GAME_REGISTRY[selectedType];
      if (def) {
        setName(def.name);
        setSlug(selectedType);
        setDescription(def.description || '');
        setIconName(def.iconName || (selectedType === 'reaction-tap' ? 'Zap' : selectedType === 'memory-match' ? 'Grid3X3' : selectedType === 'catch-brand' ? 'ShoppingBasket' : 'Gamepad2'));
      }
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!initialGame) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const isSlugConflict = slug.trim() ? usedSlugs.has(slug.trim().toLowerCase()) : false;
  const isTypeConflict = (!initialGame || initialGame.game_type !== gameType) && registeredTypeKeys.has(gameType);
  const isEngineAvailable = GAME_REGISTRY[gameType]?.isAvailable !== false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('developer.titleRequiredError'));
      return;
    }

    if (isTypeConflict) {
      setError(t('developer.gameTypeConflictError'));
      return;
    }

    if (status === 'active' && !isEngineAvailable) {
      setError(`Cannot set status to Active: The engine for "${gameType}" is currently under development. Games without an active engine must remain in "draft" status.`);
      return;
    }

    const cleanSlug = (slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).toLowerCase();
    if (usedSlugs.has(cleanSlug)) {
      setError(t('developer.slugConflictError'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        slug: cleanSlug,
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
              {getGameTypeIcon(gameType, 'w-5 h-5')}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {initialGame ? t('developer.editPlatformGame') : t('developer.registerNewSystemGame')}
              </h3>
              <p className="text-xs text-slate-400">
                {initialGame ? t('developer.updateGameMetadataDesc') : t('developer.registerCanonicalGameDesc')}
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
            <div className="flex items-start space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Banner if all engines are already registered */}
          {isAllRegistered && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-start space-x-2.5">
              <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">{t('developer.allEnginesRegisteredTitle')}</p>
                <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                  {t('developer.allEnginesRegisteredDesc')}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              {t('developer.gameTitleLabel')} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isAllRegistered}
              value={name}
              onChange={handleNameChange}
              placeholder={t('developer.gameTitlePlaceholder')}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                {t('developer.slugLabel')} <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isAllRegistered}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="catch-brand"
                className={`w-full px-3.5 py-2 bg-slate-950 border ${
                  isSlugConflict ? 'border-rose-500 text-rose-300' : 'border-slate-700 text-slate-200'
                } rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50`}
              />
              {isSlugConflict && (
                <p className="text-[10px] text-rose-400 mt-1">{t('developer.slugConflictError')}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                <span>{t('developer.gameEngineTypeLabel')} <span className="text-rose-400">*</span></span>
                {initialGame && <Lock className="w-3 h-3 text-slate-500 inline" />}
              </label>
              <select
                value={gameType}
                disabled={Boolean(initialGame) || isAllRegistered}
                onChange={(e) => handleGameTypeSelect(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {allAvailableTypes.map((typeKey) => {
                  const def = GAME_REGISTRY[typeKey];
                  const isRegistered = registeredTypeKeys.has(typeKey);
                  return (
                    <option
                      key={typeKey}
                      value={typeKey}
                      disabled={isRegistered && (!initialGame || initialGame.game_type !== typeKey)}
                    >
                      {def?.name || typeKey} ({typeKey}) {isRegistered ? t('developer.engineRegisteredSuffix') : t('developer.engineAvailableSuffix')}
                    </option>
                  );
                })}
              </select>
              {isTypeConflict && (
                <p className="text-[10px] text-rose-400 mt-1">{t('developer.gameTypeConflictError')}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              {t('developer.gameDescriptionLabel')}
            </label>
            <textarea
              rows={2}
              disabled={isAllRegistered}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('developer.gameDescriptionPlaceholder')}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                {t('developer.iconNameLabel')}
              </label>
              <input
                type="text"
                disabled={isAllRegistered}
                value={iconName}
                onChange={(e) => setIconName(e.target.value)}
                placeholder="Gamepad2"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                {t('developer.platformStatusLabel')}
              </label>
              <select
                value={status}
                disabled={isAllRegistered}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              >
                <option value="active" disabled={!isEngineAvailable}>
                  {isEngineAvailable ? t('developer.statusActiveAvailable') : t('developer.statusActiveBlocked')}
                </option>
                <option value="draft">{t('developer.statusDraftDevOnly')}</option>
                <option value="archived">{t('developer.statusArchived')}</option>
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
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || isAllRegistered || isTypeConflict || isSlugConflict}
              className="flex items-center space-x-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-emerald-900/30 transition-colors"
            >
              {saving ? (
                <span>{t('common.saving')}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{initialGame ? t('developer.updateGameBtn') : t('developer.registerGameBtn')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
