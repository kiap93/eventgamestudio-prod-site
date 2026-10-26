import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

function checkSourceFileForHookViolations(sourceFile: ts.SourceFile) {
  const violations: Array<{ line: number; callName: string; returnLine: number }> = [];

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      let isComponent = false;
      if (node.name && /^[A-Z]/.test(node.name.text)) {
        isComponent = true;
      }
      if (
        node.parent &&
        ts.isVariableDeclaration(node.parent) &&
        node.parent.name &&
        ts.isIdentifier(node.parent.name)
      ) {
        if (/^[A-Z]/.test(node.parent.name.text)) {
          isComponent = true;
        }
      }

      if (isComponent && node.body && ts.isBlock(node.body)) {
        let seenReturn = false;
        let returnStatementLine: number | null = null;

        for (const statement of node.body.statements) {
          if (ts.isIfStatement(statement)) {
            const hasReturn = (s: ts.Statement): boolean => {
              if (ts.isReturnStatement(s)) return true;
              if (ts.isBlock(s)) {
                return s.statements.some((sub) => ts.isReturnStatement(sub));
              }
              return false;
            };
            if (hasReturn(statement.thenStatement)) {
              seenReturn = true;
              const { line } = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
              if (returnStatementLine === null) returnStatementLine = line + 1;
            }
          } else if (ts.isReturnStatement(statement)) {
            seenReturn = true;
            const { line } = sourceFile.getLineAndCharacterOfPosition(statement.getStart());
            if (returnStatementLine === null) returnStatementLine = line + 1;
          }

          function findHook(n: ts.Node) {
            if (ts.isCallExpression(n)) {
              const expr = n.expression;
              let callName: string | null = null;
              if (ts.isIdentifier(expr)) callName = expr.text;
              else if (ts.isPropertyAccessExpression(expr)) callName = expr.name.text;

              if (
                callName &&
                (/^use[A-Z]/.test(callName) ||
                  callName === 'useEffect' ||
                  callName === 'useState' ||
                  callName === 'useCallback' ||
                  callName === 'useMemo' ||
                  callName === 'useRef' ||
                  callName === 'useContext')
              ) {
                if (seenReturn) {
                  const { line } = sourceFile.getLineAndCharacterOfPosition(n.getStart());
                  violations.push({
                    line: line + 1,
                    callName,
                    returnLine: returnStatementLine ?? 0,
                  });
                }
              }
            }
            ts.forEachChild(n, findHook);
          }

          findHook(statement);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function scanDirForHookViolations(dir: string): Array<{ file: string; violations: any[] }> {
  const results: Array<{ file: string; violations: any[] }> = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== 'node_modules' &&
      entry.name !== '.git' &&
      entry.name !== 'dist'
    ) {
      results.push(...scanDirForHookViolations(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const code = readFileSync(fullPath, 'utf8');
      const sf = ts.createSourceFile(fullPath, code, ts.ScriptTarget.Latest, true);
      const v = checkSourceFileForHookViolations(sf);
      if (v.length > 0) {
        results.push({ file: fullPath, violations: v });
      }
    }
  }

  return results;
}

describe('React Hooks Ordering Integrity Suite', () => {
  it('verifies ZERO hook ordering violations across all components in src/', () => {
    const srcDir = join(process.cwd(), 'src');
    const violations = scanDirForHookViolations(srcDir);

    if (violations.length > 0) {
      console.error('Found hook violations in files:', JSON.stringify(violations, null, 2));
    }

    expect(violations.length).toBe(0);
  });

  it('verifies PublicEventGameView has audio cleanup hook before loading return', () => {
    const file = join(process.cwd(), 'src', 'components', 'events', 'PublicEventGameView.tsx');
    const content = readFileSync(file, 'utf8');

    const loadingReturnIdx = content.indexOf('if (loading) {');
    expect(loadingReturnIdx).toBeGreaterThan(-1);

    // Audio cleanup useEffect must occur before the loading return
    const audioCleanupMatch = content.indexOf('stopGameAudio(gameType)');
    expect(audioCleanupMatch).toBeGreaterThan(-1);
    expect(audioCleanupMatch).toBeLessThan(loadingReturnIdx);

    // resolveAuthoritativeGameType must be evaluated before the loading return
    const resolveGameTypeIdx = content.indexOf('resolveAuthoritativeGameType({');
    expect(resolveGameTypeIdx).toBeGreaterThan(-1);
    expect(resolveGameTypeIdx).toBeLessThan(loadingReturnIdx);
  });

  it('verifies EventPreviewGameView has audio cleanup hook before loading return', () => {
    const file = join(process.cwd(), 'src', 'components', 'events', 'EventPreviewGameView.tsx');
    const content = readFileSync(file, 'utf8');

    const loadingReturnIdx = content.indexOf('if (loading) {');
    expect(loadingReturnIdx).toBeGreaterThan(-1);

    // Audio cleanup useEffect must occur before the loading return
    const audioCleanupMatch = content.indexOf('stopGameAudio(gameType)');
    expect(audioCleanupMatch).toBeGreaterThan(-1);
    expect(audioCleanupMatch).toBeLessThan(loadingReturnIdx);

    // resolveAuthoritativeGameType must be evaluated before the loading return
    const resolveGameTypeIdx = content.indexOf('resolveAuthoritativeGameType({');
    expect(resolveGameTypeIdx).toBeGreaterThan(-1);
    expect(resolveGameTypeIdx).toBeLessThan(loadingReturnIdx);
  });

  it('verifies EventPaymentModal has double-click protection refs before early return', () => {
    const file = join(process.cwd(), 'src', 'components', 'events', 'EventPaymentModal.tsx');
    const content = readFileSync(file, 'utf8');

    const earlyReturnIdx = content.indexOf('if (!isOpen || !event) return null;');
    expect(earlyReturnIdx).toBeGreaterThan(-1);

    const submittingPaymentRefIdx = content.indexOf('useRef(false)');
    expect(submittingPaymentRefIdx).toBeGreaterThan(-1);
    expect(submittingPaymentRefIdx).toBeLessThan(earlyReturnIdx);
  });

  it('verifies NotificationCenterModal has useMemo before early return', () => {
    const file = join(process.cwd(), 'src', 'components', 'notifications', 'NotificationCenterModal.tsx');
    const content = readFileSync(file, 'utf8');

    const earlyReturnIdx = content.indexOf('if (!isOpenCenter) return null;');
    expect(earlyReturnIdx).toBeGreaterThan(-1);

    const filteredNotifsIdx = content.indexOf('const filteredNotifications = useMemo(');
    expect(filteredNotifsIdx).toBeGreaterThan(-1);
    expect(filteredNotifsIdx).toBeLessThan(earlyReturnIdx);
  });
});
