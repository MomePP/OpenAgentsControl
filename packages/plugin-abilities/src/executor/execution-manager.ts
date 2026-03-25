import type { Ability, AbilityExecution, ExecutorContext } from '../types/index.js'
import { executeAbility } from './index.js'

/**
 * Minimal ExecutionManager
 * 
 * Simplified to track SINGLE execution at a time.
 * No session management, no cleanup timers, no multi-execution.
 * 
 * This is the bare minimum to test the core concept.
 */
export class ExecutionManager {
  private activeExecution: AbilityExecution | null = null
  private executionHistory: AbilityExecution[] = []
  private maxHistory = 50
  private abortController: AbortController | null = null

  async execute(
    ability: Ability,
    inputs: Record<string, unknown>,
    ctx: ExecutorContext
  ): Promise<AbilityExecution> {
    // Block concurrent executions
    if (this.activeExecution && this.activeExecution.status === 'running') {
      throw new Error(`Already executing ability: ${this.activeExecution.ability.name}`)
    }

    console.log(`[abilities] Starting execution: ${ability.name}`)

    this.abortController = new AbortController()
    const execution = await executeAbility(ability, inputs, ctx, this.abortController.signal)
    this.activeExecution = execution

    // Track in history
    this.executionHistory.push(execution)
    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistory)
    }

    // Clear active if completed/failed
    if (execution.status !== 'running') {
      this.activeExecution = null
    }

    return execution
  }

  get(id: string): AbilityExecution | undefined {
    return this.executionHistory.find((e) => e.id === id)
  }

  list(): AbilityExecution[] {
    return [...this.executionHistory]
  }

  getActive(): AbilityExecution | null {
    return this.activeExecution
  }

  cancel(): boolean {
    if (!this.activeExecution) return false

    if (this.activeExecution.status === 'running') {
      // Signal the in-flight executeAbility loop to stop at the next iteration
      this.abortController?.abort()
      this.abortController = null
      this.activeExecution.status = 'failed'
      this.activeExecution.error = 'Cancelled by user'
      this.activeExecution.completedAt = Date.now()
      this.activeExecution = null
      return true
    }

    return false
  }

  cancelActive(): boolean {
    // Signal the in-flight executeAbility loop to stop at the next iteration
    this.abortController?.abort()
    this.abortController = null
    return this.cancel()
  }

  onSessionDeleted(sessionId: string): void {
    if (this.activeExecution && this.activeExecution.status === 'running') {
      this.activeExecution.status = 'failed'
      this.activeExecution.error = `Session ${sessionId} deleted`
      this.activeExecution.completedAt = Date.now()
      this.activeExecution = null
    }
  }

  cleanup(): void {
    this.activeExecution = null
  }
}
