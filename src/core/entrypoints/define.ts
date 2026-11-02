/**
 * `extforge/entrypoints`: declare an entrypoint's options in the file itself.
 *
 *   // src/youtube.content.ts
 *   import { defineContentScript } from 'extforge/entrypoints';
 *
 *   export default defineContentScript({
 *     matches: ['*://*.youtube.com/*'],
 *     main() {
 *       // runs in the page
 *     },
 *   });
 *
 * The build reads the options statically (nothing runs at build time), adds
 * the matching `content_scripts` entry to the manifest, and calls `main()`
 * when the script loads. Options must be literals so they can be read without
 * executing the file; a variable or spread is reported as a warning.
 */

export type RunAt = 'document_start' | 'document_end' | 'document_idle';
export type World = 'ISOLATED' | 'MAIN';

export interface ContentScriptDefinition {
  /** Match patterns for pages to inject into. Required. */
  matches: string[];
  excludeMatches?: string[];
  runAt?: RunAt;
  allFrames?: boolean;
  matchAboutBlank?: boolean;
  world?: World;
  /** Runs when the script is injected. */
  main(): void | Promise<void>;
}

/** Identity at runtime: the build reads the options and wires up `main()`. */
export function defineContentScript(definition: ContentScriptDefinition): ContentScriptDefinition {
  return definition;
}
