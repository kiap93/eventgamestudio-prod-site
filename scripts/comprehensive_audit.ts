import fs from 'fs';
import path from 'path';

// Load protected terms
const PROTECTED_TERMS = new Set([
  'Event Game Studio',
  'EventGameStudio',
  'Catch The Brand',
  'Catch the Brand',
  'Brand Memory Match',
  'Formula Reaction Lights',
  'Reaction Time',
  'Event Trivia Speed Quiz',
  'Speed Quiz',
  'RM',
  'MYR',
  'USD',
  'SGD',
  'Stripe',
  'HitPay',
  'DuitNow',
  'Asia/Singapore',
  'UTC+8',
  'Google',
  'Gmail',
  'Resend',
  'PostgreSQL',
  'Supabase',
  'Cloudflare',
  'Phaser',
  'React',
  'Tailwind',
  'Vite',
]);

const TECHNICAL_IDENTIFIERS = new Set([
  'ID', 'UUID', 'PNG', 'JPG', 'JPEG', 'SVG', 'WEBP', 'MP3', 'WAV', 'JSON',
  'CSS', 'HTML', 'API', 'URL', 'QR', 'HTTP', 'HTTPS', 'OK', 'px', 'ms', 's',
  'rem', 'em', 'dvh', 'vh', 'vw', '2D', '3D', 'F1', 'UI', 'UX', 'AI', 'PRO',
  'VIP', 'LIVE', 'PAID', 'PENDING', 'DRAFT', 'COMPLETED', 'CANCELLED', 'EXPIRED',
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
  'true', 'false', 'null', 'undefined', 'NaN',
  'x', 'y', 'w', 'h', 'min', 'max', 'avg',
  'owner', 'admin', 'designer', 'viewer', 'member',
  'catch-brand', 'memory-match', 'reaction-time', 'speed-quiz',
  'default', 'carnival', 'christmas', 'cny', 'halloween', 'mango',
]);

export interface Finding {
  file: string;
  line: number;
  type: 'JSX_TEXT' | 'PLACEHOLDER' | 'TITLE' | 'ARIA_LABEL' | 'ALT_TEXT';
  raw: string;
}

function isIgnored(str: string): boolean {
  const clean = str.trim();
  if (!clean || clean.length < 2) return true;
  if (/^[\d\s.,\/#!$%\^&\*;:{}=\-_`~()@+?><\[\]'\"|\\•—–]+$/.test(clean)) return true;
  if (PROTECTED_TERMS.has(clean)) return true;
  if (TECHNICAL_IDENTIFIERS.has(clean)) return true;
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('./')) return true;
  if (clean.startsWith('&') && clean.endsWith(';')) return true;
  if (clean.includes('${') || clean.includes('`')) return true;
  // CSS classes or hex colors
  if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return true;
  if (clean.includes('className') || clean.includes('style=')) return true;
  // Code statements
  if (/^(const|let|var|function|return|import|export|interface|type)\s/.test(clean)) return true;
  // Pure numbers with units like 100px or 10s
  if (/^\d+(\.\d+)?(px|%|rem|em|s|ms|deg|vh|vw|dvh)$/.test(clean)) return true;
  return false;
}

export function scanSourceFile(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and import lines
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('console.')
    ) {
      continue;
    }

    // 1. Check for JSX Text between > and <
    const jsxMatches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const match of jsxMatches) {
      const text = match[1].trim();
      if (!text || isIgnored(text)) continue;
      // Skip if it contains code constructs or interpolation
      if (text.includes('=>') || text.includes('Promise<') || text.includes('Array<')) continue;
      if (/[a-zA-Z]{2,}/.test(text)) {
        findings.push({
          file: filePath,
          line: i + 1,
          type: 'JSX_TEXT',
          raw: text,
        });
      }
    }

    // 2. Check for placeholder="..." without {t(
    const placeholderMatch = line.match(/placeholder=["']([^"']+)["']/);
    if (placeholderMatch) {
      const text = placeholderMatch[1].trim();
      if (!isIgnored(text) && !text.startsWith('{')) {
        findings.push({
          file: filePath,
          line: i + 1,
          type: 'PLACEHOLDER',
          raw: text,
        });
      }
    }

    // 3. Check for title="..." without {t(
    const titleMatch = line.match(/\btitle=["']([^"']+)["']/);
    if (titleMatch) {
      const text = titleMatch[1].trim();
      if (!isIgnored(text) && !text.startsWith('{')) {
        findings.push({
          file: filePath,
          line: i + 1,
          type: 'TITLE',
          raw: text,
        });
      }
    }

    // 4. Check for aria-label="..." without {t(
    const ariaMatch = line.match(/aria-label=["']([^"']+)["']/);
    if (ariaMatch) {
      const text = ariaMatch[1].trim();
      if (!isIgnored(text) && !text.startsWith('{')) {
        findings.push({
          file: filePath,
          line: i + 1,
          type: 'ARIA_LABEL',
          raw: text,
        });
      }
    }

    // 5. Check for alt="..." without {t(
    const altMatch = line.match(/\balt=["']([^"']+)["']/);
    if (altMatch) {
      const text = altMatch[1].trim();
      if (!isIgnored(text) && !text.startsWith('{') && text.length > 2) {
        findings.push({
          file: filePath,
          line: i + 1,
          type: 'ALT_TEXT',
          raw: text,
        });
      }
    }
  }

  return findings;
}

function getAllFiles(dir: string, ext = '.tsx'): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllFiles(full, ext));
    } else if (entry.name.endsWith(ext) && !entry.name.endsWith('.test.tsx')) {
      results.push(full);
    }
  }
  return results;
}

const files = getAllFiles('src');
console.log(`Scanning ${files.length} tsx files in src/...`);

const allFindings: Record<string, Finding[]> = {};
let totalFindings = 0;

for (const f of files) {
  const fileFindings = scanSourceFile(f);
  if (fileFindings.length > 0) {
    allFindings[f] = fileFindings;
    totalFindings += fileFindings.length;
  }
}

console.log(`\nFound ${totalFindings} potential hardcoded user-facing strings across ${Object.keys(allFindings).length} files.`);
for (const [file, items] of Object.entries(allFindings)) {
  console.log(`\n📄 ${file} (${items.length} items):`);
  items.slice(0, 10).forEach(it => {
    console.log(`  L${it.line} [${it.type}]: "${it.raw}"`);
  });
  if (items.length > 10) {
    console.log(`  ... and ${items.length - 10} more`);
  }
}
