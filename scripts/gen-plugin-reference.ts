import { Project } from 'ts-morph';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path/posix';
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

function escapeType(s: string): string { return s.replace(/\|/g, '\\|'); }
function escapeDoc(s: string): string { return s.replace(/\{/g, '\\{').replace(/\}/g, '\\}'); }

function renderInterface(decl: any): string {
  const name = decl.getName();
  const docs = decl.getJsDocs().map((d: any) => d.getDescription().trim()).join('\n\n');

  const propRows = decl.getProperties().map((p: any) => {
    const pname = p.getName();
    const ptype = p.getType().getText(p);
    const pdoc = p.getJsDocs().map((d: any) => d.getDescription().trim()).join(' ');
    const opt = p.hasQuestionToken() ? '?' : '';
    return `| \`${pname}${opt}\` | \`${escapeType(ptype)}\` | ${escapeDoc(pdoc)} |`;
  });

  // Methods on interfaces are not returned by getProperties(); fetch them
  // separately so PluginHooks/PluginContext members render in the table.
  const methodRows = (decl.getMethods?.() ?? []).map((m: any) => {
    const mname = m.getName();
    const params = m.getParameters().map((p: any) => {
      const pname = p.getName();
      const ptype = p.getType().getText(p);
      const opt = p.hasQuestionToken() ? '?' : '';
      return `${pname}${opt}: ${ptype}`;
    }).join(', ');
    const ret = m.getReturnType().getText(m);
    const sig = `(${params}) => ${ret}`;
    const mdoc = m.getJsDocs().map((d: any) => d.getDescription().trim()).join(' ');
    return `| \`${mname}\` | \`${escapeType(sig)}\` | ${escapeDoc(mdoc)} |`;
  });

  const allRows = [...propRows, ...methodRows];
  if (allRows.length === 0) {
    return [`### \`${name}\``, docs, ''].join('\n');
  }
  return [
    `### \`${name}\``,
    docs,
    '',
    '| Member | Type | Description |',
    '|---|---|---|',
    ...allRows,
    '',
  ].join('\n');
}

const sections = typesFile.getInterfaces().map(renderInterface).join('\n');
const apiMd = `---
title: Plugin API
description: Every type you need to write an ExtForge plugin.
---

ExtForge plugins are TypeScript objects implementing \`ExtForgePluginV1\`. They register hooks during \`setup()\` and the runner fires those hooks at well-defined points in the build.

## Module exports

\`extforge/plugins\` exports:

| Export | Kind | Notes |
|---|---|---|
| \`presetReact\` | function | The first-party React preset. See [presetReact](/reference/plugins/preset-react/). |
| \`PresetReactOptions\` | type | Options accepted by \`presetReact()\`. |
| \`ExtForgePluginV1\` | interface | The modern plugin shape (\`apiVersion: 1\`). Documented below. |
| \`ExtForgePluginLegacy\` | interface | The pre-v1 plugin shape, still accepted. Documented below. |
| \`ExtForgePlugin\` | type | Union of \`ExtForgePluginV1 | ExtForgePluginLegacy\`. |
| \`PluginContext\`, \`PluginHooks\`, \`EntryDescriptor\` | interfaces | The context, hook registry, and entry descriptor. Documented below. |
| \`ManifestObject\` | type | \`Record<string, unknown>\` — the untyped manifest passed to \`onManifestTransform\`. |
| \`PluginRunner\` | class | The engine that loads plugins and fires hooks. Exported for advanced/test use; most plugins never touch it. |

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
