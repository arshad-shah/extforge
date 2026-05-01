import { beforeEach } from 'vitest';
import { installChromeFakes, resetChromeFakes, type ChromeFakes } from './install.js';

let fakes: ChromeFakes;
if ((globalThis as any).chrome === undefined) {
  fakes = installChromeFakes();
  (globalThis as any).__extforgeFakes = fakes;
} else {
  // Re-import path: reuse the bag stashed on the first import.
  fakes = (globalThis as any).__extforgeFakes;
  if (!fakes) {
    throw new Error(
      'globalThis.chrome is already defined but extforge fakes were not installed. ' +
      'Either remove the existing chrome global or import extforge/testing/vitest first.'
    );
  }
}

beforeEach(() => { resetChromeFakes(fakes); });

export { fakes };
