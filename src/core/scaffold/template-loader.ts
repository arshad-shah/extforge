/**
 * Scaffold template loader. Reads `.tpl` files from `templates/` next to
 * this source file and applies `{{KEY}}` interpolation. Backed by the
 * shared factory in `core/util/template-loader.ts` so the resolution
 * rules stay consistent across scaffold + HMR templates.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTemplateLoader } from '../util/template-loader.js';

const loader = createTemplateLoader({
  callerDir: dirname(fileURLToPath(import.meta.url)),
  subPath: 'core/scaffold/templates',
});

export const loadTemplate = loader.loadTemplate;
export const loadTemplateRaw = loader.loadTemplateRaw;
export const setTemplatesDir = loader.setTemplatesDir;
