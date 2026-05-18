/**
 * Hand-rolled CLI parser. Drop-in replacement for the citty subset we use.
 *
 * Supports:
 *   - Subcommands (one level deep)
 *   - Positional args (string only, optional vs required)
 *   - Boolean flags (--flag / --no-flag) with defaults
 *   - String flags (--flag value or --flag=value) with defaults
 *   - --help / -h, --version / -v
 *   - Tree-rendered help with descriptions
 *
 * NOT supported (deliberately): variadic positionals, short flag aliasing
 * beyond -h/-v, nested subcommands. We don't use those.
 */

import pc from '../core/logger/ansi.js';

export type ArgType = 'string' | 'boolean' | 'positional';

export interface ArgSpec {
  type: ArgType;
  description?: string;
  required?: boolean;
  default?: string | boolean;
}

export interface CommandMeta {
  name: string;
  description?: string;
  version?: string;
}

export interface CommandDef {
  meta: CommandMeta;
  args?: Record<string, ArgSpec>;
  subCommands?: Record<string, CommandDef>;
  run?(ctx: { args: Record<string, unknown> }): void | Promise<void>;
}

export function defineCommand(def: CommandDef): CommandDef {
  return def;
}

/**
 * Top-level entry. Reads `process.argv.slice(2)` and dispatches.
 * Errors thrown from `run` propagate so the existing `withErrorHandler`
 * wrapper continues to work.
 */
export async function runMain(root: CommandDef): Promise<void> {
  const argv = process.argv.slice(2);
  await runCommand(root, argv, []);
}

async function runCommand(cmd: CommandDef, argv: string[], parentChain: string[]): Promise<void> {
  // Subcommand dispatch happens BEFORE flag parsing so subcommand-specific
  // flags don't get interpreted by the parent.
  if (cmd.subCommands && argv.length > 0 && !argv[0]!.startsWith('-')) {
    const sub = cmd.subCommands[argv[0]!];
    if (sub) {
      await runCommand(sub, argv.slice(1), [...parentChain, cmd.meta.name]);
      return;
    }
  }

  // Global flags handled here so they work at any depth.
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp(cmd, parentChain);
    return;
  }
  if ((argv.includes('--version') || argv.includes('-v')) && cmd.meta.version) {
    process.stdout.write(`${cmd.meta.version}\n`);
    return;
  }

  // No run handler at this level → must be a parent command. Print help.
  if (!cmd.run) {
    printHelp(cmd, parentChain);
    return;
  }

  const args = parseArgs(cmd, argv);
  await cmd.run({ args });
}

/**
 * Parse argv into the shape `cmd.run` expects: a flat record keyed by
 * arg name. Validates required positionals.
 */
