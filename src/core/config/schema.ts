import { z } from 'zod';

export const browserSchema = z.enum(['chrome', 'firefox', 'edge', 'safari']);
export const frameworkSchema = z.enum(['react', 'vue', 'svelte', 'solid', 'vanilla']);
export const cssSchema = z.enum(['tailwind', 'vanilla', 'none']);

export const extForgeConfigSchema = z.object({
  root: z.string().optional(),
  browsers: z.array(browserSchema).optional(),
  manifest: z.unknown().optional(),
  build: z.object({
    outDir: z.string().optional(),
    srcDir: z.string().optional(),
    sourcemap: z.boolean().optional(),
    esbuild: z.record(z.unknown()).optional(),
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
