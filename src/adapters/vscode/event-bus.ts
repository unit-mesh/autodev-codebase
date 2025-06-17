import * as vscode from 'vscode'
import { IEventBus } from '../../abstractions/core'

/**
 * VSCode event bus adapter implementing IEventBus interface
 * Uses VSCode's event system to provide cross-platform event handling
 */
export class VSCodeEventBus<T = any> implements IEventBus<T> {
  private readonly emitters = new Map<string, vscode.EventEmitter<T>>()
  private readonly disposables: vscode.Disposable[] = []

  emit(event: string, data: T): void {
    const emitter = this.getOrCreateEmitter(event)
    emitter.fire(data)
  }

  on(event: string, handler: (data: T) => void): () => void {
    const emitter = this.getOrCreateEmitter(event)
    const disposable = emitter.event(handler)
    this.disposables.push(disposable)
    
    // Return unsubscribe function
    return () => {
      const index = this.disposables.findIndex(d => d === disposable)
      if (index > -1) {
        this.disposables.splice(index, 1)
        disposable.dispose()
      }
    }
  }

  off(event: string, handler: (data: T) => void): void {
    // VSCode EventEmitter doesn't provide a direct way to remove specific handlers
    // This is a limitation of the VSCode API, handlers should use the unsubscribe function returned by on()
    console.warn('VSCodeEventBus.off() is not fully supported. Use the unsubscribe function returned by on() instead.')
  }

  once(event: string, handler: (data: T) => void): () => void {
    const emitter = this.getOrCreateEmitter(event)
    
    let disposed = false
    const wrappedHandler = (data: T) => {
      if (!disposed) {
        disposed = true
        const index = this.disposables.findIndex(d => d === disposable)
        if (index > -1) {
          this.disposables.splice(index, 1)
        }
        disposable.dispose()
        handler(data)
      }
    }

    const disposable = emitter.event(wrappedHandler)
    this.disposables.push(disposable)
    
    // Return unsubscribe function
    return () => {
      if (!disposed) {
        disposed = true
        const index = this.disposables.findIndex(d => d === disposable)
        if (index > -1) {
          this.disposables.splice(index, 1)
          disposable.dispose()
        }
      }
    }
  }

  /**
   * Dispose all event listeners (should be called when cleaning up)
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose())
    this.disposables.length = 0
    
    // Dispose all emitters
    this.emitters.forEach(emitter => emitter.dispose())
    this.emitters.clear()
  }

  private getOrCreateEmitter(event: string): vscode.EventEmitter<T> {
    let emitter = this.emitters.get(event)
    if (!emitter) {
      emitter = new vscode.EventEmitter<T>()
      this.emitters.set(event, emitter)
    }
    return emitter
  }
}