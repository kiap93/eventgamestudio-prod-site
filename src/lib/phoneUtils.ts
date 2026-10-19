/**
 * Phone Number Normalization and WhatsApp Link Generator (Client Side)
 */

export interface PhoneNormalizationResult {
  valid: boolean;
  normalized?: string;   // E.164 with leading '+', e.g. '+60123456789'
  digitsOnly?: string;   // digits without '+', e.g. '60123456789'
  formatted?: string;    // formatted for readability, e.g. '+60 12-345 6789'
  countryCode?: string;  // e.g. '60'
  error?: string;
}

export function normalizePhoneNumber(
  rawPhone: string | null | undefined,
  defaultCountryCode: string = '60' // Default to Malaysia (+60)
): PhoneNormalizationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }

  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return { valid: false, error: 'Phone number cannot be empty.' };
  }

  const cleaned = trimmed.replace(/[\s\-\(\)\.]/g, '');

  let digitsWithPlus = '';
  const cleanDefaultCode = defaultCountryCode.replace(/\D/g, '') || '60';

  if (cleaned.startsWith('+')) {
    const withoutPlus = cleaned.slice(1);
    if (!/^\d+$/.test(withoutPlus)) {
      return { valid: false, error: 'Phone number contains invalid non-numeric characters.' };
    }
    digitsWithPlus = `+${withoutPlus}`;
  } else if (cleaned.startsWith('00')) {
    const without00 = cleaned.slice(2);
    if (!/^\d+$/.test(without00)) {
      return { valid: false, error: 'Phone number contains invalid non-numeric characters.' };
    }
    digitsWithPlus = `+${without00}`;
  } else if (cleaned.startsWith('0')) {
    const rest = cleaned.slice(1);
    if (!/^\d+$/.test(rest)) {
      return { valid: false, error: 'Phone number contains invalid non-numeric characters.' };
    }
    digitsWithPlus = `+${cleanDefaultCode}${rest}`;
  } else if (/^\d+$/.test(cleaned)) {
    if (cleaned.startsWith(cleanDefaultCode) && cleaned.length >= 10) {
      digitsWithPlus = `+${cleaned}`;
    } else {
      digitsWithPlus = `+${cleanDefaultCode}${cleaned}`;
    }
  } else {
    return { valid: false, error: 'Phone number contains invalid characters.' };
  }

  const digitsOnly = digitsWithPlus.slice(1);

  if (digitsOnly.length < 8) {
    return { valid: false, error: 'Phone number is too short (minimum 8 digits required for E.164).' };
  }
  if (digitsOnly.length > 15) {
    return { valid: false, error: 'Phone number exceeds standard maximum length of 15 digits.' };
  }

  if (digitsOnly.startsWith('0')) {
    return { valid: false, error: 'Invalid international country code in phone number.' };
  }

  let formatted = digitsWithPlus;
  if (digitsWithPlus.startsWith('+60') && digitsOnly.length >= 10) {
    const prefix = digitsWithPlus.slice(0, 3);
    const mid = digitsWithPlus.slice(3, 5);
    const rest = digitsWithPlus.slice(5);
    formatted = `${prefix} ${mid}-${rest}`;
  } else if (digitsWithPlus.startsWith('+65') && digitsOnly.length === 10) {
    formatted = `${digitsWithPlus.slice(0, 3)} ${digitsWithPlus.slice(3, 7)} ${digitsWithPlus.slice(7)}`;
  }

  return {
    valid: true,
    normalized: digitsWithPlus,
    digitsOnly,
    formatted,
    countryCode: cleanDefaultCode,
  };
}

export interface BuildWhatsAppMessageOptions {
  recipientName?: string | null;
  companyName?: string | null;
  invitationUrl: string;
}

export function buildWhatsAppInvitationMessage(options: BuildWhatsAppMessageOptions): string {
  const { recipientName, companyName, invitationUrl } = options;
  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : 'Hello,';
  const orgText = companyName?.trim() ? `for *${companyName.trim()}*` : 'for your team';

  return `${greeting}

You're invited to try *EventGameStudio* ${orgText}!

EventGameStudio lets you create and manage interactive branded event mini-games, real-time leaderboards, and custom attendee activations.

Access your official invitation and set up your workspace here:
${invitationUrl}

If you have any questions, feel free to reply directly to this message.

Best regards,
EventGameStudio Team
https://eventgamestudio.com`;
}

export function buildWhatsAppClickToChatUrl(
  normalizedPhone: string,
  messageText: string
): string {
  const digitsOnly = normalizedPhone.replace(/\D/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(messageText)}`;
}
