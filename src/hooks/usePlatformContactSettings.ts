import { useState, useEffect, useCallback } from 'react';
import { PlatformContactSettings } from '../types/developer';
import { apiFetch } from '../lib/api';

export const FALLBACK_CONTACT_SETTINGS: PlatformContactSettings = {
  whatsapp_number: '60162128913',
  whatsapp_display: '+60 16-212 8913',
  whatsapp_prefill_message: "Hello Event Game Studio! I'm interested in interactive game activations for an upcoming event. Could you share more details?",
  enquiry_email: 'contact@eventgamestudio.com',
  support_hours: 'Mon – Sat, 9:00 AM – 7:00 PM (UTC+8) | <15 min reply during live events',
  office_location: 'Kuala Lumpur, Malaysia (UTC+8)',
};

// Global memory cache to prevent redundant re-fetching across multiple landing components
let cachedSettings: PlatformContactSettings | null = null;
let activeFetchPromise: Promise<PlatformContactSettings> | null = null;

export function usePlatformContactSettings() {
  const [settings, setSettings] = useState<PlatformContactSettings>(() => cachedSettings || FALLBACK_CONTACT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(!cachedSettings);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && cachedSettings) {
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }

    if (activeFetchPromise && !forceRefresh) {
      try {
        const result = await activeFetchPromise;
        setSettings(result);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch contact settings');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    activeFetchPromise = (async () => {
      try {
        const res = await apiFetch('/api/platform/contact-settings');
        if (res.ok) {
          const data = await res.json();
          const resolved = data.settings || data;
          const merged: PlatformContactSettings = {
            ...FALLBACK_CONTACT_SETTINGS,
            ...resolved,
            whatsapp_number: resolved.whatsapp_number || FALLBACK_CONTACT_SETTINGS.whatsapp_number,
            whatsapp_display: resolved.whatsapp_display || FALLBACK_CONTACT_SETTINGS.whatsapp_display,
            whatsapp_prefill_message: resolved.whatsapp_prefill_message || FALLBACK_CONTACT_SETTINGS.whatsapp_prefill_message,
            enquiry_email: resolved.enquiry_email || FALLBACK_CONTACT_SETTINGS.enquiry_email,
            support_hours: resolved.support_hours || FALLBACK_CONTACT_SETTINGS.support_hours,
            office_location: resolved.office_location || FALLBACK_CONTACT_SETTINGS.office_location,
          };
          cachedSettings = merged;
          return merged;
        }
        return cachedSettings || FALLBACK_CONTACT_SETTINGS;
      } catch {
        return cachedSettings || FALLBACK_CONTACT_SETTINGS;
      } finally {
        activeFetchPromise = null;
      }
    })();

    try {
      const finalSettings = await activeFetchPromise;
      setSettings(finalSettings);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch contact settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Derived helpers
  const whatsappNumber = settings.whatsapp_number;
  const whatsappDisplay = settings.whatsapp_display;
  const whatsappPrefill = settings.whatsapp_prefill_message;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappPrefill)}`;
  const enquiryEmail = settings.enquiry_email;
  const mailtoUrl = `mailto:${enquiryEmail}?subject=${encodeURIComponent('Event Game Studio Inquiry')}`;
  const supportHours = settings.support_hours;
  const officeLocation = settings.office_location;

  return {
    settings,
    loading,
    error,
    refresh: () => fetchSettings(true),
    whatsappNumber,
    whatsappDisplay,
    whatsappPrefill,
    whatsappUrl,
    enquiryEmail,
    mailtoUrl,
    supportHours,
    officeLocation,
  };
}
