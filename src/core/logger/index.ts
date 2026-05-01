/**
 * ExtForge Logger
 *
 * Purpose-built structured logger for build tools.
 * Constants live at the top of this file for easy editing.
 */

import pc from 'picocolors';

// ─── Log Levels (co-located constant) ────────────────────────────────────────

export enum LogLevel {
  Silent = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  Success = 3, // alias for Info — success messages share the Info threshold
  Debug = 4,
  Trace = 5,
}

// ─── Badge definitions (co-located constant) ─────────────────────────────────
// Edit icons/colors here — they render in all log output.

const BADGES: Record<string, { icon: string; color: (s: string) => string }> = {
  error:   { icon: '✖', color: pc.red },
  warn:    { icon: '⚠', color: pc.yellow },
  info:    { icon: '●', color: pc.blue },
  success: { icon: '✔', color: pc.green },
  debug:   { icon: '◆', color: pc.magenta },
  trace:   { icon: '◇', color: pc.gray },
  time:    { icon: '⏱', color: pc.cyan },
  build:   { icon: '⚡', color: pc.yellow },
  hmr:     { icon: '🔥', color: pc.red },
  watch:   { icon: '👁', color: pc.blue },
};

// ─── HMR type colors (co-located constant) ───────────────────────────────────

const HMR_TYPE_COLORS: Record<string, (s: string) => string> = {
  css:           pc.magenta,
  js:            pc.yellow,
  'full-reload': pc.red,
  manifest:      pc.cyan,
  assets:        pc.green,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  args: unknown[];
  timestamp: number;
  duration?: number;
}

export type LogTransport = (entry: LogEntry) => void;

export interface LoggerOptions {
  level?: LogLevel;
  scope?: string;
  transports?: LogTransport[];
  /** When true, suppress human-formatted banner and summary output (use in --json mode). */
  silentHumanOutput?: boolean;
}

// ─── Color env detection ─────────────────────────────────────────────────────

const useColor = (): boolean => {
  if (process.env.FORCE_COLOR === '1') return true;
  if (process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true') return false;
  if (process.env.TERM === 'dumb') return false;
  return process.stdout.isTTY ?? false;
};

const tint = (fn: (s: string) => string, text: string): string =>
  useColor() ? fn(text) : text;

// ─── Format utilities ────────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatPath(filePath: string, cwd?: string): string {
  const base = cwd ?? process.cwd();
  const relative = filePath.startsWith(base)
    ? filePath.slice(base.length + 1)
    : filePath;
  return tint(pc.cyan, relative);
}

// ─── Default console transport ───────────────────────────────────────────────

function badgeForLevel(level: LogLevel) {
  switch (level) {
    case LogLevel.Error:   return BADGES.error;
    case LogLevel.Warn:    return BADGES.warn;
    case LogLevel.Debug:   return BADGES.debug;
    case LogLevel.Trace:   return BADGES.trace;
    default:               return BADGES.info;
  }
}

const consoleTransport: LogTransport = (entry: LogEntry) => {
  const badge = badgeForLevel(entry.level);
  const parts: string[] = [];

  parts.push(tint(badge.color, badge.icon));
  if (entry.scope) parts.push(tint(pc.dim, `[${entry.scope}]`));
  parts.push(entry.message);

  if (entry.duration !== undefined) {
    const durStr = formatDuration(entry.duration);
    const colorFn = entry.duration > 3000 ? pc.red : entry.duration > 1000 ? pc.yellow : pc.green;
    parts.push(tint(colorFn, `(${durStr})`));
  }

  const stream = entry.level <= LogLevel.Warn ? process.stderr : process.stdout;
  stream.write(parts.join(' ') + '\n');

  for (const arg of entry.args) {
    const text = typeof arg === 'object'
      ? '  ' + JSON.stringify(arg, null, 2).split('\n').join('\n  ')
      : '  ' + String(arg);
    stream.write(text + '\n');
  }
};

// ─── Logger ──────────────────────────────────────────────────────────────────

