import fs from 'fs';
import path from 'path';

// Known non-translatable tokens, technical keywords, and protected brand names
const PROTECTED_TERMS = new Set([
  'Event Game Studio', 'EventGameStudio', 'Catch The Brand', 'Catch the Brand',
  'Brand Memory Match', 'Formula Reaction Lights', 'Reaction Time', 'Event Trivia Speed Quiz',
  'Speed Quiz', 'RM', 'MYR', 'USD', 'SGD', 'Stripe', 'HitPay', 'DuitNow', 'Asia/Singapore',
  'UTC+8', 'Google', 'Gmail', 'Resend', 'PostgreSQL', 'Supabase', 'Cloudflare', 'Phaser',
  'React', 'Tailwind', 'Vite'
]);

const TECHNICAL_IDENTIFIERS = new Set([
  'ID', 'UUID', 'PNG', 'JPG', 'JPEG', 'SVG', 'WEBP', 'MP3', 'WAV', 'JSON', 'CSS', 'HTML',
  'API', 'URL', 'QR', 'HTTP', 'HTTPS', 'OK', 'px', 'ms', 's', 'rem', 'em', 'dvh', 'vh', 'vw',
  '2D', '3D', 'F1', 'UI', 'UX', 'AI', 'PRO', 'VIP', 'LIVE', 'PAID', 'PENDING', 'DRAFT',
  'COMPLETED', 'CANCELLED', 'EXPIRED', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD',
  'true', 'false', 'null', 'undefined', 'NaN', 'x', 'y', 'w', 'h', 'min', 'max', 'avg',
  'owner', 'admin', 'designer', 'viewer', 'member', 'developer_admin', 'catch-brand', 'memory-match',
  'reaction-time', 'speed-quiz', 'default', 'carnival', 'christmas', 'cny', 'halloween', 'mango',
  'Promise', 'void', 'string', 'number', 'boolean', 'any', 'never', 'unknown', 'Record', 'Partial',
  'Gamepad2', 'EVENTGAMESTUDIO'
]);

export interface Finding {
  file: string;
  line: number;
  type: string;
  text: string;
  batch: string;
}

function assignBatch(filePath: string): string {
  if (
    filePath.includes('/layout/') ||
    filePath.includes('/auth/') ||
    filePath.includes('/common/') ||
    filePath.includes('/landing/') ||
    filePath.includes('/seo/') ||
    filePath.includes('/contact/') ||
    filePath.endsWith('App.tsx')
  ) {
    return 'Batch 1: Shared Layout, Navigation, Auth, Common UI';
  }

  if (
    filePath.includes('/sales/') ||
    filePath.includes('/developer/') ||
    filePath.includes('/org/')
  ) {
    return 'Batch 2: Dashboard, Org Settings, Sales Partner, Admin';
  }

  if (
    filePath.includes('/events/') ||
    filePath.includes('/wallet/') ||
    filePath.includes('/notifications/')
  ) {
    return 'Batch 3: Events, Payments, Wallet, Invoices, Notifications';
  }

  if (
    filePath.includes('/studio/') ||
    filePath.includes('/games/') ||
    filePath.includes('/game/') ||
    filePath.includes('ArcadeUI.tsx') ||
    filePath.includes('/onboarding/')
  ) {
    return 'Batch 4: Game Studio, Editors, Themes, Gameplay';
  }

  return 'Batch 5: Edge cases & Other';
}

