/**
 * ExtForge Scaffold Engine
 *
 * All static content loaded from templates/*.tpl files.
 * All versions/defaults from constants.ts.
 * Logic only — no inlined template strings.
 */

import prompts from 'prompts';
import pc from 'picocolors';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'pathe';
import { createLogger, type Logger } from '../logger/index.js';
import { PERMISSION_GROUPS, type Browser } from '../manifest/index.js';
import { VERSIONS, DEFAULTS, PKG_SCRIPTS, BASE_DIRS, FEATURE_DIRS } from './constants.js';
import { loadTemplate, loadTemplateRaw } from './template-loader.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  defaults?: boolean;
  targetDir?: string;
  name?: string;
}

export interface ScaffoldAnswers {
  name: string;
  description: string;
  version: string;
  framework: 'react' | 'vue' | 'svelte' | 'solid' | 'vanilla';
  css: 'tailwind' | 'vanilla' | 'none';
  browsers: Browser[];
  features: string[];
  permissions: string[];
}

// ─── Interactive prompts ─────────────────────────────────────────────────────

async function gatherAnswers(options: ScaffoldOptions): Promise<ScaffoldAnswers | null> {
  console.log('');
  console.log('  ' + pc.bold(pc.magenta('extforge')) + pc.dim(' › ') + pc.bold('create a new browser extension'));
  console.log(pc.dim('  Answer a few questions to scaffold your project.\n'));

  const response = await prompts([
    {
      type: 'text', name: 'name', message: 'Extension name',
      initial: options.name ?? DEFAULTS.name,
      validate: (v: string) => {
        if (!v.trim()) return 'Name is required';
        if (v.length > 45) return 'Name must be 45 characters or less';
        if (!/^[a-z0-9-]+$/i.test(v.trim().replace(/\s+/g, '-'))) return 'Letters, numbers, hyphens only';
        return true;
      },
    },
    { type: 'text', name: 'description', message: 'Description', initial: DEFAULTS.description },
    {
      type: 'text', name: 'version', message: 'Version', initial: DEFAULTS.version,
      validate: (v: string) => /^\d+\.\d+\.\d+$/.test(v) || 'Must be semver (e.g. 0.1.0)',
    },
    {
      type: 'select', name: 'framework', message: 'UI framework',
      choices: [
        { title: `${pc.cyan('React')}      — Component-based with JSX/TSX`, value: 'react' },
        { title: `${pc.green('Vue')}        — Progressive framework with SFCs`, value: 'vue' },
        { title: `${pc.red('Svelte')}     — Compile-time reactive`, value: 'svelte' },
        { title: `${pc.blue('Solid')}      — Fine-grained reactive`, value: 'solid' },
        { title: `${pc.yellow('Vanilla')}    — Plain TypeScript`, value: 'vanilla' },
      ],
      initial: 0,
    },
    {
      type: 'select', name: 'css', message: 'CSS framework',
      choices: [
        { title: `${pc.cyan('Tailwind CSS')} — Utility-first CSS`, value: 'tailwind' },
        { title: `${pc.yellow('Vanilla CSS')}  — Plain CSS/PostCSS`, value: 'vanilla' },
        { title: `${pc.dim('None')}          — No CSS setup`, value: 'none' },
      ],
      initial: 0,
    },
    {
      type: 'multiselect', name: 'browsers', message: 'Target browsers', min: 1,
      hint: '— Space to toggle, Enter to confirm',
      choices: [
        { title: 'Chrome',  value: 'chrome',  selected: true },
        { title: 'Firefox', value: 'firefox', selected: true },
        { title: 'Edge',    value: 'edge',    selected: false },
        { title: 'Safari',  value: 'safari',  selected: false },
      ],
    },
    {
      type: 'multiselect', name: 'features', message: 'Extension features',
      hint: '— Space to toggle',
      choices: [
        { title: `${pc.cyan('Popup')}           — Toolbar popup`, value: 'popup', selected: true },
        { title: `${pc.green('Background')}      — Service worker`, value: 'background', selected: true },
        { title: `${pc.yellow('Content Script')}  — Inject into pages`, value: 'content', selected: false },
        { title: `${pc.magenta('Options Page')}    — Settings page`, value: 'options', selected: false },
        { title: `${pc.blue('Side Panel')}      — Browser side panel`, value: 'sidepanel', selected: false },
      ],
    },
    {
      type: 'multiselect', name: 'permissions', message: 'Permissions',
      hint: '— Space to toggle',
      choices: Object.entries(PERMISSION_GROUPS).flatMap(([group, info]) =>
        info.permissions.map(perm => ({
          title: `${pc.dim(`[${group}]`)} ${perm}`,
          value: perm,
          selected: DEFAULTS.permissions.includes(perm as any),
        }))
      ),
    },
  ], { onCancel: () => { console.log(pc.red('\n  Cancelled.\n')); return false; } });

  if (!response.name) return null;
  return response as ScaffoldAnswers;
}

