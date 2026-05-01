import { Project } from 'ts-morph';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'pathe';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../docs-site/src/content/docs/reference/plugins');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const project = new Project({
  tsConfigFilePath: resolve(__dirname, '../tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});
const typesFile  = project.addSourceFileAtPath(resolve(__dirname, '../src/core/plugins/types.ts'));
const presetFile = project.addSourceFileAtPath(resolve(__dirname, '../src/core/plugins/preset-react.ts'));

function renderInterface(decl: any): string {
  const name = decl.getName();
  const docs = decl.getJsDocs().map((d: any) => d.getDescription().trim()).join('\n\n');
  const props = decl.getProperties().map((p: any) => {
    const pname = p.getName();
    const ptype = p.getType().getText(p);
    const pdoc = p.getJsDocs().map((d: any) => d.getDescription().trim()).join(' ');
    const opt = p.hasQuestionToken() ? '?' : '';
    // Escape pipes in union types so they don't break MDX tables
    const escapedType = ptype.replace(/\|/g, '\\|');
    // Escape curly braces in descriptions so MDX doesn't parse them as JSX expressions
    const escapedDoc = pdoc.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    return `| \`${pname}${opt}\` | \`${escapedType}\` | ${escapedDoc} |`;
  });
  return [
    `### \`${name}\``,
    docs,
    '',
    '| Member | Type | Description |',
    '|---|---|---|',
    ...props,
    '',
  ].join('\n');
}

const sections = typesFile.getInterfaces().map(renderInterface).join('\n');
const apiMd = `---
title: Plugin API
description: Every type you need to write an ExtForge plugin.
---

ExtForge plugins are TypeScript objects implementing \`ExtForgePluginV1\`. They register hooks during \`setup()\` and the runner fires those hooks at well-defined points in the build.

${sections}

## Example

\`\`\`ts
import type { ExtForgePluginV1 } from 'extforge/plugins';

export function presetTailwind(): ExtForgePluginV1 {
  return {
    name: 'extforge:preset-tailwind',
    apiVersion: 1,
    setup({ hooks, logger }) {
      hooks.onBuildEntry((entry) => entry);
    },
  };
}
\`\`\`
`;
writeFileSync(resolve(outDir, 'api.mdx'), apiMd);

const presetIfaces = presetFile.getInterfaces().map(renderInterface).join('\n');
const presetMd = `---
title: presetReact
description: First-party React preset.
---

\`presetReact()\` is auto-injected by ExtForge when \`framework: 'react'\` is set in \`extforge.config.ts\`. You may also pass it explicitly to override the JSX import source or runtime.

${presetIfaces}

## Usage

\`\`\`ts
import { defineConfig } from 'extforge';
import { presetReact } from 'extforge/plugins';

export default defineConfig({
  plugins: [presetReact({ jsxImportSource: 'preact' })],
});
\`\`\`
`;
writeFileSync(resolve(outDir, 'preset-react.mdx'), presetMd);

console.log(`gen-plugin-reference: wrote 2 files to ${outDir}`);
