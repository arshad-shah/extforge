/**
 * `extforge migrate-layout`: move a legacy project to the named layout.
 *
 *   src/ui/<page>/          → src/<page>/        (popup, options, sidepanel)
 *   src/content/index.ts(x) → src/content.ts(x)  + defineContentScript({ matches, … })
 *   extforge.config.ts      → hand-written entry paths removed
 *
 * Relative imports, page <script>/<link> paths and CSS @imports are rewritten
 * so they keep pointing at the same files after the move. The plan is computed
 * first and nothing is touched when any step can't be done safely.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ContentScriptConfig, ManifestConfig } from '../manifest/types.js';

export interface MigrationPlan {
  /** Directory or file moves, absolute paths. */
  moves: Array<{ from: string; to: string }>;
  /** The content script to give a defineContentScript() default export, after moving. */
  contentScript?: { file: string; options: ContentScriptConfig };
  /** Config keys to delete, for the report and the config rewrite. */
  configKeys: string[];
  /** Why the project can't be migrated automatically; when set, nothing should be applied. */
  blockers: string[];
}

const PAGES = ['popup', 'options', 'sidepanel'] as const;
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.html', '.css']);

const posix = (p: string) => p.split(sep).join('/');

export function planMigration(root: string, manifest: ManifestConfig | undefined): MigrationPlan {
  const src = join(root, 'src');
  const plan: MigrationPlan = { moves: [], configKeys: [], blockers: [] };

  for (const page of PAGES) {
    const from = join(src, 'ui', page);
    if (!existsSync(from)) continue;
    const to = join(src, page);
    if (existsSync(to) || existsSync(join(src, `${page}.html`))) {
      plan.blockers.push(`src/${page} already exists, so src/ui/${page}/ can't move there.`);
    }
    plan.moves.push({ from, to });
  }
  if (existsSync(join(src, 'ui'))) {
    const rest = readdirSync(join(src, 'ui')).filter(
      (n) => !(PAGES as readonly string[]).includes(n),
    );
    if (rest.length > 0)
      plan.blockers.push(`src/ui/ also contains ${rest.join(', ')}; move or remove it first.`);
  }

  const contentDir = join(src, 'content');
  if (existsSync(contentDir)) {
    const entries = readdirSync(contentDir);
    const index = ['index.ts', 'index.tsx'].find((f) => entries.includes(f));
    if (!index || entries.length > 1) {
      plan.blockers.push(
        'src/content/ holds more than index.ts. Rename it to src/<name>.content/ (an index.ts plus its helpers) by hand.',
      );
    } else {
      const to = join(src, `content${extname(index)}`);
      if (existsSync(to)) plan.blockers.push(`${posix(relative(root, to))} already exists.`);
      plan.moves.push({ from: join(contentDir, index), to });
      const scripts = (manifest?.contentScripts ?? []).filter((c) =>
        c.js?.includes('content/index.js'),
      );
      if (scripts.length !== 1) {
        plan.blockers.push(
          scripts.length === 0
            ? 'src/content/index.ts exists but no contentScripts entry loads content/index.js, so its matches are unknown.'
            : 'Several contentScripts entries load content/index.js; the named layout gives each file one entry.',
        );
      } else {
        const cs = scripts[0] as ContentScriptConfig;
        if (cs.css?.length)
          plan.blockers.push(
            'The content script declares css, which defineContentScript() does not support yet.',
          );
        if ((cs.js?.length ?? 0) > 1)
          plan.blockers.push(
            'The content script entry loads several js files; split them into <name>.content.ts files by hand.',
          );
        plan.contentScript = { file: to, options: cs };
      }
    }
  }
  const others = (manifest?.contentScripts ?? []).filter(
    (c) => c.js?.length && !c.js.includes('content/index.js'),
  );
  if (others.length > 0) {
    plan.blockers.push(
      `contentScripts also loads ${others.flatMap((c) => c.js ?? []).join(', ')}; turn each into a <name>.content.ts by hand.`,
    );
  }

  if (manifest?.background?.entrypoint) plan.configKeys.push('background.entrypoint');
  if (manifest?.action?.defaultPopup) plan.configKeys.push('action.defaultPopup');
  if (manifest?.optionsPage) plan.configKeys.push('optionsPage');
  if (manifest?.sidePanel?.defaultPath) plan.configKeys.push('sidePanel.defaultPath');
  if (manifest?.contentScripts?.some((c) => c.js?.length)) plan.configKeys.push('contentScripts');
  return plan;
}

/** Every code file under `dir`, skipping node_modules and dist. */
function codeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...codeFiles(p));
    else if (CODE_EXTS.has(extname(e.name))) out.push(p);
  }
  return out;
}

/** Where `abs` ends up after the moves (files inside a moved directory move with it). */
function afterMoves(abs: string, moves: MigrationPlan['moves']): string {
  for (const m of moves) {
    if (abs === m.from) return m.to;
    // Strictly inside a move's source: that source is a moved directory.
    const rel = relative(m.from, abs);
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return join(m.to, rel);
  }
  return abs;
}

