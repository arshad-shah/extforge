// src/core/testing/fakes/action.ts
import { spy, type Spy } from '../internal/spy.js';

export interface ActionFake {
  readonly chrome: {
    setBadgeText: Spy<(details: { text: string; tabId?: number }) => Promise<void>>;
    getBadgeText: Spy<(details: { tabId?: number }) => Promise<string>>;
    setIcon: Spy<(details: Record<string, unknown>) => Promise<void>>;
    enable: Spy<(tabId?: number) => Promise<void>>;
    disable: Spy<(tabId?: number) => Promise<void>>;
  };
  reset(): void;
}

export function createActionFake(): ActionFake {
  const badges = new Map<number | 'global', string>();

  const setBadgeText = spy(async ({ text, tabId }: { text: string; tabId?: number }) => {
    badges.set(tabId ?? 'global', text);
  });
  const getBadgeText = spy(async ({ tabId }: { tabId?: number }) => {
    return badges.get(tabId ?? 'global') ?? '';
  });
  const setIcon = spy(async (_d: Record<string, unknown>) => undefined);
  const enable  = spy(async (_tabId?: number) => undefined);
  const disable = spy(async (_tabId?: number) => undefined);

  return {
    chrome: { setBadgeText, getBadgeText, setIcon, enable, disable },
    reset() {
      badges.clear();
      setBadgeText.reset(); getBadgeText.reset(); setIcon.reset();
      enable.reset(); disable.reset();
    },
  };
}
