import { describe, it, expect } from 'vitest';
import * as testingBarrel from '../src/core/testing/index.js';

describe('extforge/testing barrel', () => {
  it('re-exports the public API surface', () => {
    expect(typeof testingBarrel.installChromeFakes).toBe('function');
    expect(typeof testingBarrel.createChromeFakes).toBe('function');
    expect(typeof testingBarrel.resetChromeFakes).toBe('function');
    expect(typeof testingBarrel.createRuntimeFake).toBe('function');
    expect(typeof testingBarrel.createStorageFake).toBe('function');
    expect(typeof testingBarrel.createTabsFake).toBe('function');
    expect(typeof testingBarrel.createActionFake).toBe('function');
    expect(typeof testingBarrel.createScriptingFake).toBe('function');
  });
});
