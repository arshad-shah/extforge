/**
 * HMR-runtime template loader. Reads `.tpl` files from `templates/` next
 * to this source file (`hmr/templates/`). Backed by the shared factory
 * in `core/util/template-loader.ts`.
 *
 * Templates here are injected into the user's browser bundle — they're
 * NOT user-facing scaffold files. Keeping them separate from
 * `scaffold/templates/` makes the publish surface clearer.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTemplateLoader } from '../util/template-loader.js';

const loader = createTemplateLoader({
  callerDir: dirname(fileURLToPath(import.meta.url)),
  subPath: 'core/hmr/templates',
});

export const loadTemplate = loader.loadTemplate;
export const loadTemplateRaw = loader.loadTemplateRaw;
export const setTemplatesDir = loader.setTemplatesDir;
