/**
 * Node.js Logger Adapter
 * Implements ILogger using console output with formatting
 */
import { ILogger } from '../../abstractions/core'

export interface NodeLoggerOptions {
  name?: string
  level?: 'debug' | 'info' | 'warn' | 'error'
  timestamps?: boolean
  colors?: boolean
}

export class NodeLogger implements ILogger {
  private name: string
  private level: 'debug' | 'info' | 'warn' | 'error'
  private timestamps: boolean
  private colors: boolean

  private readonly levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  }

  private readonly colorCodes = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
    reset: '\x1b[0m'   // Reset
  }

  constructor(options: NodeLoggerOptions = {}) {
    this.name = options.name || 'AutoDev'
    this.level = options.level || 'info'
    this.timestamps = options.timestamps !== false
    this.colors = options.colors !== false && process.stdout.isTTY
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args)
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    if (this.levels[level] < this.levels[this.level]) {
      return
    }

    const timestamp = this.timestamps ? `[${new Date().toISOString()}] ` : ''
    const levelStr = level.toUpperCase().padEnd(5)
    const nameStr = this.name ? `[${this.name}] ` : ''
    
    let logMessage = `${timestamp}${levelStr} ${nameStr}${message}`
    
    if (this.colors) {
      const color = this.colorCodes[level]
      const reset = this.colorCodes.reset
      logMessage = `${color}${logMessage}${reset}`
    }

    // Use appropriate console method
    switch (level) {
      case 'debug':
        console.debug(logMessage, ...args)
        break
      case 'info':
        console.info(logMessage, ...args)
        break
      case 'warn':
        console.warn(logMessage, ...args)
        break
      case 'error':
        console.error(logMessage, ...args)
        break
    }
  }

  /**
   * Set the logging level
   */
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.level = level
  }

  /**
   * Get the current logging level
   */
  getLevel(): 'debug' | 'info' | 'warn' | 'error' {
    return this.level
  }
}