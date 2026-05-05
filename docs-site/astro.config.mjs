import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://extforge.arshadshah.com',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'ExtForge',
      pagefind: true,
      logo: {
        light: './src/assets/logo.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/arshad-shah/extforge' },
      ],
      customCss: ['./src/styles/brand.css', './src/styles/overrides.css'],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'Install', slug: 'getting-started/install' },
            { label: 'Quick start', slug: 'getting-started/quick-start' },
            { label: 'Project layout', slug: 'getting-started/project-layout' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Configuration', slug: 'guides/configuration' },
            { label: 'HMR', slug: 'guides/hmr' },
            { label: 'Cross-browser', slug: 'guides/cross-browser' },
            { label: 'Plugins', slug: 'guides/plugins' },
            { label: 'Testing', slug: 'guides/testing' },
            { label: 'Deployment', slug: 'guides/deployment' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI commands', slug: 'reference/cli/commands' },
            { label: 'CLI flags', slug: 'reference/cli/flags' },
            { label: 'Configuration', autogenerate: { directory: 'reference/config' } },
            { label: 'Runtime packages', autogenerate: { directory: 'reference/runtime' } },
            { label: 'Plugin API', autogenerate: { directory: 'reference/plugins' } },
            { label: 'Testing helpers', autogenerate: { directory: 'reference/testing' } },
            { label: 'Errors', autogenerate: { directory: 'reference/errors' } },
          ],
        },
        { label: 'Brand', items: [{ label: 'Guidelines', slug: 'brand/guidelines' }] },
      ],
    }),
  ],
});
