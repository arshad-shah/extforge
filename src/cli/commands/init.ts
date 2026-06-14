import { defineCommand } from '@arshad-shah/clif';

export const init = defineCommand({
  name: 'init',
  description: 'Create a new browser extension project',
  // Typed positional (clif): surfaces in `--help` and lands on `args.values.name`.
  positionals: [
    { name: 'name', description: 'Project name (skips the name prompt)', required: false },
  ],
  args: {
    defaults: { type: 'boolean', description: 'Skip prompts, use defaults', default: false },
    dir:      { type: 'string', description: 'Target directory' },
  },
  async handler({ args }) {
    const { scaffold } = await import('../../core/scaffold/index.js');
    const { createLogger } = await import('../../core/logger/index.js');
    const name = (args.values.name as string | undefined) ?? args.positional[0];
    const result = await scaffold(
      {
        name,
        defaults: args.flags.defaults,
        targetDir: args.flags.dir as string | undefined,
      },
      createLogger({ scope: 'extforge' }),
    );
    if (!result) process.exit(1);
  },
});