// ─── Package.json builder ────────────────────────────────────────────────────

function buildPackageJson(a: ScaffoldAnswers): string {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    extforge:     '^1.0.0',
    typescript:   VERSIONS.typescript,
    '@types/chrome': VERSIONS.chromTypes,
    esbuild:      VERSIONS.esbuild,
    vitest:       VERSIONS.vitest,
  };

  if (a.framework === 'react') {
    deps['react'] = VERSIONS.react;
    deps['react-dom'] = VERSIONS.reactDom;
    devDeps['@types/react'] = VERSIONS.reactTypes;
    devDeps['@types/react-dom'] = VERSIONS.reactDomTypes;
    deps['zustand'] = VERSIONS.zustand;
  }
  if (a.framework === 'vue')    deps['vue'] = VERSIONS.vue;
  if (a.framework === 'svelte') deps['svelte'] = VERSIONS.svelte;
  if (a.framework === 'solid')  deps['solid-js'] = VERSIONS.solidJs;

  if (a.css === 'tailwind') {
    devDeps['tailwindcss'] = VERSIONS.tailwindcss;
    devDeps['postcss'] = VERSIONS.postcss;
    devDeps['autoprefixer'] = VERSIONS.autoprefixer;
  }

  return JSON.stringify({
    name: a.name, version: a.version, description: a.description,
    type: 'module',
    scripts: { ...PKG_SCRIPTS },
    dependencies: deps,
    devDependencies: devDeps,
  }, null, 2);
}

// ─── extforge.config.ts builder ──────────────────────────────────────────────

function buildExtForgeConfig(a: ScaffoldAnswers): string {
  const hostLine = a.features.includes('content')
    ? `      host: ['https://*/*', 'http://*/*'],`
    : `      host: [],`;

  const sections: string[] = [];

  if (a.features.includes('popup')) {
    sections.push(`
    action: {
      defaultPopup: 'ui/popup/index.html',
      defaultIcon: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png' },
      defaultTitle: '${a.name}',
    },`);
  }
  if (a.features.includes('background')) {
    sections.push(`
    background: { entrypoint: 'background/index.js' },`);
  }
  if (a.features.includes('content')) {
    sections.push(`
    contentScripts: [{
      matches: ['<all_urls>'],
      js: ['content/index.js'],
      css: ['styles/content.css'],
      runAt: 'document_idle',
    }],`);
  }
  if (a.features.includes('options')) {
    sections.push(`
    optionsPage: 'ui/options/index.html',`);
  }
  if (a.features.includes('sidepanel')) {
    sections.push(`
    sidePanel: { defaultPath: 'ui/sidepanel/index.html' },`);
  }

  return `import { defineConfig } from 'extforge';

export default defineConfig({
  browsers: [${a.browsers.map(b => `'${b}'`).join(', ')}],
  framework: '${a.framework}',
  css: '${a.css}',

  manifest: {
    name: '${a.name}',
    version: '${a.version}',
    description: '${a.description}',
    manifestVersion: 3,

    permissions: {
      required: [${a.permissions.map(p => `'${p}'`).join(', ')}],
      optional: [],
${hostLine}
    },
${sections.join('\n')}

    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },

    webAccessibleResources: [{
      resources: ['styles/content.css'],
      matches: ['<all_urls>'],
    }],
  },
});
`;
}

// ─── tsconfig builder ────────────────────────────────────────────────────────

function buildTSConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx',
      strict: true, noEmit: true, esModuleInterop: true, skipLibCheck: true,
      forceConsistentCasingInFileNames: true, resolveJsonModule: true,
      isolatedModules: true,
      paths: { '@/*': ['./src/*'] },
      types: ['chrome'],
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2);
}

// ─── Main scaffold ──────────────────────────────────────────────────────────

