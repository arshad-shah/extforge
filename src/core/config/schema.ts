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
export const cssProcessorSchema = z
  .object({
    name: z.string(),
    transform: z.custom<CssTransform>((v) => typeof v === 'function').optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
  })
  .refine((p) => p.transform !== undefined || p.command !== undefined, {
    message: 'A custom CSS processor needs a `transform` function or a `command`.',
  });

/** `css` accepts a built-in preset name or a custom processor object. */
export const cssSchema = z.union([cssPresetSchema, cssProcessorSchema]);

/** `run_at` timing for a content script. */
export const runAtSchema = z.enum(['document_start', 'document_end', 'document_idle']);

/** Execution world for a content script. Uppercase, matching the manifest key. */
export const contentScriptWorldSchema = z.enum(['MAIN', 'ISOLATED']);

/**
 * One `manifest.contentScripts[]` entry. Loose on purpose: unknown keys pass
 * through (the config has always tolerated them) while the keys ExtForge
 * actually reads are type-checked, so `allFrames: 'yes'` or `world: 'main'`
 * fails at load time with a pointed message instead of producing a manifest
 * the browser rejects.
 */
export const contentScriptSchema = z
  .object({
    matches: z.array(z.string()),
    excludeMatches: z.array(z.string()).optional(),
    js: z.array(z.string()).optional(),
    css: z.array(z.string()).optional(),
    runAt: runAtSchema.optional(),
    allFrames: z.boolean().optional(),
    matchAboutBlank: z.boolean().optional(),
    world: contentScriptWorldSchema.optional(),
  })
  .passthrough();

/**
 * The manifest block. Only `contentScripts` is described — everything else
 * passes through untouched, exactly as it did when this was `z.unknown()`.
 */
export const manifestSchema = z
  .object({
    contentScripts: z.array(contentScriptSchema).optional(),
  })
  .passthrough();

export const extForgeConfigSchema = z
  .object({
    root: z.string().optional(),
    browsers: z.array(browserSchema).optional(),
    manifest: manifestSchema.optional(),
    build: z
      .object({
        outDir: z.string().optional(),
        srcDir: z.string().optional(),
        sourcemap: z.boolean().optional(),
        esbuild: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    dev: z
      .object({
        port: z.number().int().min(1).max(65535).optional(),
        host: z.string().optional(),
        debounce: z.number().int().nonnegative().optional(),
        open: z.boolean().optional(),
        strictCompat: z.boolean().optional(),
      })
      .optional(),
    framework: frameworkSchema.optional(),
    css: cssSchema.optional(),
    plugins: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type ExtForgeConfigInput = z.input<typeof extForgeConfigSchema>;