export class Logger {
  private level: LogLevel;
  private scope: string;
  private transports: LogTransport[];
  private silentHumanOutput: boolean;
  private timers = new Map<string, number>();

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? LogLevel.Info;
    this.scope = opts.scope ?? '';
    this.transports = opts.transports ?? [consoleTransport];
    this.silentHumanOutput = opts.silentHumanOutput ?? false;
  }

  setLevel(level: LogLevel): void { this.level = level; }
  getLevel(): LogLevel { return this.level; }

  child(scope: string, overrides?: Partial<LoggerOptions>): Logger {
    return new Logger({
      level: overrides?.level ?? this.level,
      scope: this.scope ? `${this.scope}:${scope}` : scope,
      transports: overrides?.transports ?? this.transports,
      silentHumanOutput: overrides?.silentHumanOutput ?? this.silentHumanOutput,
    });
  }

  private emit(level: LogLevel, message: string, args: unknown[], duration?: number): void {
    if (level > this.level) return;
    const entry: LogEntry = { level, scope: this.scope, message, args, timestamp: Date.now(), duration };
    for (const t of this.transports) t(entry);
  }

  error(msg: string, ...args: unknown[]) { this.emit(LogLevel.Error, tint(pc.red, msg), args); }
  warn(msg: string, ...args: unknown[])  { this.emit(LogLevel.Warn, tint(pc.yellow, msg), args); }
  info(msg: string, ...args: unknown[])  { this.emit(LogLevel.Info, msg, args); }
  debug(msg: string, ...args: unknown[]) { this.emit(LogLevel.Debug, tint(pc.dim, msg), args); }
  trace(msg: string, ...args: unknown[]) { this.emit(LogLevel.Trace, tint(pc.gray, msg), args); }

  success(msg: string, ...args: unknown[]) {
    if (LogLevel.Success > this.level) return;
    const entry: LogEntry = {
      level: LogLevel.Success, scope: this.scope,
      message: tint(pc.green, msg), args, timestamp: Date.now(),
    };
    for (const t of this.transports) t(entry);
  }

  // ── Timing ─────────────────────────────────────────────────────────

  time(label: string): void {
    this.timers.set(label, performance.now());
    this.debug(`Timer started: ${label}`);
  }

  timeEnd(label: string, message?: string): number {
    const start = this.timers.get(label);
    if (start === undefined) { this.warn(`Timer "${label}" does not exist`); return 0; }
    const duration = performance.now() - start;
    this.timers.delete(label);
    if (LogLevel.Info <= this.level) {
      const entry: LogEntry = {
        level: LogLevel.Info, scope: this.scope,
        message: message ?? label, args: [], timestamp: Date.now(), duration,
      };
      for (const t of this.transports) t(entry);
    }
    return duration;
  }

  // ── Build-tool helpers ─────────────────────────────────────────────

  file(path: string, sizeBytes: number, action: 'built' | 'changed' | 'deleted' = 'built'): void {
    const colors = { built: pc.green, changed: pc.yellow, deleted: pc.red };
    const icons  = { built: '📦', changed: '📝', deleted: '🗑️' };
    this.info(`${icons[action]} ${formatPath(path)} ${tint(colors[action], action)} ${tint(pc.dim, formatFileSize(sizeBytes))}`);
  }

  hmr(files: string[], type: string): void {
    const colorFn = HMR_TYPE_COLORS[type] ?? pc.white;
    const fileList = files.map(f => formatPath(f)).join(', ');
    this.emit(LogLevel.Info, `${tint(BADGES.hmr.color, BADGES.hmr.icon)} ${tint(colorFn, type)} ${fileList}`, []);
  }

  group<T>(title: string, fn: () => T): T;
  group<T>(title: string, fn: () => Promise<T>): Promise<T>;
  group<T>(title: string, fn: () => T | Promise<T>): T | Promise<T> {
    this.emit(LogLevel.Info, tint(pc.bold, title), []);
    return fn();
  }

  async step<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const t0 = performance.now();
    try {
      const result = await fn();
      const dur = performance.now() - t0;
      this.emit(LogLevel.Info, `${tint(pc.green, '✔')} ${name}`, [], dur);
      return result;
    } catch (err) {
      const dur = performance.now() - t0;
      this.emit(LogLevel.Error, `${tint(pc.red, '✖')} ${name}`, [], dur);
      throw err;
    }
  }

  summary(title: string, rows: Array<{ label: string; value: string }>): void {
    if (this.silentHumanOutput) return;
    this.emit(LogLevel.Info, tint(pc.bold, title), []);
    const w = Math.max(...rows.map(r => r.label.length));
    for (const r of rows) {
      const pad = ' '.repeat(w - r.label.length);
      this.emit(LogLevel.Info, `  ${tint(pc.dim, r.label)}${pad}  ${r.value}`, []);
    }
  }

  banner(title: string, lines: string[] = []): void {
    if (this.silentHumanOutput) return;
    const maxLen = Math.max(title.length, ...lines.map(l => l.length));
    const pad = (s: string) => s + ' '.repeat(maxLen - s.length);
    const hr = tint(pc.dim, '─'.repeat(maxLen + 4));
    const bar = tint(pc.dim, '│');

    process.stdout.write(`\n  ${hr}\n`);
    process.stdout.write(`  ${bar} ${tint(pc.bold, pad(title))} ${bar}\n`);
    if (lines.length > 0) {
      process.stdout.write(`  ${bar} ${' '.repeat(maxLen)} ${bar}\n`);
      for (const l of lines) process.stdout.write(`  ${bar} ${pad(l)} ${bar}\n`);
    }
    process.stdout.write(`  ${hr}\n\n`);
  }

  addTransport(t: LogTransport): void { this.transports.push(t); }
  clearTransports(): void { this.transports = []; }
}

// ─── JSON transport ──────────────────────────────────────────────────────────

export function jsonTransport(write: (line: string) => void = (s) => process.stdout.write(s + '\n')): LogTransport {
  return (entry) => {
    const obj = {
      v: 1,
      level: entry.level,
      scope: entry.scope,
      // eslint-disable-next-line no-control-regex
      message: entry.message.replace(new RegExp('\x1b\\[[0-9;]*m', 'g'), ''),
      timestamp: entry.timestamp,
      duration: entry.duration,
      args: entry.args,
    };
    write(JSON.stringify(obj));
  };
}

// ─── Factory / singleton ─────────────────────────────────────────────────────

let _root: Logger | undefined;

export function createLogger(opts?: LoggerOptions): Logger { return new Logger(opts); }
export function getLogger(): Logger { return _root ??= new Logger({ scope: 'extforge' }); }
export function setRootLogger(logger: Logger): void { _root = logger; }

export { pc as colors };
