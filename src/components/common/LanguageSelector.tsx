import React, { useState, useRef, useEffect } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { SupportedLanguage } from '../../lib/i18n/languages';
import { Globe, Check, ChevronDown } from 'lucide-react';

export interface LanguageSelectorProps {
  variant?: 'standard' | 'compact' | 'game-hud';
  className?: string;
  onLanguageChange?: (lang: SupportedLanguage) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'standard',
  className = '',
  onLanguageChange,
}) => {
  const { language, setLanguage, supportedLanguages, currentLanguageConfig } = useLocalization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    onLanguageChange?.(code);
    setIsOpen(false);
  };

  // 1. GAME-HUD VARIANT (Minimalist, dark-glass style for in-game and preview overlays)
  if (variant === 'game-hud') {
    return (
      <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Change language"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-black/60 hover:bg-black/80 text-white/90 border border-white/20 backdrop-blur-md transition-all shadow-md cursor-pointer select-none"
        >
          <span className="text-sm">{currentLanguageConfig.flag}</span>
          <span className="hidden sm:inline">{currentLanguageConfig.nativeName}</span>
          <span className="sm:hidden">{currentLanguageConfig.code.split('-')[0].toUpperCase()}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-white/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-slate-900/95 border border-white/20 shadow-2xl backdrop-blur-lg z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
            {supportedLanguages.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{lang.flag}</span>
                    <span className="font-semibold">{lang.nativeName}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2. COMPACT VARIANT (Minimal pill for headers & toolbars)
  if (variant === 'compact') {
    return (
      <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Change language"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentLanguageConfig.nativeName}</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-slate-900 border border-slate-700 shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
            {supportedLanguages.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 text-amber-400 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{lang.flag}</span>
                    <span>{lang.nativeName}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 3. STANDARD VARIANT (Dashboard layout header)
  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select language"
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 border border-slate-700/60 hover:border-slate-600 transition-all cursor-pointer"
      >
        <span className="text-sm">{currentLanguageConfig.flag}</span>
        <span className="font-semibold text-slate-200">{currentLanguageConfig.nativeName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
            Language / 语言 / Bahasa
          </div>
          {supportedLanguages.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/10 text-amber-400 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{lang.flag}</span>
                  <div className="text-left">
                    <p className="font-semibold leading-tight">{lang.nativeName}</p>
                    <p className="text-[10px] text-slate-400">{lang.name}</p>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
