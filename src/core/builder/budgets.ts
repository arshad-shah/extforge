/**
 * Per-entrypoint bundle-size budgets (`build.budgets`).
 *
 * Sizes come from esbuild's metafiles. An entry's size is its own JS output
 * plus every chunk it imports statically, since those load with it.
 * Dynamically imported chunks load later, so they don't count. Units are
 * 1024-based, matching how the build prints sizes.
 */
import { extname, relative, resolve } from 'node:path';
import type { Metafile } from 'esbuild';

export type SizeInput = string | number;
export type Budgets = Record<string, SizeInput>;

export interface EntryInput {
  /** Source path as esbuild reports it, relative to the working directory. */
  path: string;
  /** Bytes this input contributes to the entry's output, chunks included. */
  bytes: number;
}

export interface EntrySize {
  /** Output path relative to the browser's outDir, without extension, e.g. `content/index`. */
  name: string;
  bytes: number;
  /** Contributing inputs, largest first. */
  inputs: EntryInput[];
}

export interface BudgetViolation {
  name: string;
  bytes: number;
  pattern: string;
  limit: number;
  over: number;
  /** The biggest contributors, largest first. */
  top: EntryInput[];
}

const UNITS: Record<string, number> = { b: 1, kb: 1024, mb: 1024 * 1024 };
const SIZE_RE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)?$/i;

/** `'50kb'` → 51200. A bare number (or numeric string) is bytes. */
export function parseSize(input: SizeInput): number {
  if (typeof input === 'number') {
    if (Number.isFinite(input) && input >= 0) return Math.round(input);
    throw new Error(`Invalid size ${input}: expected a non-negative number of bytes.`);
  }
  const match = SIZE_RE.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid size "${input}": use a number of bytes or a value like "50kb" or "1.5mb".`,
    );
  }
  const unit = UNITS[(match[2] ?? 'b').toLowerCase()] ?? 1;
  return Math.round(Number(match[1]) * unit);
}

/** Minimal glob: `**` matches across `/`, `*` within one segment, `?` one character. */
export function matchesGlob(name: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`).test(name);
}

/** An exact entry name wins; otherwise the first matching pattern in declaration order. */
export function resolveBudget(
  name: string,
  budgets: Budgets,
): { pattern: string; limit: number } | undefined {
  const exact = budgets[name];
  if (exact !== undefined) return { pattern: name, limit: parseSize(exact) };
  for (const [pattern, size] of Object.entries(budgets)) {
    if (matchesGlob(name, pattern)) return { pattern, limit: parseSize(size) };
  }
  return undefined;
}

/**
 * Per-entry JS sizes across every esbuild pass of one browser build.
 * `cwd` is the directory esbuild resolved metafile paths against.
 */
export function collectEntrySizes(
  metafiles: Metafile[],
  outDir: string,
  cwd: string = process.cwd(),
): EntrySize[] {
  const entries: EntrySize[] = [];
  for (const meta of metafiles) {
    for (const [outPath, output] of Object.entries(meta.outputs)) {
      if (!output.entryPoint || extname(outPath) !== '.js') continue;

      const seen = new Set<string>();
      const inputs = new Map<string, number>();
      let bytes = 0;
      const visit = (path: string): void => {
        const out = meta.outputs[path];
        if (!out || seen.has(path)) return;
        seen.add(path);
        bytes += out.bytes;
        for (const [input, { bytesInOutput }] of Object.entries(out.inputs)) {
          inputs.set(input, (inputs.get(input) ?? 0) + bytesInOutput);
        }
        for (const imp of out.imports) if (imp.kind === 'import-statement') visit(imp.path);
      };
      visit(outPath);

      const rel = relative(outDir, resolve(cwd, outPath)).split('\\').join('/');
      entries.push({
        name: rel.slice(0, -extname(rel).length),
        bytes,
        // Inputs tree-shaken to nothing still appear in the metafile; drop them.
        inputs: [...inputs]
          .filter(([, b]) => b > 0)
          .map(([path, b]) => ({ path, bytes: b }))
          .sort((a, b) => b.bytes - a.bytes),
      });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Entries over their budget. Entries no pattern covers are not checked. */
export function checkBudgets(entries: EntrySize[], budgets: Budgets, topN = 5): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  for (const entry of entries) {
    const budget = resolveBudget(entry.name, budgets);
    if (!budget || entry.bytes <= budget.limit) continue;
    violations.push({
      name: entry.name,
      bytes: entry.bytes,
      pattern: budget.pattern,
      limit: budget.limit,
      over: entry.bytes - budget.limit,
      top: entry.inputs.slice(0, topN),
    });
  }
  return violations;
}
