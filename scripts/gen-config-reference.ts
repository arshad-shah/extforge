import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { extForgeConfigSchema } from '../src/core/config/schema.js';
import { SCHEMA_DOCS } from '../src/core/config/schema-docs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../docs-site/src/content/docs/reference/config');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

interface Field { path: string; type: string; doc?: string; defaultValue?: string }

function describeZod(node: any): string {
  const t = node._def?.typeName;
  switch (t) {
    case 'ZodOptional': return describeZod(node._def.innerType);
    case 'ZodEnum':     return node._def.values.map((v: string) => `'${v}'`).join(' \\| ');
    case 'ZodString':   return 'string';
    case 'ZodNumber':   return 'number';
    case 'ZodBoolean':  return 'boolean';
    case 'ZodArray':    return `Array<${describeZod(node._def.type)}>`;
    case 'ZodRecord':   return `Record<string, ${describeZod(node._def.valueType)}>`;
    case 'ZodObject':   return 'object';
    case 'ZodUnknown':  return 'unknown';
    default:            return t ?? 'unknown';
  }
}

function walk(schema: any, prefix: string, out: Field[]): void {
  const t = schema._def?.typeName;
  if (t === 'ZodOptional') return walk(schema._def.innerType, prefix, out);
  if (t === 'ZodObject') {
    const shape = typeof schema._def.shape === 'function' ? schema._def.shape() : schema.shape;
    for (const [key, sub] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push({ path, type: describeZod(sub) });
      walk(sub as any, path, out);
    }
  }
}

const fields: Field[] = [];
walk(extForgeConfigSchema, '', fields);

if (fields.length === 0) {
  console.error('gen-config-reference: ZERO fields found — Zod API mismatch. Inspect extForgeConfigSchema._def:');
  console.error(JSON.stringify(Object.keys((extForgeConfigSchema as any)._def), null, 2));
  process.exit(1);
}

for (const f of fields) {
  const doc = SCHEMA_DOCS[f.path];
  f.doc = doc?.description;
  f.defaultValue = doc?.defaultValue;
}

const topLevels = new Set(fields.filter(f => !f.path.includes('.')).map(f => f.path));

for (const top of topLevels) {
  const own = fields.find(f => f.path === top)!;
  const children = fields.filter(f => f.path.startsWith(`${top}.`));
  const lines: string[] = [
    `---`,
    `title: ${top}`,
    `description: ${own.doc ?? `Configuration for ${top}.`}`,
    `---`,
    ``,
    own.doc ? own.doc : `Configuration for \`${top}\`.`,
    ``,
    `**Type:** \`${own.type}\``,
  ];
  if (own.defaultValue) lines.push(`\n**Default:** \`${own.defaultValue}\``);
  lines.push('');
  if (children.length > 0) {
    lines.push(`## Fields\n`);
    lines.push(`| Path | Type | Default | Description |`);
    lines.push(`|---|---|---|---|`);
    for (const c of children) {
      lines.push(`| \`${c.path}\` | \`${c.type}\` | ${c.defaultValue ? `\`${c.defaultValue}\`` : '—'} | ${c.doc ?? ''} |`);
    }
  }
  writeFileSync(resolve(outDir, `${top}.mdx`), lines.join('\n') + '\n');
}

const indexRows = [...topLevels].map(t => {
  const f = fields.find(x => x.path === t)!;
  return `| [\`${t}\`](/reference/config/${t}/) | \`${f.type}\` | ${f.doc ?? ''} |`;
}).join('\n');

const indexMd = `---
title: Configuration reference
description: Every key in extforge.config.ts.
---

ExtForge reads its configuration from \`extforge.config.ts\` (or \`.js\`/\`.mjs\`) at the project root. The schema is permissive: unknown top-level keys produce a warning, not an error.

## Merging behavior

Defaults and user values are **deep-merged** for plain-object keys (e.g. \`dev\`, \`build\`). A partial override like \`dev: { port: 9000 }\` keeps \`host: 'localhost'\`, \`debounce: 150\`, and \`open: false\` from the defaults rather than dropping them. Arrays (\`browsers\`, \`plugins\`) and primitives are replaced wholesale.

Validation failures emit a warning by default; set \`EXTFORGE_STRICT_CONFIG=1\` to fail fast. The warning path becomes the default error in v0.4.0.

## Top-level keys

| Key | Type | Description |
|---|---|---|
${indexRows}
`;
writeFileSync(resolve(outDir, 'index.mdx'), indexMd);

console.log(`gen-config-reference: wrote ${topLevels.size + 1} files to ${outDir}`);
