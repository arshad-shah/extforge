import { defineCommand } from '@arshad-shah/clif';

export const icons = defineCommand({
  name: 'icons',
  description: 'Generate PNG icons from SVG',
  async handler() {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const { createLogger } = await import('../../core/logger/index.js');

    const log = createLogger({ scope: 'extforge' });
    const svg = join(process.cwd(), 'icons/icon.svg');
    if (!existsSync(svg)) { log.error('No icons/icon.svg found'); process.exit(1); }

    const sizes = [16, 32, 48, 128];
    const sharpOk = sizes.every((s) => {
      const out = join(process.cwd(), `icons/icon-${s}.png`);
      const r = spawnSync('npx', ['sharp-cli', '-i', svg, '-o', out, 'resize', String(s), String(s)], {
        stdio: 'pipe', shell: false,
      });
      if (r.status === 0) {
        log.success(`Generated icon-${s}.png`);
        return true;
      }
      return false;
    });
    if (sharpOk) return;

    log.warn('sharp-cli not available — trying cairosvg...');
    const pyLines = sizes
      .map((s) => `cairosvg.svg2png(url=sys.argv[1], write_to=sys.argv[${sizes.indexOf(s) + 2}], output_width=${s}, output_height=${s})`)
      .join('\n');
    const pyScript = `import sys, cairosvg\n${pyLines}\n`;
    const pyArgs = ['-c', pyScript, svg, ...sizes.map((s) => join(process.cwd(), `icons/icon-${s}.png`))];
    const r = spawnSync('python3', pyArgs, { cwd: process.cwd(), stdio: 'pipe', shell: false });
    if (r.status !== 0) {
      log.error('Install sharp-cli (npm i -g sharp-cli) or cairosvg (pip install cairosvg)');
    }
  },
});
