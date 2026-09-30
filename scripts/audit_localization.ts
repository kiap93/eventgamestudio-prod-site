import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/locales/en.js';
import { zhCN } from '../src/locales/zh-CN.js';
import { msMY } from '../src/locales/ms-MY.js';

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

console.log('=== LOCALIZATION KEY AUDIT ===');
console.log(`Total EN keys: ${enKeys.size}`);
console.log(`Total ZH keys: ${zhKeys.size}`);
console.log(`Total MS keys: ${msKeys.size}`);

const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
const missingInMs = [...enKeys].filter((k) => !msKeys.has(k));
const extraInZh = [...zhKeys].filter((k) => !enKeys.has(k));
const extraInMs = [...msKeys].filter((k) => !enKeys.has(k));

console.log(`Keys in EN but missing in ZH: ${missingInZh.length}`);
if (missingInZh.length > 0) console.log('Sample missing ZH:', missingInZh.slice(0, 10));
console.log(`Keys in EN but missing in MS: ${missingInMs.length}`);
if (missingInMs.length > 0) console.log('Sample missing MS:', missingInMs.slice(0, 10));
console.log(`Extra in ZH: ${extraInZh.length}`);
console.log(`Extra in MS: ${extraInMs.length}`);

// Scan all tsx files in src/
function getFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getFiles(res));
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      files.push(res);
    }
  }
  return files;
}

const allTsxFiles = getFiles(path.resolve('src'));
console.log(`\n=== SCANNING ${allTsxFiles.length} TSX FILES IN src/ ===`);

const withoutUseLocalization: string[] = [];
const withUseLocalization: string[] = [];

for (const file of allTsxFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(process.cwd(), file);
  if (content.includes('useLocalization')) {
    withUseLocalization.push(relPath);
  } else {
    // Check if it has user-facing text or buttons
    const hasButtons = /<button[\s>]/.test(content);
    const hasJSXText = />\s*([A-Za-z]{3,}[^<>{}]*)\s*</.test(content);
    if (hasButtons || hasJSXText) {
      withoutUseLocalization.push(relPath);
    }
  }
}

console.log(`Files using useLocalization: ${withUseLocalization.length}`);
console.log(`Files with UI/buttons NOT using useLocalization: ${withoutUseLocalization.length}`);
console.log('\nTop files without useLocalization:');
withoutUseLocalization.forEach((f) => console.log(' - ' + f));
