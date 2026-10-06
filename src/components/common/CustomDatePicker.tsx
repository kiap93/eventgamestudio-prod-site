import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  formatDateDisplay,
  formatDateApi,
  extractDateString,
  getTodayDateString,
  isDateBefore,
  isDateAfter,
} from '../../lib/dateUtils';

export interface CustomDatePickerProps {
  /**
   * Canonical internal value: strictly YYYY-MM-DD (e.g. "2026-05-10")
   */
  value: string;
  /**
   * Emits strictly YYYY-MM-DD string to parent state
   */
  onChange: (dateStr: string) => void;
  /**
   * Minimum selectable date in YYYY-MM-DD
   */
  min?: string;
  /**
   * Maximum selectable date in YYYY-MM-DD
   */
  max?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Custom DatePicker for Event Game Studio.
 *
 * Guarantees:
 * 1. VISUAL DISPLAY is strictly DD/MM/YYYY (e.g., 10/05/2026 = 10 May 2026)
 *    regardless of user browser, OS locale, or system settings.
 * 2. INTERNAL & API STORAGE is strictly canonical YYYY-MM-DD (e.g., 2026-05-10).
 * 3. Does NOT rely on browser's native <input type="date"> which renders MM/DD/YYYY in US locales.
 * 4. Renders the interactive calendar popover via React Portal directly into document.body
 *    with fixed positioning to prevent clipping by overflow: hidden or overflow: auto containers.
 */
export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  readOnly = false,
  required = false,
  id,
  name,
  placeholder = 'DD/MM/YYYY',
  className = '',
  ariaLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Normalize canonical internal value (YYYY-MM-DD)
  const canonicalYmd = extractDateString(value);

  // Local text input state for typing (DD/MM/YYYY)
  const [textInput, setTextInput] = useState(() => (canonicalYmd ? formatDateDisplay(canonicalYmd) : ''));

  // Calendar View month & year (1-based month: 1 = Jan, 12 = Dec)
  const defaultToday = getTodayDateString();
  const defaultYear = defaultToday ? parseInt(defaultToday.split('-')[0], 10) : new Date().getFullYear();
  const defaultMonth = defaultToday ? parseInt(defaultToday.split('-')[1], 10) : new Date().getMonth() + 1;

