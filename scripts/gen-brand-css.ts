import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'pathe';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tokens = JSON.parse(readFileSync(resolve(root, 'brand/tokens.json'), 'utf8'));

const c = tokens.color;
const f = tokens.font;
const out = `/* Generated from brand/tokens.json — do not edit by hand. Run \`pnpm docs:gen\`. */
:root {
  --ef-violet: ${c.brand.violet.value};
  --ef-violet-soft: ${c.brand['violet-soft'].value};
  --ef-amber: ${c.brand.amber.value};
  --ef-amber-deep: ${c.brand['amber-deep'].value};

  --ef-ink: ${c.ink.primary.value};
  --ef-ink-2: ${c.ink.secondary.value};
  --ef-ink-3: ${c.ink.muted.value};

  --ef-surface: ${c.surface.page.value};
  --ef-surface-subtle: ${c.surface.subtle.value};
  --ef-surface-raised: ${c.surface.raised.value};
  --ef-border: ${c.surface.border.value};

  --ef-success: ${c.semantic.success.value};
  --ef-warning: ${c.semantic.warning.value};
  --ef-error: ${c.semantic.error.value};
  --ef-info: ${c.semantic.info.value};

  --ef-font-sans: ${f.family.sans.value};
  --ef-font-mono: ${f.family.mono.value};
}
[data-theme='dark'] {
  --ef-violet: ${c.brand['violet-soft'].value};
  --ef-ink: ${c['ink-dark'].primary.value};
  --ef-ink-2: ${c['ink-dark'].secondary.value};
  --ef-ink-3: ${c['ink-dark'].muted.value};
  --ef-surface: ${c['surface-dark'].page.value};
  --ef-surface-subtle: ${c['surface-dark'].subtle.value};
  --ef-surface-raised: ${c['surface-dark'].raised.value};
  --ef-border: ${c['surface-dark'].border.value};
}
`;

const outPath = resolve(root, 'docs-site/src/styles/brand.css');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`gen-brand-css: wrote ${outPath} (${out.length} bytes)`);
