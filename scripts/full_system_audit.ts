import fs from 'fs';
import path from 'path';
import { en } from '../src/locales/en';
import { zhCN } from '../src/locales/zh-CN';
import { msMY } from '../src/locales/ms-MY';
import { CANONICAL_PROTECTED_TERMS } from '../src/lib/i18n/glossary';

function getAllKeys(obj: any, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys = keys.concat(getAllKeys(val, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enKeys = new Set(getAllKeys(en));
const zhKeys = new Set(getAllKeys(zhCN));
const msKeys = new Set(getAllKeys(msMY));

console.log('=== DICTIONARY AUDIT ===');
console.log(`EN: ${enKeys.size}, ZH: ${zhKeys.size}, MS: ${msKeys.size}`);
const missingInZh = [...enKeys].filter(k => !zhKeys.has(k));
const missingInMs = [...enKeys].filter(k => !msKeys.has(k));
console.log(`Missing in ZH: ${missingInZh.length}`);
console.log(`Missing in MS: ${missingInMs.length}`);

const protectedTermsList = CANONICAL_PROTECTED_TERMS.map(t => t.term);
const protectedTermsSet = new Set([
  ...protectedTermsList,
  'Event Game Studio', 'EventGameStudio', 'Catch The Brand', 'Catch the Brand',
  'Brand Memory Match', 'Formula Reaction Lights', 'Reaction Time', 'Event Trivia Speed Quiz',
  'Speed Quiz', 'RM', 'MYR', 'USD', 'SGD', 'Stripe', 'HitPay', 'DuitNow',
  'Asia/Singapore', 'UTC+8', 'Google', 'Gmail', 'Resend', 'PostgreSQL',
  'Supabase', 'Cloudflare', 'Phaser', 'React', 'Tailwind', 'Vite'
]);

function isExcluded(s: string): boolean {
  const t = s.trim();
  if (!t || t.length < 2) return true;
  if (/^[\d\s.,\/#!$%\^&\*;:{}=\-_`~()@+?><\[\]'\"|\\•—–]+$/.test(t)) return true;
  if (protectedTermsSet.has(t)) return true;
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(t)) return true;
  if (/^(LIVE|PAID|PENDING|DRAFT|COMPLETED|CANCELLED|EXPIRED)$/.test(t)) return true;
  if (/^(owner|admin|designer|viewer|member)$/.test(t)) return true;
  if (/^(px|rem|em|vh|vw|dvh|s|ms|%)(\s|$)/.test(t)) return true;
  if (/^\d+(\.\d+)?(px|%|rem|em|s|ms|deg|vh|vw|dvh)$/.test(t)) return true;
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/') || t.startsWith('./')) return true;
  if (t.startsWith('&') && t.endsWith(';')) return true;
  if (t.includes('className') || t.includes('style=')) return true;
  if (/^(const|let|var|function|return|import|export|interface|type)\s/.test(t)) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return true;
  if (t.includes('=>') || t.includes('Promise<') || t.includes('Array<')) return true;
  return false;
}

interface FileAudit {
  file: string;
  hasUseLocalization: boolean;
  issues: Array<{ line: number; type: string; text: string }>;
  status: 'COMPLETE' | 'PARTIAL' | 'NOT STARTED' | 'INTENTIONALLY STATIC';
}

function auditFile(filePath: string): FileAudit {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const hasUseLocalization = content.includes('useLocalization');
  const issues: Array<{ line: number; type: string; text: string }> = [];

  // Identify if file is purely non-UI or purely static
  const isTypeFile = filePath.endsWith('types.ts') || filePath.endsWith('types.tsx') || filePath.includes('/types/');
  const isUtil = filePath.includes('/lib/') || filePath.includes('/systems/') || filePath.includes('/scenes/') || filePath.includes('/objects/');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('console.') ||
      trimmed.startsWith('export interface') ||
      trimmed.startsWith('export type') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ')
    ) {
      return;
    }

    // JSX Text: >text<
    const matches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const m of matches) {
      const text = m[1].trim();
      if (!isExcluded(text) && /[a-zA-Z]{2,}/.test(text)) {
        // Exclude math comparisons like "0 && ..." or ">= ..."
        if (/^[=><&|!]+/.test(text) || /[=><&|!]+$/.test(text)) continue;
        if (/^\w+\.\w+$/.test(text)) continue; // e.g. t.min_days or i.points
        if (text.includes('Promise') || text.includes('Record') || text.includes('Partial')) continue;
        issues.push({ line: idx + 1, type: 'JSX_TEXT', text });
      }
    }

    // placeholder="..."
    const pMatch = line.match(/placeholder=["']([^"']+)["']/);
    if (pMatch) {
      const text = pMatch[1].trim();
      if (!isExcluded(text) && !text.startsWith('{')) {
        issues.push({ line: idx + 1, type: 'PLACEHOLDER', text });
      }
    }

    // title="..."
    const tMatch = line.match(/\btitle=["']([^"']+)["']/);
    if (tMatch) {
      const text = tMatch[1].trim();
      if (!isExcluded(text) && !text.startsWith('{')) {
        issues.push({ line: idx + 1, type: 'TITLE', text });
      }
    }

    // aria-label="..."
    const aMatch = line.match(/aria-label=["']([^"']+)["']/);
    if (aMatch) {
      const text = aMatch[1].trim();
      if (!isExcluded(text) && !text.startsWith('{')) {
        issues.push({ line: idx + 1, type: 'ARIA_LABEL', text });
      }
    }

    // alt="..."
    const altMatch = line.match(/\balt=["']([^"']+)["']/);
    if (altMatch) {
      const text = altMatch[1].trim();
      if (!isExcluded(text) && !text.startsWith('{')) {
        issues.push({ line: idx + 1, type: 'ALT', text });
      }
    }
  });

  let status: 'COMPLETE' | 'PARTIAL' | 'NOT STARTED' | 'INTENTIONALLY STATIC' = 'COMPLETE';
  if (isTypeFile || isUtil) {
    status = 'INTENTIONALLY STATIC';
  } else if (!hasUseLocalization) {
    if (issues.length > 0) {
      status = 'NOT STARTED';
    } else {
      status = 'INTENTIONALLY STATIC';
    }
  } else {
    if (issues.length > 0) {
      status = 'PARTIAL';
    } else {
      status = 'COMPLETE';
    }
  }

  return { file: filePath, hasUseLocalization, issues, status };
}

