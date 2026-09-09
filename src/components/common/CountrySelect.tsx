import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  COUNTRIES,
  Country,
  getCountryByCode,
  getDefaultTimezoneForCountry,
  POPULAR_COUNTRY_CODES,
} from '../../lib/countryUtils';
import { Globe, Search, ChevronDown, Check, X, Clock, AlertCircle } from 'lucide-react';

interface CountrySelectProps {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  id?: string;
  showTimezonePreview?: boolean;
  label?: string;
  helperText?: string;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  error = null,
  id = 'organization-country-select',
  showTimezonePreview = true,
  label,
  helperText,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCountry: Country | undefined = useMemo(() => {
    return value ? getCountryByCode(value) : undefined;
  }, [value]);

  const popularCountries: Country[] = useMemo(() => {
    return POPULAR_COUNTRY_CODES.map((code) => getCountryByCode(code)).filter(
      (c): c is Country => Boolean(c)
    );
  }, []);

  const filteredCountries: Country[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
  };

  const defaultTz = selectedCountry ? getDefaultTimezoneForCountry(selectedCountry.code) : null;

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5 font-sans" id={`${id}-wrapper`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-slate-300 flex items-center justify-between"
        >
          <span>
            {label} {required && <span className="text-amber-400">*</span>}
          </span>
          {selectedCountry && (
            <span className="text-[11px] text-slate-400 font-mono">
              ISO: {selectedCountry.code}
            </span>
          )}
        </label>
      )}

      {/* Select Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-all cursor-pointer ${
          disabled
            ? 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            : isOpen
            ? 'bg-slate-950 border border-amber-500 shadow-lg text-slate-100 ring-1 ring-amber-500/20'
            : error
            ? 'bg-slate-950 border border-rose-500 text-slate-100'
            : 'bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          {selectedCountry ? (
            <>
              <span className="text-lg leading-none shrink-0" role="img" aria-label={selectedCountry.name}>
                {selectedCountry.flag}
              </span>
              <span className="font-medium text-slate-100 truncate">
                {selectedCountry.name}
              </span>
              <span className="text-xs text-slate-500 font-mono hidden xs:inline">
                ({selectedCountry.code})
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <Globe className="w-4 h-4 text-slate-600" />
              <span>Select your organization&apos;s country...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedCountry && !disabled && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              title="Clear selection"
              className="p-1 text-slate-500 hover:text-slate-300 rounded-md hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-amber-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          id={`${id}-dropdown`}
          className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-2.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Search bar */}
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by country name, code, or currency..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Popular / Regional Quick Picks */}
          {!searchQuery && (
            <div className="mb-2.5 pb-2.5 border-b border-slate-800/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1.5">
                Popular &amp; Regional
              </div>
              <div className="flex flex-wrap gap-1 px-1">
                {popularCountries.map((c) => {
                  const isCurrent = c.code === value;
                  return (
                    <button
                      key={`popular-${c.code}`}
                      type="button"
                      onClick={() => handleSelect(c.code)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>{c.flag}</span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Countries list */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredCountries.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No matching countries found for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredCountries.map((c) => {
                const isSelected = c.code === value;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c.code)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                        : 'hover:bg-slate-800/80 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-base shrink-0" role="img" aria-label={c.name}>
                        {c.flag}
                      </span>
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {c.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {c.defaultTimezone.split('/')[1]?.replace(/_/g, ' ') || c.defaultTimezone}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 text-rose-400 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Helper text or Timezone preview */}
      {!error && (helperText || (showTimezonePreview && selectedCountry)) && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
          <span>{helperText || 'Used for business registration, default timezone, currency, and tax.'}</span>
          {showTimezonePreview && selectedCountry && defaultTz && (
            <span className="flex items-center gap-1 text-slate-300 font-mono shrink-0 ml-2">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{defaultTz}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
