import fs from 'fs';
import path from 'path';

interface EndpointUsage {
  method: string;
  url: string;
  normalizedUrl: string;
  sourceFiles: string[];
}

interface BackendRoute {
  method: string;
  pattern: string;
  normalizedPattern: string;
  handlerSummary: string;
  line: number;
}

// 1. Scan src/ for all apiFetch calls
function getFrontendEndpoints(): EndpointUsage[] {
  const results: { method: string; url: string; file: string }[] = [];

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf8');
        // Match apiFetch(..., { method: '...' })
        // Regex matches apiFetch(`url` or apiFetch('url' or apiFetch("url"
        const regex = /apiFetch\s*\(\s*([`'"])([^`'"]+)\1(?:\s*,\s*({[\s\S]*?}))?\s*\)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const rawUrl = match[2];
          const opts = match[3] || '';
          let method = 'GET';
          const methodMatch = opts.match(/method\s*:\s*['"]([A-Z]+)['"]/i);
          if (methodMatch) {
            method = methodMatch[1].toUpperCase();
          }
          results.push({
            method,
            url: rawUrl,
            file: path.relative('.', full),
          });
        }
      }
    }
  }

  scan('src');

  // Normalize and group
  const grouped = new Map<string, EndpointUsage>();
  for (const item of results) {
    // Strip query parameters
    const cleanUrl = item.url.split('?')[0];
    // Replace ${...} with :param
    const normalized = cleanUrl.replace(/\$\{[^}]+\}/g, ':param').trim();
    const key = `${item.method} ${normalized}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        method: item.method,
        url: item.url,
        normalizedUrl: normalized,
        sourceFiles: [],
      });
    }
    const current = grouped.get(key)!;
    if (!current.sourceFiles.includes(item.file)) {
      current.sourceFiles.push(item.file);
    }
  }

  return Array.from(grouped.values());
}

// 2. Scan server.ts for all Express routes
function getExpressRoutes(): BackendRoute[] {
  const content = fs.readFileSync('server.ts', 'utf8');
  const lines = content.split('\n');
  const routes: BackendRoute[] = [];

  const regex = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const line = content.slice(0, match.index).split('\n').length;
    // Normalize :orgId, :id, etc. to :param
    const normalized = routePath.replace(/:[a-zA-Z0-9_]+/g, ':param');
    routes.push({
      method,
      pattern: routePath,
      normalizedPattern: normalized,
      handlerSummary: '',
      line,
    });
  }

  return routes;
}

// 3. Scan worker.ts for all Worker routes
function getWorkerRoutes(): BackendRoute[] {
  const content = fs.readFileSync('worker.ts', 'utf8');
  const lines = content.split('\n');
  const routes: BackendRoute[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check pathname === '...' or pathname.startsWith('...')
    // Example: if (pathname === '/api/config' && method === 'GET')
    const exactMatch = line.match(/pathname\s*===\s*['"`]([^'"`]+)['"`]\s*&&\s*method\s*===\s*['"`]([A-Z]+)['"`]/);
    if (exactMatch) {
      const p = exactMatch[1];
      const m = exactMatch[2].toUpperCase();
      routes.push({
        method: m,
        pattern: p,
        normalizedPattern: p.replace(/:[a-zA-Z0-9_]+/g, ':param'),
        handlerSummary: '',
        line: i + 1,
      });
      continue;
    }

    // Example: if (method === 'GET' && pathname === '/api/config')
    const exactMatchReversed = line.match(/method\s*===\s*['"`]([A-Z]+)['"`]\s*&&\s*pathname\s*===\s*['"`]([^'"`]+)['"`]/);
    if (exactMatchReversed) {
      const m = exactMatchReversed[1].toUpperCase();
      const p = exactMatchReversed[2];
      routes.push({
        method: m,
        pattern: p,
        normalizedPattern: p.replace(/:[a-zA-Z0-9_]+/g, ':param'),
        handlerSummary: '',
        line: i + 1,
      });
      continue;
    }

    // Check regex matches: pathname.match(/^\/api\/...$/)
    const regexMatch = line.match(/pathname\.match\(\s*\/([^/]+)\/([a-z]*)\s*\)/);
    if (regexMatch) {
      let regStr = regexMatch[1];
      // Try to determine method from surrounding lines
      let method = 'UNKNOWN';
      const surrounding = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5)).join('\n');
      const methodFound = surrounding.match(/method\s*===\s*['"`]([A-Z]+)['"`]/);
      if (methodFound) {
        method = methodFound[1].toUpperCase();
      }

      // Convert regex pattern to normalized string
      // e.g. ^\/api\/organizations\/([^\/]+)\/wallet$ -> /api/organizations/:param/wallet
      let converted = regStr
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\\\//g, '/')
        .replace(/\(\[\^\\\/\]\+\)/g, ':param')
        .replace(/\(\[\^\\\/\]\*\)/g, ':param')
        .replace(/\([^)]+\)/g, ':param');

      routes.push({
        method,
        pattern: converted,
        normalizedPattern: converted,
        handlerSummary: line.trim(),
        line: i + 1,
      });
    }
  }

  return routes;
}

console.log('--- ROUTE AUDIT SCANNER INITIALIZED ---');
const fe = getFrontendEndpoints();
const ex = getExpressRoutes();
const wk = getWorkerRoutes();

console.log(`Frontend unique endpoints: ${fe.length}`);
console.log(`Express routes: ${ex.length}`);
console.log(`Worker routes identified: ${wk.length}`);

// Compare frontend to Express and Worker
console.log('\n========================================');
console.log('FRONTEND TO BACKEND PARITY MAPPING');
console.log('========================================');

const missingInExpress: EndpointUsage[] = [];
const missingInWorker: EndpointUsage[] = [];

for (const ep of fe) {
  const hasExpress = ex.some(e => e.method === ep.method && e.normalizedPattern === ep.normalizedUrl);
  // For worker, check direct match or regex normalized pattern
  const hasWorker = wk.some(w => {
    if (w.method !== 'UNKNOWN' && w.method !== ep.method) return false;
    return w.normalizedPattern === ep.normalizedUrl;
  });

  const status = hasExpress && hasWorker ? '✓ FULL PARITY' : (!hasExpress ? '✗ MISSING IN EXPRESS' : '✗ MISSING IN WORKER');
  console.log(`${ep.method.padEnd(6)} ${ep.normalizedUrl.padEnd(55)} [Express: ${hasExpress ? 'YES' : 'NO '}] [Worker: ${hasWorker ? 'YES' : 'NO '}] -> ${status}`);

  if (!hasExpress) missingInExpress.push(ep);
  if (!hasWorker) missingInWorker.push(ep);
}

console.log('\nMissing in Express count:', missingInExpress.length);
console.log('Missing in Worker count:', missingInWorker.length);
