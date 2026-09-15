/**
 * Generic logger delegation supporting Winston, Pino, and Console interfaces.
 * Enables enterprise backend environments to inject structured logging into the Payments SDK.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Universal Logger interface accepted across the SDK.
 */
export interface LoggerInterface {
  trace?(message: string | object, ...args: any[]): void;
  debug(message: string | object, ...args: any[]): void;
  info(message: string | object, ...args: any[]): void;
  warn(message: string | object, ...args: any[]): void;
  error(message: string | object | Error, ...args: any[]): void;
  fatal?(message: string | object, ...args: any[]): void;
  child?(bindings: Record<string, any>): LoggerInterface;
}

/**
 * Winston-like interface definition.
 */
export interface WinstonLoggerLike {
  info(message: string, ...meta: any[]): any;
  warn(message: string, ...meta: any[]): any;
  error(message: string | Error, ...meta: any[]): any;
  debug?(message: string, ...meta: any[]): any;
  child?(options: object): any;
}

/**
 * Pino-like interface definition.
 */
export interface PinoLoggerLike {
  info(obj: object, msg?: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  warn(obj: object, msg?: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  error(obj: object, msg?: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(obj: object, msg?: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  trace?(obj: object, msg?: string, ...args: any[]): void;
  trace?(msg: string, ...args: any[]): void;
  child?(bindings: object): any;
}

export type SupportedLogger = LoggerInterface | WinstonLoggerLike | PinoLoggerLike | Console | any;

/**
 * SdkLogger delegates log invocations to any underlying structured logging instance.
 * It normalizes formats for Winston (message first, meta second) and Pino (obj first or msg first)
 * and safely handles unconfigured loggers.
 */
export class SdkLogger implements LoggerInterface {
  private target?: any;
  private prefix: string;
  private context: Record<string, any>;

  constructor(target?: SupportedLogger, prefix = '', context: Record<string, any> = {}) {
    this.target = target;
    this.prefix = prefix;
    this.context = context;
  }

  /**
   * Returns the underlying logger instance if any.
   */
  public getTarget(): any {
    return this.target;
  }

  /**
   * Creates a child logger with extra structured metadata bindings or sub-prefix.
   */
  public child(bindings: Record<string, any> = {}, subPrefix?: string): SdkLogger {
    const combinedContext = { ...this.context, ...bindings };
    const newPrefix = subPrefix ? (this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix) : this.prefix;

    if (this.target && typeof this.target.child === 'function') {
      try {
        const nativeChild = this.target.child(bindings);
        return new SdkLogger(nativeChild, newPrefix, combinedContext);
      } catch {
        // Fall back to manual wrapping
      }
    }

    return new SdkLogger(this.target, newPrefix, combinedContext);
  }

  public trace(message: string | object, ...args: any[]): void {
    this.log('trace', message, args);
  }

  public debug(message: string | object, ...args: any[]): void {
    this.log('debug', message, args);
  }

  public info(message: string | object, ...args: any[]): void {
    this.log('info', message, args);
  }

  public warn(message: string | object, ...args: any[]): void {
    this.log('warn', message, args);
  }

  public error(message: string | object | Error, ...args: any[]): void {
    this.log('error', message, args);
  }

  public fatal(message: string | object, ...args: any[]): void {
    this.log('fatal', message, args);
  }

  private log(level: LogLevel, message: string | object | Error, args: any[]): void {
    if (!this.target) {
      return;
    }

    const logFn = this.resolveLogFn(level);
    if (!logFn) {
      return;
    }

    const hasContext = Object.keys(this.context).length > 0;

    if (typeof message === 'string') {
      const formattedMessage = this.prefix ? `[${this.prefix}] ${message}` : message;

      if (this.isPinoLogger()) {
        if (hasContext || args.length > 0) {
          const meta = args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])
            ? { ...this.context, ...args[0] }
            : { ...this.context, args };
          logFn.call(this.target, meta, formattedMessage);
        } else {
          logFn.call(this.target, formattedMessage);
        }
      } else {
        if (args.length > 0) {
          if (hasContext && typeof args[0] === 'object' && !Array.isArray(args[0])) {
            logFn.call(this.target, formattedMessage, { ...this.context, ...args[0] }, ...args.slice(1));
          } else if (hasContext) {
            logFn.call(this.target, formattedMessage, { ...this.context }, ...args);
          } else {
            logFn.call(this.target, formattedMessage, ...args);
          }
        } else if (hasContext) {
          logFn.call(this.target, formattedMessage, { ...this.context });
        } else {
          logFn.call(this.target, formattedMessage);
        }
      }
    } else if (message instanceof Error) {
      const formattedMessage = this.prefix ? `[${this.prefix}] ${message.message}` : message.message;
      if (this.isPinoLogger()) {
        logFn.call(this.target, { ...this.context, err: message }, formattedMessage, ...args);
      } else {
        const errorMeta = { ...this.context, error: message };
        if (args.length > 0 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          logFn.call(this.target, formattedMessage, { ...errorMeta, ...args[0] }, ...args.slice(1));
        } else {
          logFn.call(this.target, formattedMessage, errorMeta, ...args);
        }
      }
    } else if (typeof message === 'object') {
      const mergedObj = { ...this.context, ...message };
      logFn.call(this.target, mergedObj, ...args);
    }
  }

  private resolveLogFn(level: LogLevel): Function | undefined {
    if (typeof this.target[level] === 'function') {
      return this.target[level];
    }
    if (level === 'fatal' && typeof this.target.error === 'function') {
      return this.target.error;
    }
    if (level === 'trace' && typeof this.target.debug === 'function') {
      return this.target.debug;
    }
    return undefined;
  }

  private isPinoLogger(): boolean {
    return !!(this.target && (this.target.levels || this.target.pino || (this.target.version && this.target.bindings)));
  }
}

/**
 * Creates or wraps any given logger into an SdkLogger instance.
 */
export function createSdkLogger(logger?: SupportedLogger, prefix?: string): SdkLogger {
  if (logger instanceof SdkLogger) {
    return prefix ? logger.child({}, prefix) : logger;
  }
  return new SdkLogger(logger, prefix);
}
