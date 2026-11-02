/**
 * `extforge build --analyze`: a self-contained treemap of what each
 * entrypoint is made of, plus the raw esbuild metafile for other tools
 * (for example https://esbuild.github.io/analyze/).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metafile } from 'esbuild';
import type { EntrySize } from './budgets.js';

interface Node {
  name: string;
  bytes: number;
  children?: Node[];
}

/** `…/node_modules/.pnpm/x@1/node_modules/@scope/pkg/lib/a.js` → `@scope/pkg`. */
export function packageOf(path: string): string | undefined {
  const parts = path.split(/[\\/]/);
  const i = parts.lastIndexOf('node_modules');
  if (i === -1 || i + 1 >= parts.length) return undefined;
  const first = parts[i + 1] as string;
  return first.startsWith('@') && parts[i + 2] ? `${first}/${parts[i + 2]}` : first;
}

/** Entrypoints → packages (node_modules grouped) and source files, largest first. */
export function buildTree(entries: EntrySize[]): Node {
  const children = entries.map((entry) => {
    const groups = new Map<string, Node>();
    for (const input of entry.inputs) {
      const pkg = packageOf(input.path);
      const key = pkg ? `📦 ${pkg}` : input.path;
      const node = groups.get(key) ?? { name: key, bytes: 0, children: pkg ? [] : undefined };
      node.bytes += input.bytes;
      if (pkg) node.children?.push({ name: input.path, bytes: input.bytes });
      groups.set(key, node);
    }
    return {
      name: entry.name,
      bytes: entry.bytes,
      children: [...groups.values()].sort((a, b) => b.bytes - a.bytes),
    };
  });
  return { name: 'root', bytes: entries.reduce((s, e) => s + e.bytes, 0), children };
}

/** Merge metafiles so one JSON file describes the whole browser build. */
export function mergeMetafiles(metafiles: Metafile[]): Metafile {
  const merged: Metafile = { inputs: {}, outputs: {} };
  for (const m of metafiles) {
    Object.assign(merged.inputs, m.inputs);
    Object.assign(merged.outputs, m.outputs);
  }
  return merged;
}

export function renderTreemapHtml(browser: string, entries: EntrySize[]): string {
  // `<` escaped so file names can't close the script tag.
  const data = JSON.stringify(buildTree(entries)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ExtForge bundle analysis: ${browser}</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #0f172a; --muted: #64748b; --line: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1020; --fg: #e2e8f0; --muted: #94a3b8; --line: #0b1020; } }
  body { margin: 0; font: 13px/1.4 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  header { padding: 12px 16px; display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; }
  #crumb { color: var(--muted); }
  #crumb a { color: inherit; cursor: pointer; text-decoration: underline; }
  #map { position: relative; margin: 0 16px 16px; height: calc(100vh - 70px); min-height: 320px; }
  .cell { position: absolute; box-sizing: border-box; border: 1px solid var(--line); overflow: hidden;
          padding: 4px 6px; color: #0f172a; cursor: default; }
  .cell.zoom { cursor: zoom-in; }
  .cell b { display: block; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
  .cell span { font-size: 12px; opacity: .8; }
</style>
</head>
<body>
<header><h1>Bundle analysis: ${browser}</h1><div id="crumb"></div></header>
<div id="map" role="img" aria-label="Treemap of entrypoint sizes"></div>
<script>
const root = ${data};
const palette = ['#c7d2fe','#bbf7d0','#fde68a','#fecaca','#bae6fd','#ddd6fe','#fed7aa','#a7f3d0','#fbcfe8','#e9d5ff'];
const fmt = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
// Squarified treemap (Bruls et al.): lay out rows that keep cells close to square.
function squarify(items, x, y, w, h) {
  const out = []; const total = items.reduce((s, i) => s + i.bytes, 0) || 1;
  let rest = items.map((i) => ({ item: i, area: (i.bytes / total) * w * h }));
  while (rest.length) {
    const short = Math.min(w, h); let row = [], best = Infinity;
    for (const r of rest) {
      const next = [...row, r]; const s = next.reduce((a, b) => a + b.area, 0);
      const worst = Math.max(...next.map((n) => Math.max((short * short * n.area) / (s * s), (s * s) / (short * short * n.area))));
      if (worst > best) break; row = next; best = worst;
    }
    const s = row.reduce((a, b) => a + b.area, 0); const thick = s / short; let off = 0;
    for (const r of row) {
      const len = r.area / thick;
      out.push(w >= h ? { item: r.item, x, y: y + off, w: thick, h: len } : { item: r.item, x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}
const stack = [root];
function render() {
  const node = stack[stack.length - 1]; const map = document.getElementById('map');
  map.textContent = '';
  const { width, height } = map.getBoundingClientRect();
  const kids = (node.children || []).filter((c) => c.bytes > 0);
  squarify(kids, 0, 0, width, height).forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'cell' + (r.item.children && r.item.children.length ? ' zoom' : '');
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', background: palette[i % palette.length] });
    el.title = r.item.name + ': ' + fmt(r.item.bytes);
    if (r.w > 60 && r.h > 30) {
      const b = document.createElement('b'); b.textContent = r.item.name;
      const s = document.createElement('span'); s.textContent = fmt(r.item.bytes);
      el.append(b, s);
    }
    if (r.item.children && r.item.children.length) el.onclick = () => { stack.push(r.item); render(); };
    map.append(el);
  });
  const crumb = document.getElementById('crumb'); crumb.textContent = '';
  stack.forEach((n, i) => {
    if (i) crumb.append(' / ');
    const label = (i ? n.name : 'all entrypoints') + ' (' + fmt(n.bytes) + ')';
    if (i < stack.length - 1) {
      const a = document.createElement('a'); a.textContent = label;
      a.onclick = () => { stack.length = i + 1; render(); }; crumb.append(a);
    } else crumb.append(label);
  });
}
addEventListener('resize', render); render();
</script>
</body>
</html>
`;
}

/** Writes `stats-<browser>.html` and `meta-<browser>.json` into `dir`. */
export function writeAnalysis(
  dir: string,
  browser: string,
  entries: EntrySize[],
  metafiles: Metafile[],
): { html: string; json: string } {
  mkdirSync(dir, { recursive: true });
  const html = join(dir, `stats-${browser}.html`);
  const json = join(dir, `meta-${browser}.json`);
  writeFileSync(html, renderTreemapHtml(browser, entries));
  writeFileSync(json, JSON.stringify(mergeMetafiles(metafiles)));
  return { html, json };
}
