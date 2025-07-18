import { CONFIG } from '../config/constants';

export interface LogLevel {
  ERROR: 0;
  WARN: 1;
  INFO: 2;
  DEBUG: 3;
}

export const LOG_LEVELS: LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  private level: number;

  constructor() {
    this.level = LOG_LEVELS.INFO;
    if (process.env.NODE_ENV === 'development') {
      this.level = LOG_LEVELS.DEBUG;
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }

  error(message: string, meta?: any): void {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(this.formatMessage('ERROR', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.level >= LOG_LEVELS.INFO) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }

  // 兼容原有的 console.log
  log(message: string, meta?: any): void {
    this.info(message, meta);
  }
}

export const logger = new Logger(); 