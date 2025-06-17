import * as vscode from 'vscode'
import { ILogger } from '../../abstractions/core'

/**
 * VSCode logger adapter implementing ILogger interface
 */
export class VSCodeLogger implements ILogger {
  private readonly outputChannel: vscode.OutputChannel

  constructor(channelName: string = 'AutoDev Codebase') {
    this.outputChannel = vscode.window.createOutputChannel(channelName)
  }

  debug(message: string, ...args: any[]): void {
    this.log('DEBUG', message, ...args)
  }

  info(message: string, ...args: any[]): void {
    this.log('INFO', message, ...args)
  }

  warn(message: string, ...args: any[]): void {
    this.log('WARN', message, ...args)
  }

  error(message: string, ...args: any[]): void {
    this.log('ERROR', message, ...args)
  }

  /**
   * Show the output channel
   */
  show(): void {
    this.outputChannel.show()
  }

  /**
   * Dispose the output channel
   */
  dispose(): void {
    this.outputChannel.dispose()
  }

  private log(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString()
    const formattedMessage = args.length > 0 
      ? `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}`
      : message
    
    this.outputChannel.appendLine(`[${timestamp}] [${level}] ${formattedMessage}`)
  }
}