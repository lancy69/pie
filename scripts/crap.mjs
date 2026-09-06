// CRAP using TypeScript AST McCabe complexity and per-routine V8 block coverage.
// Run tests with NODE_V8_COVERAGE=<fresh directory>, then pass that directory here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const isRoutine = node => ts.isFunctionLike(node) && node.body !== undefined;
const decisions = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement, ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement, ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.CaseClause,
]);
const logical = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
function complexity(routine) {
  let count = 1;
  function visit(node) {
    if (node !== routine && isRoutine(node)) return;
    if (decisions.has(node.kind)) count++;
    if (ts.isBinaryExpression(node) && logical.has(node.operatorToken.kind)) count++;
    if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer) count++;
    if ((ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && node.questionDotToken) count++;
    ts.forEachChild(node, visit);
  }
  visit(routine);
  return count;
}
// Check decision counting and exclusion of a nested routine's decisions.
const sample = ts.createSourceFile('sample.ts', 'function f(x) { if (x && x.ok) return x?.v; const g = () => x ? 1 : 2; }', ts.ScriptTarget.Latest, true);
assert.equal(complexity(sample.statements[0]), 4);

const coverageDir = process.argv[2];
if (!coverageDir) throw new Error('Usage: node scripts/crap.mjs <NODE_V8_COVERAGE directory>');
const sourcePaths = ['index.ts', ...fs.readdirSync('src').filter(name => name.endsWith('.ts')).map(name => `src/${name}`)];
const scripts = new Map(sourcePaths.map(file => [path.resolve(file), []]));
for (const filename of fs.readdirSync(coverageDir)) {
  if (!filename.endsWith('.json')) continue;
  for (const script of JSON.parse(fs.readFileSync(path.join(coverageDir, filename), 'utf8')).result) {
    if (!script.url.startsWith('file:')) continue;
    scripts.get(fileURLToPath(script.url))?.push(script);
  }
}
const rows = [], gaps = [];
for (const [filename, runs] of scripts) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (isRoutine(node)) {
      const start = node.getStart(source), end = node.end;
      const line = source.getLineAndCharacterOfPosition(start).line + 1;
      const name = node.name?.getText(source) ?? '<anonymous>';
      const location = { file: path.relative(process.cwd(), filename), line, start, end, name };
      // Strip-types preserves source offsets. Match full routine end and a start before its body.
      const groups = runs.map(run => run.functions.filter(fn => {
        const root = fn.ranges[0];
        return root.endOffset === end && root.startOffset >= start && root.startOffset <= node.body.getStart(source);
      }));
      const matches = groups.flat();
      if (groups.some(group => group.length > 1)) gaps.push({ ...location, reason: 'Ambiguous V8 routine ranges' });
      else if (!matches.length) gaps.push({ ...location, reason: 'No matching V8 routine range' });
      else {
        const blocks = new Map();
        for (const fn of matches) for (const range of fn.ranges) blocks.set(`${range.startOffset}:${range.endOffset}`, range);
        // Merge processes: absent subranges inherit their closest enclosing range's count.
        const covered = [...blocks.values()].filter(block => matches.some(fn => {
          const enclosing = fn.ranges.filter(range => range.startOffset <= block.startOffset && range.endOffset >= block.endOffset)
            .sort((a, b) => (a.endOffset - a.startOffset) - (b.endOffset - b.startOffset))[0];
          return enclosing?.count > 0;
        })).length;
        const coverage = covered / blocks.size;
        const comp = complexity(node);
        rows.push({ ...location, complexity: comp, blocks: blocks.size, covered, coverage: coverage * 100,
          crap: comp ** 2 * (1 - coverage) ** 3 + comp });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
rows.sort((a, b) => b.crap - a.crap || a.file.localeCompare(b.file) || a.start - b.start);
console.log(JSON.stringify({ node: process.version, typescript: ts.version, coverage: 'V8 per-routine block coverage proxy (root and nested block ranges)', rows, gaps }, null, 2));
if (gaps.length) process.exitCode = 1;
