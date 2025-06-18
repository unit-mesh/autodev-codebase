/**
 * Node.js Event Bus Adapter
 * Implements IEventBus using Node.js EventEmitter
 */
import { EventEmitter } from 'events'
import { IEventBus } from '../../abstractions/core'

export class NodeEventBus<T = any> implements IEventBus<T> {
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    // Increase max listeners to avoid warnings
    this.emitter.setMaxListeners(100)
  }

  emit(event: string, data: T): void {
    this.emitter.emit(event, data)
  }

  on(event: string, handler: (data: T) => void): () => void {
    this.emitter.on(event, handler)
    
    // Return unsubscribe function
    return () => {
      this.emitter.off(event, handler)
    }
  }

  off(event: string, handler: (data: T) => void): void {
    this.emitter.off(event, handler)
  }

  once(event: string, handler: (data: T) => void): () => void {
    this.emitter.once(event, handler)
    
    // Return unsubscribe function (though it's already one-time)
    return () => {
      this.emitter.off(event, handler)
    }
  }

  /**
   * Get the number of listeners for debugging
   */
  listenerCount(event: string): number {
    return this.emitter.listenerCount(event)
  }

  /**
   * Remove all listeners for cleanup
   */
  removeAllListeners(event?: string): void {
    this.emitter.removeAllListeners(event)
  }
}