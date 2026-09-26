import crypto from 'node:crypto';

/**
 * Validates password complexity:
 * - At least 8 characters
 * - Max 128 characters (prevents DoS via enormous inputs)
 * - Contains at least one letter
 * - Contains at least one number
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Validates and normalizes email address:
 * - Trims whitespace
 * - Converts to lowercase
 * - Enforces standard email syntax
 * - Length check (max 255 characters)
 */
export function validateEmail(email: string): { valid: boolean; normalized: string; error?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, normalized: '', error: 'Email address is required' };
  }
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed) || trimmed.length > 255) {
    return { valid: false, normalized: '', error: 'Please enter a valid email address' };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * Hashes a plaintext password using PBKDF2 with 100,000 iterations of SHA-256 and a 16-byte random salt.
 * Output format: pbkdf2$100000$<saltHex>$<derivedKeyHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha256', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`pbkdf2$100000$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Constant-time verification of plaintext password against stored PBKDF2 hash.
 */
export async function verifyPassword(password: string, storedHash?: string | null): Promise<boolean> {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }
  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedKey = Buffer.from(parts[3], 'hex');
  if (isNaN(iterations) || !salt || expectedKey.length === 0) {
    return false;
  }
  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, iterations, expectedKey.length, 'sha256', (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(derivedKey, expectedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Masks an email address for safe display in user interfaces without exposing full PII.
 * Example: 'kokmj018@gmail.com' -> 'k***8@gmail.com'
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
