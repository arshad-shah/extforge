import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path/posix';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from '../src/core/errors/codes.js';
import { ERROR_DOCS } from '../src/core/errors/error-docs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../docs-site/src/content/docs/reference/errors');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const codes = Object.keys(ERROR_CODES) as Array<keyof typeof ERROR_CODES>;
const indexRows: string[] = [];

for (const code of codes) {
  const doc = ERROR_DOCS[code];
  if (!doc) {
    console.warn(`gen-error-codes: no description for ${code}`);
    continue;
  }
  const md = `---
title: ${code}
description: ${doc.title}
---

\`${code}\` — ${doc.description}

## When you see this

${doc.whenYouSeeThis}

## How to fix

${doc.howToFix}
`;
  writeFileSync(resolve(outDir, `${code}.mdx`), md);
  indexRows.push(`| [\`${code}\`](/reference/errors/${code}/) | ${doc.title} |`);
}

const indexMd = `---
title: Error codes
description: Every error code ExtForge can emit.
---

ExtForge errors carry a stable code so you can grep, link, and route. Every URL emitted by the CLI lives here.

| Code | Description |
|---|---|
${indexRows.join('\n')}
`;
writeFileSync(resolve(outDir, 'index.mdx'), indexMd);

console.log(`gen-error-codes: wrote ${codes.length + 1} files to ${outDir}`);