function isFalsePositive(rawText: string, line: string): boolean {
  const clean = rawText.trim();
  if (clean.length < 2) return true;
  // Pure symbols or numbers
  if (/^[\d\s.,\/#!$%\^&\*;:{}=\-_`~()@+?><\[\]'\"|\\•—–]+$/.test(clean)) return true;
  if (PROTECTED_TERMS.has(clean)) return true;
  if (TECHNICAL_IDENTIFIERS.has(clean)) return true;
  if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('./')) return true;
  if (clean.startsWith('&') && clean.endsWith(';')) return true;
  if (clean.includes('${') || clean.includes('`')) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(clean)) return true;
  if (clean.includes('className') || clean.includes('style=')) return true;
  // Code statements
  if (/^(const|let|var|function|return|import|export|interface|type)\s/.test(clean)) return true;
  // Pure numbers with units like 100px or 10s
  if (/^\d+(\.\d+)?(px|%|rem|em|s|ms|deg|vh|vw|dvh)$/.test(clean)) return true;
  // Type parameters or arrow functions
  if (clean.includes('=>') || clean.includes('Promise<') || clean.includes('Array<') || clean.includes('Record<') || clean.includes('Partial<')) return true;
  // Comparisons like "< 0 && foo"
  if (/^[=<>&|\s\d]+$/.test(clean)) return true;
  if (clean.includes('&&') || clean.includes('||')) return true;
  if (/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(clean)) return true; // object access like i.points or t.min_days

  // Line context checks
  if (line.includes('//') && line.indexOf('//') < line.indexOf(rawText)) return true;
  if (line.includes('import ') || line.includes('export interface ') || line.includes('export type ')) return true;
  if (line.includes('console.')) return true;

  return false;
}

export function scanFile(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const findings: Finding[] = [];
  const batch = assignBatch(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export interface ') ||
      trimmed.startsWith('export type ')
    ) {
      continue;
    }

    // 1. JSX text between > and <
    const jsxMatches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const match of jsxMatches) {
      const text = match[1].trim();
      if (!text || isFalsePositive(text, line)) continue;
      if (/[a-zA-Z]{2,}/.test(text)) {
        findings.push({ file: filePath, line: i + 1, type: 'JSX_TEXT', text, batch });
      }
    }

    // 2. placeholder="..."
    const placeholderMatch = line.match(/placeholder=["']([^"']+)["']/);
    if (placeholderMatch) {
      const text = placeholderMatch[1].trim();
      if (!isFalsePositive(text, line) && !text.startsWith('{')) {
        findings.push({ file: filePath, line: i + 1, type: 'PLACEHOLDER', text, batch });
      }
    }

    // 3. title="..."
    const titleMatch = line.match(/\btitle=["']([^"']+)["']/);
    if (titleMatch) {
      const text = titleMatch[1].trim();
      if (!isFalsePositive(text, line) && !text.startsWith('{')) {
        findings.push({ file: filePath, line: i + 1, type: 'TITLE', text, batch });
      }
    }

    // 4. aria-label="..."
    const ariaMatch = line.match(/aria-label=["']([^"']+)["']/);
    if (ariaMatch) {
      const text = ariaMatch[1].trim();
      if (!isFalsePositive(text, line) && !text.startsWith('{')) {
        findings.push({ file: filePath, line: i + 1, type: 'ARIA_LABEL', text, batch });
      }
    }
  }

  return findings;
}

function getAllFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (file.endsWith('.tsx') && !file.endsWith('.test.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const allTsx = getAllFiles('src');
const allFindings: Finding[] = [];
for (const f of allTsx) {
  allFindings.push(...scanFile(f));
}

const byBatch: Record<string, Finding[]> = {};
for (const f of allFindings) {
  byBatch[f.batch] = byBatch[f.batch] || [];
  byBatch[f.batch].push(f);
}

console.log('=== AUDIT SUMMARY ===');
console.log('Total TSX files scanned:', allTsx.length);
console.log('Total confirmed raw findings:', allFindings.length);
console.log('');
for (const [batch, items] of Object.entries(byBatch)) {
  console.log(`[${batch}]: ${items.length} findings`);
  const files = new Set(items.map(i => i.file));
  console.log(`  Across ${files.size} files:`);
  for (const file of files) {
    const fileItems = items.filter(i => i.file === file);
    console.log(`    - ${file}: ${fileItems.length} items`);
  }
}

fs.writeFileSync('audit_results_refined.json', JSON.stringify({ summary: { total: allFindings.length }, byBatch, allFindings }, null, 2));
