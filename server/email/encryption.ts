import crypto from 'node:crypto';

/**
 * Derives a 32-byte AES-256 key from the configured encryption key string.
 */
function deriveKey(secretKey?: string, env?: Record<string, any>): Buffer {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const rawKey =
    secretKey ||
    env?.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    procEnv.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    env?.JWT_SECRET ||
    procEnv.JWT_SECRET ||
    'default-egs-gmail-encryption-key-salt-32b';

  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a sensitive string (e.g. Google OAuth refresh token) using AES-256-GCM.
 * Output format: "iv_hex:authTag_hex:ciphertext_hex"
 */
export async function encryptRefreshToken(
  plainText: string,
  secretKey?: string,
  env?: Record<string, any>
): Promise<string> {
  if (!plainText) return '';
  const key = deriveKey(secretKey, env);
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an encrypted token formatted as "iv_hex:authTag_hex:ciphertext_hex".
 */
export async function decryptRefreshToken(
  encryptedToken: string,
  secretKey?: string,
  env?: Record<string, any>
): Promise<string> {
  if (!encryptedToken) return '';
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = deriveKey(secretKey, env);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
