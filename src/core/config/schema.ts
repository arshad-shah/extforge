import { z } from 'zod';
import type { CssTransform } from '../builder/css.js';

export const browserSchema = z.enum(['chrome', 'firefox', 'edge', 'safari']);
export const frameworkSchema = z.enum(['react', 'vanilla']);

/** Built-in CSS presets. */
export const cssPresetSchema = z.enum(['tailwind', 'vanilla', 'none']);

/**
 * A custom CSS processor: a programmatic `transform`, a CLI `command`
 * (+ `args`), or both. Lets any styling toolchain (Sass, Lightning CSS,
 * UnoCSS, PostCSS pipelines…) plug into the build.
 */
export const cssProcessorSchema = z.object({
  name: z.string(),
  transform: z.custom<CssTransform>((v) => typeof v === 'function').optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
}).refine((p) => p.transform !== undefined || p.command !== undefined, {
  message: 'A custom CSS processor needs a `transform` function or a `command`.',
});

/** `css` accepts a built-in preset name or a custom processor object. */
export const cssSchema = z.union([cssPresetSchema, cssProcessorSchema]);

export const extForgeConfigSchema = z.object({
  root: z.string().optional(),
  browsers: z.array(browserSchema).optional(),
  manifest: z.unknown().optional(),
  build: z.object({
    outDir: z.string().optional(),
    srcDir: z.string().optional(),
    sourcemap: z.boolean().optional(),
    esbuild: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  dev: z.object({
    port: z.number().int().min(1).max(65535).optional(),
    host: z.string().optional(),
    debounce: z.number().int().nonnegative().optional(),
    open: z.boolean().optional(),
    strictCompat: z.boolean().optional(),
  }).optional(),
  framework: frameworkSchema.optional(),
  css: cssSchema.optional(),
  plugins: z.array(z.unknown()).optional(),
}).passthrough();

export type ExtForgeConfigInput = z.input<typeof extForgeConfigSchema>;