export async function scaffold(
  options: ScaffoldOptions = {},
  logger?: Logger,
): Promise<string | null> {
  const log = logger ?? createLogger({ scope: 'scaffold' });

  const answers: ScaffoldAnswers = options.defaults
    ? {
        name: options.name ?? DEFAULTS.name,
        description: DEFAULTS.description,
        version: DEFAULTS.version,
        framework: DEFAULTS.framework,
        css: DEFAULTS.css,
        browsers: [...DEFAULTS.browsers] as Browser[],
        features: [...DEFAULTS.features],
        permissions: [...DEFAULTS.permissions],
      }
    : (await gatherAnswers(options)) as ScaffoldAnswers;

  if (!answers) return null;

  const projectDir = options.targetDir ?? join(process.cwd(), answers.name);

  if (existsSync(projectDir)) {
    log.error(`Directory already exists: ${projectDir}`);
    return null;
  }

  log.time('scaffold');
  log.info(`Scaffolding ${pc.bold(answers.name)} in ${pc.cyan(projectDir)}...`);

  // Template interpolation vars
  const vars = {
    NAME: answers.name,
    DESCRIPTION: answers.description,
    VERSION: answers.version,
  };

  // Create directories
  const dirs = [...BASE_DIRS] as string[];
  for (const feat of answers.features) {
    const dir = FEATURE_DIRS[feat];
    if (dir) dirs.push(dir);
  }
  for (const d of dirs) mkdirSync(join(projectDir, d), { recursive: true });

  // Write generated config files
  writeFileSync(join(projectDir, 'package.json'), buildPackageJson(answers));
  writeFileSync(join(projectDir, 'extforge.config.ts'), buildExtForgeConfig(answers));
  writeFileSync(join(projectDir, 'tsconfig.json'), buildTSConfig());

  // Write template files (loaded from .tpl, interpolated)
  writeFileSync(join(projectDir, 'vitest.config.ts'), loadTemplateRaw('vitest.config.ts.tpl'));
  writeFileSync(join(projectDir, '.gitignore'), loadTemplateRaw('gitignore.tpl'));
  writeFileSync(join(projectDir, 'README.md'), loadTemplate('README.md.tpl', vars));
  writeFileSync(join(projectDir, 'tests/extension.test.ts'), loadTemplate('extension.test.ts.tpl', vars));
  mkdirSync(join(projectDir, 'tests/e2e'), { recursive: true });
  writeFileSync(join(projectDir, 'tests/e2e/fixture.ts'), loadTemplateRaw('e2e/fixture.ts.tpl'));
  writeFileSync(join(projectDir, 'tests/e2e/smoke.test.ts'), loadTemplateRaw('e2e/smoke.test.ts.tpl'));
  writeFileSync(join(projectDir, 'icons/icon.svg'), loadTemplateRaw('icon.svg.tpl'));
  writeFileSync(join(projectDir, 'src/styles/globals.css'), loadTemplateRaw('globals.css.tpl'));
  writeFileSync(join(projectDir, 'src/styles/content.css'), loadTemplateRaw('content.css.tpl'));

  if (answers.css === 'tailwind') {
    writeFileSync(join(projectDir, 'tailwind.config.js'), loadTemplateRaw('tailwind.config.js.tpl'));
    writeFileSync(join(projectDir, 'postcss.config.js'), loadTemplateRaw('postcss.config.js.tpl'));
  }

  // Feature-specific source files
  if (answers.framework === 'react') {
    mkdirSync(join(projectDir, 'src/components'), { recursive: true });
    writeFileSync(join(projectDir, 'src/components/ErrorBoundary.tsx'), loadTemplateRaw('error-boundary.tsx.tpl'));
  }
  if (answers.features.includes('popup')) {
    writeFileSync(join(projectDir, 'src/ui/popup/index.html'), loadTemplate('popup.html.tpl', vars));
    if (answers.framework === 'react')
      writeFileSync(join(projectDir, 'src/ui/popup/index.tsx'), loadTemplate('popup.tsx.tpl', vars));
  }
  if (answers.features.includes('background'))
    writeFileSync(join(projectDir, 'src/background/index.ts'), loadTemplateRaw('background.ts.tpl'));
  if (answers.features.includes('content'))
    writeFileSync(join(projectDir, 'src/content/index.ts'), loadTemplateRaw('content.ts.tpl'));
  if (answers.features.includes('options'))
    writeFileSync(join(projectDir, 'src/ui/options/index.html'), loadTemplate('popup.html.tpl', { NAME: answers.name + ' - Options' }));
  if (answers.features.includes('sidepanel'))
    writeFileSync(join(projectDir, 'src/ui/sidepanel/index.html'), loadTemplate('popup.html.tpl', { NAME: answers.name + ' - Side Panel' }));

  log.timeEnd('scaffold', 'Scaffolded project');

  console.log('');
  console.log(pc.bold(pc.green('  ✔ Project created!')));
  console.log('');
  console.log(pc.dim('  Next steps:'));
  console.log(`    ${pc.cyan('cd')} ${answers.name}`);
  console.log(`    ${pc.cyan('npm install')}`);
  console.log(`    ${pc.cyan('npm run dev')}`);
  console.log('');
  console.log(pc.dim(`  Then load the extension from ${pc.cyan('dist/chrome/')} in your browser.`));
  console.log('');

  return projectDir;
}