function walk(dir: string): string[] {
  let list: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(walk(full));
    } else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) {
      list.push(full);
    }
  }
  return list;
}

const tsxFiles = walk('src');
const audits = tsxFiles.map(auditFile);

const completeList = audits.filter(a => a.status === 'COMPLETE');
const partialList = audits.filter(a => a.status === 'PARTIAL');
const notStartedList = audits.filter(a => a.status === 'NOT STARTED');
const staticList = audits.filter(a => a.status === 'INTENTIONALLY STATIC');

console.log('\n=== AUDIT SUMMARY BY STATUS ===');
console.log(`TOTAL TSX FILES: ${audits.length}`);
console.log(`COMPLETE: ${completeList.length}`);
console.log(`PARTIAL: ${partialList.length}`);
console.log(`NOT STARTED: ${notStartedList.length}`);
console.log(`INTENTIONALLY STATIC: ${staticList.length}`);

console.log('\n--- PARTIAL COMPONENTS (Has useLocalization, but remaining hardcoded strings) ---');
for (const p of partialList) {
  console.log(`• ${p.file} (${p.issues.length} hardcoded items)`);
  p.issues.slice(0, 5).forEach(i => console.log(`   L${i.line} [${i.type}]: ${i.text}`));
}

console.log('\n--- NOT STARTED COMPONENTS (Has user-facing strings, NO useLocalization) ---');
for (const ns of notStartedList) {
  console.log(`• ${ns.file} (${ns.issues.length} hardcoded items)`);
  ns.issues.slice(0, 5).forEach(i => console.log(`   L${i.line} [${i.type}]: ${i.text}`));
}
