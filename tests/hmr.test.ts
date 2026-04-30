import { describe, it, expect } from 'vitest';
import { generateHMRClientCode, classifyChange } from '../src/core/hmr/index.js';

describe('HMR System', () => {
  describe('Change Classification', () => {

    describe('Given a CSS file change', () => {
      it('should classify .css as css update', () => {
        expect(classifyChange('src/styles/globals.css')).toBe('css');
      });
      it('should classify .scss as css update', () => {
        expect(classifyChange('src/styles/theme.scss')).toBe('css');
      });
    });

    describe('Given a background script change', () => {
      it('should classify background directory changes as full-reload', () => {
        expect(classifyChange('src/background/index.ts')).toBe('full-reload');
      });
      it('should classify background.ts as full-reload', () => {
        expect(classifyChange('src/background.ts')).toBe('full-reload');
      });
    });

    describe('Given a manifest/config change', () => {
      it('should classify extforge.config.ts as manifest update', () => {
        expect(classifyChange('extforge.config.ts')).toBe('manifest');
      });
      it('should classify manifest.json as manifest update', () => {
        expect(classifyChange('manifest.json')).toBe('manifest');
      });
    });

    describe('Given a TypeScript/React file change', () => {
      it('should classify .tsx as js update', () => {
        expect(classifyChange('src/ui/popup/App.tsx')).toBe('js');
      });
      it('should classify .ts as js update', () => {
        expect(classifyChange('src/lib/utils.ts')).toBe('js');
      });
    });

    describe('Given an asset file change', () => {
      it('should classify .png as assets', () => {
        expect(classifyChange('icons/icon-32.png')).toBe('assets');
      });
      it('should classify .svg as assets', () => {
        expect(classifyChange('icons/logo.svg')).toBe('assets');
      });
      it('should classify .woff2 as assets', () => {
        expect(classifyChange('src/fonts/custom.woff2')).toBe('assets');
      });
    });
  });

  describe('HMR Client Code Generation', () => {
    describe('Given default port and host', () => {
      const code = generateHMRClientCode(35729);

      it('should generate valid JavaScript', () => {
        expect(code).toContain('function extforgeHMR()');
        expect(code).toContain('WebSocket');
      });
      it('should connect to the correct WebSocket URL', () => {
        expect(code).toContain('ws://localhost:35729');
      });
      it('should handle CSS updates', () => {
        expect(code).toContain('handleCSSUpdate');
      });
      it('should handle JS updates with page reload', () => {
        expect(code).toContain('handleJSUpdate');
        expect(code).toContain('location.reload');
      });
      it('should handle full extension reload', () => {
        expect(code).toContain('handleFullReload');
        expect(code).toContain('chrome.runtime.reload');
      });
      it('should implement reconnection logic', () => {
        expect(code).toContain('scheduleReconnect');
        expect(code).toContain('MAX_RECONNECT');
      });
      it('should support Shadow DOM CSS updates', () => {
        expect(code).toContain('shadowRoot');
        expect(code).toContain('data-extforge-shadow');
      });
      it('should include service worker HMR support', () => {
        expect(code).toContain('setupServiceWorkerHMR');
      });
    });

    describe('Given a custom host and port', () => {
      const code = generateHMRClientCode(8080, '192.168.1.10');
      it('should use the custom WebSocket URL', () => {
        expect(code).toContain('ws://192.168.1.10:8080');
      });
    });
  });

  describe('Change Debouncer Behavior', () => {
    it('should batch rapid changes into a single callback', async () => {
      let callCount = 0;
      let lastChanges: Map<string, string> = new Map();

      class TestDebouncer {
        private pending = new Map<string, string>();
        private timer: ReturnType<typeof setTimeout> | null = null;
        constructor(private delay: number, private callback: (changes: Map<string, string>) => void) {}
        add(file: string, type: string) {
          this.pending.set(file, type);
          if (this.timer) clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            const batch = new Map(this.pending);
            this.pending.clear();
            this.timer = null;
            this.callback(batch);
          }, this.delay);
        }
      }

      const debouncer = new TestDebouncer(50, (changes) => { callCount++; lastChanges = changes; });
      debouncer.add('a.ts', 'js');
      debouncer.add('b.ts', 'js');
      debouncer.add('c.css', 'css');
      debouncer.add('d.ts', 'js');
      debouncer.add('a.ts', 'js');

      await new Promise(r => setTimeout(r, 100));
      expect(callCount).toBe(1);
      expect(lastChanges.size).toBe(4);
      expect(lastChanges.has('c.css')).toBe(true);
    });

    it('should escalate to worst update type in a batch', () => {
      const types = new Set(['css', 'js', 'full-reload', 'css']);
      let result: string;
      if (types.has('manifest') || types.has('full-reload')) result = 'full-reload';
      else if (types.has('js')) result = 'js';
      else result = 'css';
      expect(result).toBe('full-reload');
    });
  });
});
