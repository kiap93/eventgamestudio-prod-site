/**
 * Masks an email address for safe display in user interfaces.
 * Example: 'munjian@outlook.com' -> 'm***@outlook.com'
 * Example: 'kokmj018@gmail.com' -> 'k***@gmail.com'
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.trim().split('@');
  if (local.length <= 1) {
    return `${local}***@${domain}`;
  }
  return `${local[0]}***@${domain}`;
}