// Relative specifiers in JS/TS (from, import(), require(), side-effect import),
// HTML src/href attributes and CSS @import / url().
const SPECIFIER_RES = [
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"]*)\2/gm,
  /(\b(?:src|href)\s*=\s*)(['"])(\.{1,2}\/[^'"]*)\2/g,
  /(@import\s+(?:url\()?\s*)(['"])(\.{1,2}\/[^'"]*)\2/g,
];

/**
 * Rewrite the relative specifiers in `source` (which lives at `oldFile` and
 * will live at `newFile`) so each still points at the same file after the moves.
 */
export function rewriteSpecifiers(
  source: string,
  oldFile: string,
  newFile: string,
  moves: MigrationPlan['moves'],
): string {
  let out = source;
  for (const re of SPECIFIER_RES) {
    out = out.replace(re, (whole, head: string, q: string, spec: string) => {
      const target = resolve(dirname(oldFile), spec);
      const movedTarget = afterMoves(target, moves);
      let next = posix(relative(dirname(newFile), movedTarget));
      if (!next.startsWith('.')) next = `./${next}`;
      // Keep a trailing slash and the original form when nothing changed.
      if (spec.endsWith('/') && !next.endsWith('/')) next += '/';
      return next === spec ? whole : `${head}${q}${next}${q}`;
    });
  }
  return out;
}

/** The import line and default export that give a content script its manifest entry. */
export function contentScriptFooter(cs: ContentScriptConfig): { header: string; footer: string } {
  const opts: string[] = [`  matches: ${JSON.stringify(cs.matches)},`];
  if (cs.excludeMatches?.length)
    opts.push(`  excludeMatches: ${JSON.stringify(cs.excludeMatches)},`);
  if (cs.runAt) opts.push(`  runAt: '${cs.runAt}',`);
  if (cs.allFrames !== undefined) opts.push(`  allFrames: ${cs.allFrames},`);
  if (cs.matchAboutBlank !== undefined) opts.push(`  matchAboutBlank: ${cs.matchAboutBlank},`);
  if (cs.world) opts.push(`  world: '${cs.world}',`);
  return {
    header: "import { defineContentScript } from 'extforge/entrypoints';\n",
    footer: [
      '',
      "// Added by `extforge migrate-layout`: the options for this script's manifest entry.",
      '// The code above still runs when the script is injected; main() can stay empty.',
      'export default defineContentScript({',
      ...opts,
      '  main() {},',
      '});',
      '',
    ].join('\n'),
  };
}

/**
 * Remove the hand-written entry keys from the config source. Handles the
 * shapes `extforge init` writes (and similar hand edits); returns `undefined`
 * when a key can't be found, so the caller can fall back to instructions.
 */
export function removeEntryKeys(source: string, keys: string[]): string | undefined {
  let out = source;
  const removeProp = (re: RegExp) => {
    const next = out.replace(re, '');
    if (next === out) return false;
    out = next;
    return true;
  };
  for (const key of keys) {
    let ok = true;
    if (key === 'background.entrypoint')
      ok = removeProp(
        /^[ \t]*background\s*:\s*\{\s*entrypoint\s*:\s*(['"`])[^'"`]*\1\s*,?\s*\}\s*,?[ \t]*\r?\n/m,
      );
    if (key === 'action.defaultPopup')
      ok = removeProp(/^[ \t]*defaultPopup\s*:\s*(['"`])[^'"`]*\1\s*,?[ \t]*\r?\n/m);
    if (key === 'optionsPage')
      ok = removeProp(/^[ \t]*optionsPage\s*:\s*(['"`])[^'"`]*\1\s*,?[ \t]*\r?\n/m);
    if (key === 'sidePanel.defaultPath')
      ok = removeProp(
        /^[ \t]*sidePanel\s*:\s*\{\s*defaultPath\s*:\s*(['"`])[^'"`]*\1\s*,?\s*\}\s*,?[ \t]*\r?\n/m,
      );
    if (key === 'contentScripts') {
      const start = out.search(/^[ \t]*contentScripts\s*:\s*\[/m);
      if (start === -1) return undefined;
      let i = out.indexOf('[', start);
      let depth = 0;
      for (; i < out.length; i++) {
        if (out[i] === '[') depth++;
        else if (out[i] === ']' && --depth === 0) break;
      }
      if (depth !== 0) return undefined;
      let end = i + 1;
      while (out[end] === ',' || out[end] === ' ' || out[end] === '\t') end++;
      if (out[end] === '\r') end++;
      if (out[end] === '\n') end++;
      out = out.slice(0, start) + out.slice(end);
    }
    if (!ok) return undefined;
  }
  return out;
}

/** Apply a blocker-free plan. Returns the files it changed or moved, for the report. */
export function applyMigration(root: string, plan: MigrationPlan): string[] {
  if (plan.blockers.length > 0)
    throw new Error('Refusing to apply a migration plan with blockers.');
  const src = join(root, 'src');
  const touched: string[] = [];

  // Rewrite specifiers first, while every file is still where it was.
  const pending = new Map<string, string>();
  for (const file of codeFiles(src)) {
    const next = afterMoves(file, plan.moves);
    const before = readFileSync(file, 'utf8');
    const after = rewriteSpecifiers(before, file, next, plan.moves);
    if (after !== before) pending.set(file, after);
  }
  for (const [file, text] of pending) writeFileSync(file, text);

  for (const m of plan.moves) {
    mkdirSync(dirname(m.to), { recursive: true });
    renameSync(m.from, m.to);
    touched.push(`${posix(relative(root, m.from))} → ${posix(relative(root, m.to))}`);
  }
  for (const empty of [join(src, 'ui'), join(src, 'content')]) {
    if (existsSync(empty) && readdirSync(empty).length === 0) rmdirSync(empty);
  }

  if (plan.contentScript) {
    const { header, footer } = contentScriptFooter(plan.contentScript.options);
    const code = readFileSync(plan.contentScript.file, 'utf8');
    if (/\bexport\s+default\b/.test(code)) {
      throw new Error(
        `${posix(relative(root, plan.contentScript.file))} already has a default export; add defineContentScript() by hand.`,
      );
    }
    writeFileSync(plan.contentScript.file, header + code.replace(/\s*$/, '\n') + footer);
    touched.push(`${posix(relative(root, plan.contentScript.file))}: added defineContentScript()`);
  }
  return touched;
}
