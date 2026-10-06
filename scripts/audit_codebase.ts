import fs from 'fs';
import path from 'path';

function getAllFiles(dir: string, exts: string[] = ['.tsx']): string[] {
  let files: string[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      files = files.concat(getAllFiles(full, exts));
    } else if (exts.some((ext) => item.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const files = getAllFiles('./src');
console.log('Total TSX files:', files.length);

interface Issue {
  line: number;
  type: string;
  text: string;
}

interface AuditResult {
  file: string;
  hasUseLoc: boolean;
  hasT: boolean;
  issues: Issue[];
}

const results: AuditResult[] = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const hasUseLoc = content.includes('useLocalization');
  const hasT = content.includes('t(');

  const rawJsxTextMatches: Issue[] = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
    if (trimmed.startsWith('import ') || trimmed.startsWith('export type') || trimmed.startsWith('interface ')) return;
    if (trimmed.includes('<path ') || trimmed.includes('<svg ') || trimmed.includes('d="M') || trimmed.includes('stroke=')) return;

    // placeholder="Literal"
    const phMatch = trimmed.match(/placeholder=["']([^"'{}\n]{3,})["']/);
    if (phMatch && !['text', 'email', 'password', 'number', 'tel', 'url'].includes(phMatch[1])) {
      rawJsxTextMatches.push({ line: idx + 1, type: 'placeholder', text: phMatch[1] });
    }

    // title="Literal"
    const titleMatch = trimmed.match(/title=["']([^"'{}\n]{3,})["']/);
    if (titleMatch && !titleMatch[1].startsWith('#') && !titleMatch[1].startsWith('rgb')) {
      rawJsxTextMatches.push({ line: idx + 1, type: 'title', text: titleMatch[1] });
    }

    // aria-label="Literal"
    const ariaMatch = trimmed.match(/aria-label=["']([^"'{}\n]{3,})["']/);
    if (ariaMatch) {
      rawJsxTextMatches.push({ line: idx + 1, type: 'aria-label', text: ariaMatch[1] });
    }

    // Raw JSX text between > and <
    const jsxTextMatches = [...trimmed.matchAll(/>\s*([A-Za-z][A-Za-z0-9 ,.?!/()&;:'"-]{3,}[A-Za-z0-9.?!])\s*</g)];
    for (const m of jsxTextMatches) {
      const txt = m[1].trim();
      if (!txt.includes("{t('") && !txt.includes('t(') && !txt.startsWith('http') && !txt.startsWith('className') && !txt.startsWith('var(') && !txt.includes('=>')) {
        // filter out pure numbers or code identifiers
        if (!/^[0-9\s.,xX+-]+$/.test(txt)) {
          rawJsxTextMatches.push({ line: idx + 1, type: 'jsx-text', text: txt });
        }
      }
    }
  });

  results.push({
    file: f,
    hasUseLoc,
    hasT,
    issues: rawJsxTextMatches,
  });
}

const withIssues = results.filter((r) => r.issues.length > 0);
console.log('Files with potential hardcoded strings:', withIssues.length);

const summary: Record<string, number> = {};
for (const item of withIssues) {
  const dir = path.dirname(item.file);
  summary[dir] = (summary[dir] || 0) + 1;
}
console.log('Directory breakdown:');
for (const [dir, count] of Object.entries(summary)) {
  console.log(`  ${dir}: ${count} files`);
}

fs.writeFileSync('audit_results.json', JSON.stringify(withIssues, null, 2), 'utf8');
console.log('Audit saved to audit_results.json');
