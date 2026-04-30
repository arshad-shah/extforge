import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Logger, LogLevel, createLogger, getLogger, setRootLogger,
  formatDuration, formatFileSize,
  type LogEntry, type LogTransport,
} from '../src/core/logger/index.js';

describe('Logger', () => {
  describe('Given a logger with default options', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createLogger();
    });

    it('should create a logger at Info level by default', () => {
      expect(logger.getLevel()).toBe(LogLevel.Info);
    });

    it('should allow changing log level', () => {
      logger.setLevel(LogLevel.Debug);
      expect(logger.getLevel()).toBe(LogLevel.Debug);
    });
  });

  describe('Given a logger with a custom transport', () => {
    let entries: LogEntry[];
    let transport: LogTransport;
    let logger: Logger;

    beforeEach(() => {
      entries = [];
      transport = (entry: LogEntry) => { entries.push(entry); };
      logger = createLogger({ transports: [transport], level: LogLevel.Trace });
    });

    describe('When logging at different levels', () => {
      it('should capture error messages', () => {
        logger.error('something broke');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Error);
      });

      it('should capture warn messages', () => {
        logger.warn('heads up');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Warn);
      });

      it('should capture info messages', () => {
        logger.info('all good');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Info);
      });

      it('should capture success messages', () => {
        logger.success('done');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Success);
      });

      it('should capture debug messages', () => {
        logger.debug('internal detail');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Debug);
      });

      it('should capture trace messages', () => {
        logger.trace('very verbose');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Trace);
      });
    });

    describe('When filtering by log level', () => {
      it('should suppress debug messages at Info level', () => {
        logger.setLevel(LogLevel.Info);
        logger.debug('hidden');
        expect(entries).toHaveLength(0);
      });

      it('should suppress all messages at Silent level', () => {
        logger.setLevel(LogLevel.Silent);
        logger.error('hidden');
        logger.warn('hidden');
        logger.info('hidden');
        expect(entries).toHaveLength(0);
      });

      it('should show errors at Warn level', () => {
        logger.setLevel(LogLevel.Warn);
        logger.error('visible');
        logger.info('hidden');
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe(LogLevel.Error);
      });
    });

    describe('When using additional args', () => {
      it('should pass extra args to the transport', () => {
        logger.info('test', { detail: 'value' });
        expect(entries[0].args).toEqual([{ detail: 'value' }]);
      });
    });
  });

  describe('Given child loggers', () => {
    let entries: LogEntry[];
    let logger: Logger;

    beforeEach(() => {
      entries = [];
      const transport: LogTransport = (entry) => { entries.push(entry); };
      logger = createLogger({ scope: 'parent', transports: [transport], level: LogLevel.Trace });
    });

    it('should inherit parent scope as prefix', () => {
      const child = logger.child('child');
      child.info('test');
      expect(entries[0].scope).toBe('parent:child');
    });

    it('should support nested children', () => {
      const child = logger.child('a').child('b');
      child.info('deep');
      expect(entries[0].scope).toBe('parent:a:b');
    });

    it('should allow level override on child', () => {
      const child = logger.child('quiet', { level: LogLevel.Error });
      child.info('hidden');
      child.error('visible');
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(LogLevel.Error);
    });
  });

  describe('Given timing operations', () => {
    it('should measure elapsed time', () => {
      const entries: LogEntry[] = [];
      const transport: LogTransport = (entry) => { entries.push(entry); };
      const logger = createLogger({ transports: [transport], level: LogLevel.Trace });

      logger.time('op');
      // Simulate some work
      const start = performance.now();
      while (performance.now() - start < 5) { /* spin */ }
      const duration = logger.timeEnd('op');

      expect(duration).toBeGreaterThan(0);
      // Should have logged the timer start (debug) and the completion (info)
      const completionEntry = entries.find(e => e.duration !== undefined);
      expect(completionEntry).toBeDefined();
      expect(completionEntry!.duration).toBeGreaterThan(0);
    });

    it('should warn on unknown timer label', () => {
      const entries: LogEntry[] = [];
      const transport: LogTransport = (entry) => { entries.push(entry); };
      const logger = createLogger({ transports: [transport], level: LogLevel.Trace });

      logger.timeEnd('nonexistent');
      expect(entries.some(e => e.message.includes('does not exist'))).toBe(true);
    });
  });

  describe('Given the singleton root logger', () => {
    it('should return the same instance from getLogger', () => {
      const a = getLogger();
      const b = getLogger();
      expect(a).toBe(b);
    });

    it('should allow replacing the root logger', () => {
      const custom = createLogger({ scope: 'custom' });
      setRootLogger(custom);
      expect(getLogger()).toBe(custom);
    });
  });
});

describe('Format utilities', () => {
  describe('formatDuration', () => {
    it('should format microseconds', () => {
      expect(formatDuration(0.5)).toBe('500μs');
    });

    it('should format milliseconds', () => {
      expect(formatDuration(42)).toBe('42ms');
      expect(formatDuration(3.7)).toBe('3.7ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(42000)).toBe('42.00s');
    });

    it('should format minutes', () => {
      expect(formatDuration(90000)).toBe('1m 30.0s');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.00 MB');
    });
  });
});
