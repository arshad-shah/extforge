// src/core/testing/internal/spy.ts
// Minimal call-recording wrapper. Not a Jest/Sinon replacement — it just
// records calls and lets the test override the return value.

export interface Spy<F extends (...args: any[]) => any> {
  (...args: Parameters<F>): ReturnType<F>;
  calls: Array<Parameters<F>>;
  reset(): void;
}

export function spy<F extends (...args: any[]) => any>(impl: F): Spy<F> {
  const calls: Array<Parameters<F>> = [];
  const fn = ((...args: Parameters<F>) => {
    calls.push(args);
    return impl(...args);
  }) as Spy<F>;
  fn.calls = calls;
  fn.reset = () => { calls.length = 0; };
  return fn;
}
