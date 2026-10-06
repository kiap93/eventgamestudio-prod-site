import fs from 'fs';
import path from 'path';

const SKIP_TAGS = ['code', 'pre', 'script', 'style'];

function scanFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues: { line: number; text: string }[] = [];

  lines.forEach((line, idx) => {
    // Look for JSX text: >Text<
    const matches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const m of matches) {
      const raw = m[1].trim();
      // filter out symbols, single chars, numbers, curly braces
      if (
        raw.length > 2 &&
        /[a-zA-Z]{2,}/.test(raw) &&
        !/^[\s\d\W]+$/.test(raw) &&
        !raw.startsWith('http') &&
        !raw.startsWith('/') &&
        !raw.startsWith('&') &&
        !raw.includes('console.') &&
        !raw.includes('return ') &&
        !raw.includes('export ')
      ) {
        issues.push({ line: idx + 1, text: raw });
      }
    }
  });

  return issues;
}

function walk(dir: string, fileList: string[] = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      walk(full, fileList);
    } else if (full.endsWith('.tsx')) {
      fileList.push(full);
    }
  }
  return fileList;
}

const allFiles = walk('src');
const results: Record<string, { count: number; samples: string[] }> = {};

for (const f of allFiles) {
  const issues = scanFile(f);
  if (issues.length > 0) {
    results[f] = {
      count: issues.length,
      samples: issues.slice(0, 3).map((i) => `L${i.line}: ${i.text}`),
    };
  }
}

console.log('Total files scanned:', allFiles.length);
console.log('Files with potential hardcoded JSX text:', Object.keys(results).length);
for (const [f, data] of Object.entries(results)) {
  console.log(`- ${f} (${data.count} occurrences):`);
  data.samples.forEach((s) => console.log(`    ${s}`));
}