  const initialYear = canonicalYmd ? parseInt(canonicalYmd.split('-')[0], 10) : defaultYear;
  const initialMonth = canonicalYmd ? parseInt(canonicalYmd.split('-')[1], 10) : defaultMonth;

  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth);

  // Floating Popover Fixed Coordinates
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 9999,
    minWidth: '18rem',
    visibility: 'hidden',
  });

  // Calculate and update the fixed position of the calendar popover relative to the input container
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const measuredHeight = popoverRef.current?.offsetHeight || 350;
    const measuredWidth = popoverRef.current?.offsetWidth || 288;
    const gap = 6;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow < measuredHeight && spaceAbove > spaceBelow) {
      // Open upwards if not enough room below and more space above
      top = Math.max(8, rect.top - measuredHeight - gap);
    } else {
      // Open downwards below the input
      top = rect.bottom + gap;
      // Clamp if it still overflows viewport bottom
      if (top + measuredHeight > viewportHeight - 8) {
        top = Math.max(8, viewportHeight - measuredHeight - 8);
      }
    }

    // Horizontal position aligned with left of container, clamped to viewport edges
    let left = rect.left;
    if (left + measuredWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - measuredWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    setPopoverStyle({
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      zIndex: 9999,
      minWidth: '18rem',
      visibility: 'visible',
    });
  }, []);

  // Sync display text when value changes externally
  useEffect(() => {
    const formatted = canonicalYmd ? formatDateDisplay(canonicalYmd) : '';
    setTextInput(formatted);
    if (canonicalYmd) {
      const parts = canonicalYmd.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10));
      }
    }
  }, [canonicalYmd]);

  // Recalculate position when opened, and attach scroll and resize listeners
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    // Capture scroll events from any ancestor (modal dialog, overflow containers, body)
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Handle outside clicks and Escape key to close the popover
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

  const openCalendar = () => {
    if (disabled || readOnly) return;
    if (canonicalYmd) {
      const parts = canonicalYmd.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10));
      }
    }
    setIsOpen(true);
  };

  // Navigate calendar month
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Helper to format 2 digits
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Select a day cell
  const handleSelectDay = (day: number) => {
    if (disabled || readOnly) return;
    const selectedYmd = `${viewYear}-${pad(viewMonth)}-${pad(day)}`;

    if (min && isDateBefore(selectedYmd, min)) return;
    if (max && isDateAfter(selectedYmd, max)) return;

    onChange(selectedYmd);
    setTextInput(formatDateDisplay(selectedYmd));
    setIsOpen(false);
  };

  // Select "Today"
  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || readOnly) return;
    const today = getTodayDateString();
    if (min && isDateBefore(today, min)) return;
    if (max && isDateAfter(today, max)) return;

    onChange(today);
    setTextInput(formatDateDisplay(today));
    setIsOpen(false);
  };

  // Direct typing handler (accepts DD/MM/YYYY)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputVal = e.target.value;

    // Allow typing numbers and slashes only
    inputVal = inputVal.replace(/[^\d/]/g, '');

    // Auto-insert slash after 2 digits and 5 digits if user is typing forward
    if (inputVal.length === 2 && !inputVal.includes('/') && textInput.length < 2) {
      inputVal = inputVal + '/';
    } else if (inputVal.length === 5 && inputVal.indexOf('/') === 2 && inputVal.lastIndexOf('/') === 2 && textInput.length < 5) {
      inputVal = inputVal + '/';
    }

    setTextInput(inputVal);

    // If matches complete DD/MM/YYYY
    const dmyMatch = inputVal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);

      if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2099) {
        // Check days in that specific month
        const maxDaysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (d <= maxDaysInMonth) {
          const ymd = `${y}-${pad(m)}-${pad(d)}`;
          if ((!min || !isDateBefore(ymd, min)) && (!max || !isDateAfter(ymd, max))) {
            onChange(ymd);
            setViewYear(y);
            setViewMonth(m);
          }
        }
      }
    }
  };

  // Reset display text if left in invalid or incomplete state
  const handleInputBlur = () => {
    if (canonicalYmd) {
      setTextInput(formatDateDisplay(canonicalYmd));
    } else {
      setTextInput('');
    }
  };

  // Build calendar matrix for viewYear / viewMonth
  // Using UTC to prevent local timezone offsets from shifting calendar days
  const firstDayOfMonthUtc = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
  // Monday is 0, Sunday is 6
  const startingDayOfWeek = (firstDayOfMonthUtc.getUTCDay() + 6) % 7;
  const daysInCurrentMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth - 1, 0)).getUTCDate();

  const calendarDays: Array<{
    dayNumber: number;
    isCurrentMonth: boolean;
    ymd: string;
    isDisabled: boolean;
    isSelected: boolean;
    isToday: boolean;
  }> = [];

  const todayYmd = getTodayDateString();

  // Previous month trailing days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevM = viewMonth === 1 ? 12 : viewMonth - 1;
    const prevY = viewMonth === 1 ? viewYear - 1 : viewYear;
    const ymd = `${prevY}-${pad(prevM)}-${pad(d)}`;
    calendarDays.push({
      dayNumber: d,
      isCurrentMonth: false,
      ymd,
      isDisabled: true,
      isSelected: false,
      isToday: ymd === todayYmd,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const ymd = `${viewYear}-${pad(viewMonth)}-${pad(d)}`;
    const isBeforeMin = Boolean(min && isDateBefore(ymd, min));
    const isAfterMax = Boolean(max && isDateAfter(ymd, max));
    const isDisabled = disabled || readOnly || isBeforeMin || isAfterMax;
    const isSelected = Boolean(canonicalYmd && canonicalYmd === ymd);

    calendarDays.push({
      dayNumber: d,
      isCurrentMonth: true,
      ymd,
      isDisabled,
      isSelected,
      isToday: ymd === todayYmd,
    });
  }

  // Next month leading days to complete grid (up to 35 or 42 cells)
  const remaining = (7 - (calendarDays.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
    const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
    const ymd = `${nextY}-${pad(nextM)}-${pad(d)}`;
    calendarDays.push({
      dayNumber: d,
      isCurrentMonth: false,
      ymd,
      isDisabled: true,
      isSelected: false,
      isToday: ymd === todayYmd,
    });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          id={id}
          name={name}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          value={textInput}
          placeholder={placeholder}
          aria-label={ariaLabel || 'Select Date (DD/MM/YYYY)'}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onClick={openCalendar}
          className={`w-full px-3 py-2.5 bg-slate-950 border rounded-xl text-slate-100 text-xs focus:outline-none transition-all pr-9 font-mono ${
            disabled
              ? 'opacity-60 cursor-not-allowed border-slate-800/60 text-slate-400'
              : readOnly
                ? 'cursor-default border-slate-800 text-slate-300'
                : isOpen
                  ? 'border-amber-500 ring-1 ring-amber-500/20 cursor-text'
                  : 'border-slate-800 focus:border-amber-500 hover:border-slate-700 cursor-pointer'
          } ${className}`}
        />

        {/* Calendar Trigger Icon */}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || readOnly}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && !readOnly) {
              if (isOpen) {
                setIsOpen(false);
              } else {
                openCalendar();
              }
            }
          }}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
            disabled || readOnly
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800/60 cursor-pointer'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive Calendar Popover Rendered via Portal to document.body */}
      {isOpen && !disabled && !readOnly && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="w-72 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-3.5 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            {/* Header: Month & Year with Navigation */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-100">
                  {MONTH_NAMES[viewMonth - 1]}
                </span>
                <span className="text-xs font-bold text-amber-400 font-mono">
                  {viewYear}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous Month"
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next Month"
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  aria-label="Close Calendar"
                  className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Weekday Labels (Mon - Sun) */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {WEEKDAY_NAMES.map((wName) => (
                <div key={wName} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider py-1">
                  {wName}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, index) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="h-8 flex items-center justify-center text-[11px] text-slate-700 select-none"
                    >
                      {cell.dayNumber}
                    </div>
                  );
                }

                return (
                  <button
                    key={cell.ymd}
                    type="button"
                    disabled={cell.isDisabled}
                    onClick={() => handleSelectDay(cell.dayNumber)}
                    className={`h-8 w-full rounded-lg text-xs font-medium transition-all flex items-center justify-center relative cursor-pointer ${
                      cell.isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                        : cell.isDisabled
                          ? 'text-slate-700 opacity-40 cursor-not-allowed'
                          : cell.isToday
                            ? 'border border-amber-500/60 text-amber-300 hover:bg-slate-800'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {cell.dayNumber}
                    {cell.isToday && !cell.isSelected && (
                      <span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-1" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Popover Footer: Today shortcut & DD/MM/YYYY reminder */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-[10px] text-slate-500 font-mono">Format: DD/MM/YYYY</span>
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-amber-500/10"
              >
                Today
              </button>
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
};