function parseArgs(cmd: CommandDef, argv: string[]): Record<string, unknown> {
  const specs = cmd.args ?? {};
  const positionalNames: string[] = [];
  const out: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(specs)) {
    if (spec.type === 'positional') positionalNames.push(name);
    if (spec.default !== undefined) out[name] = spec.default;
    if (spec.type === 'boolean' && spec.default === undefined) out[name] = false;
  }

  let posIdx = 0;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;

    if (tok === '--') {
      // Everything after `--` is positional, even if it looks like a flag.
      for (let j = i + 1; j < argv.length; j++) {
        const name = positionalNames[posIdx++];
        if (name) out[name] = argv[j];
      }
      break;
    }

    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const flagName = (eq === -1 ? tok.slice(2) : tok.slice(2, eq));
      const inlineValue = eq === -1 ? undefined : tok.slice(eq + 1);

      // --no-foo → boolean false
      if (flagName.startsWith('no-')) {
        const realName = flagName.slice(3);
        if (specs[realName]?.type === 'boolean') {
          out[realName] = false;
          continue;
        }
      }

      const spec = specs[flagName];
      if (!spec) {
        throw new Error(`Unknown flag: --${flagName}`);
      }
      if (spec.type === 'boolean') {
        if (inlineValue !== undefined) {
          out[flagName] = inlineValue !== 'false' && inlineValue !== '0';
        } else {
          out[flagName] = true;
        }
        continue;
      }
      if (spec.type === 'string') {
        if (inlineValue !== undefined) {
          out[flagName] = inlineValue;
        } else {
          const next = argv[i + 1];
          // Reject *any* leading-dash token as the value — otherwise
          // `extforge dev --port -h` swallows `-h` as the port and produces
          // a confusing `NaN` later. Callers can use `--port=-h` if they
          // genuinely want to pass a leading-dash literal.
          if (next === undefined || next.startsWith('-')) {
            throw new Error(`Flag --${flagName} expects a value`);
          }
          out[flagName] = next;
          i++;
        }
        continue;
      }
      throw new Error(`Cannot use --${flagName} with positional type`);
    }

    if (tok.startsWith('-') && tok !== '-') {
      // We only honour -h and -v as global aliases (handled in runCommand).
      // Unknown short flags are an error.
      throw new Error(`Unknown short flag: ${tok}`);
    }

    // Positional.
    const name = positionalNames[posIdx++];
    if (name) out[name] = tok;
    // Extra positionals are silently dropped (matches citty's behaviour for
    // commands that don't declare them).
  }

  for (const [name, spec] of Object.entries(specs)) {
    if (spec.type === 'positional' && spec.required && out[name] === undefined) {
      throw new Error(`Missing required argument: ${name}`);
    }
  }

  return out;
}

function printHelp(cmd: CommandDef, parentChain: string[]): void {
  const fullName = [...parentChain, cmd.meta.name].join(' ');
  const out = process.stdout;

  out.write('\n');
  if (cmd.meta.description) {
    out.write(`${pc.bold(fullName)} — ${cmd.meta.description}\n\n`);
  } else {
    out.write(`${pc.bold(fullName)}\n\n`);
  }

  out.write(`${pc.bold('USAGE')}\n`);
  if (cmd.subCommands && Object.keys(cmd.subCommands).length > 0) {
    out.write(`  ${fullName} <command> [options]\n\n`);
  } else {
    const positionals = Object.entries(cmd.args ?? {})
      .filter(([, s]) => s.type === 'positional')
      .map(([n, s]) => (s.required ? `<${n}>` : `[${n}]`))
      .join(' ');
    out.write(`  ${fullName}${positionals ? ' ' + positionals : ''} [options]\n\n`);
  }

  if (cmd.subCommands && Object.keys(cmd.subCommands).length > 0) {
    out.write(`${pc.bold('COMMANDS')}\n`);
    const max = Math.max(...Object.keys(cmd.subCommands).map(k => k.length));
    for (const [name, sub] of Object.entries(cmd.subCommands)) {
      out.write(`  ${name.padEnd(max + 2)}${pc.dim(sub.meta.description ?? '')}\n`);
    }
    out.write('\n');
  }

  if (cmd.args && Object.keys(cmd.args).length > 0) {
    out.write(`${pc.bold('OPTIONS')}\n`);
    const rows = Object.entries(cmd.args).map(([name, spec]) => {
      const flag = spec.type === 'positional'
        ? `<${name}>`
        : `--${name}${spec.type === 'string' ? ' <value>' : ''}`;
      return [flag, spec.description ?? '', spec.default];
    });
    const max = Math.max(...rows.map(r => (r[0] as string).length));
    for (const [flag, desc, def] of rows) {
      const defText = def !== undefined ? pc.dim(`  (default: ${String(def)})`) : '';
      out.write(`  ${(flag as string).padEnd(max + 2)}${pc.dim(desc as string)}${defText}\n`);
    }
    out.write('\n');
  }

  out.write(`${pc.dim(`Run with --help on any subcommand for details.`)}\n`);
}
