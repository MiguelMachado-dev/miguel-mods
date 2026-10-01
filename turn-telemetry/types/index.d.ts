/** One model request inside a turn, as the band measures it. */
export type StepStat = {
  /** Request sent → first streamed content chunk; null when nothing streamed. */
  ttftMs: number | null
  /** First content chunk → end of the response. */
  genMs: number
  outTokens: number
  /** Gaps of at least STALL_MS between content chunks. */
  stalls: number
  longestStallMs: number
}

/** A whole turn, summed over its requests. */
export type TurnStat = {
  durationMs: number | null
  ttftMs: number | null
  tps: number | null
  /** Every input token the turn sent, cached ones included. */
  inTokens: number
  cachedTokens: number
  outTokens: number
  requests: number
  stalls: number
  longestStallMs: number
}

declare module 'claude-code' {
  interface PluginState {
    'turn-telemetry': {
      last: TurnStat | null
      /** tok/s of the last turns, oldest first, for the sparkline. */
      history: number[]
      /** The turn in flight, refreshed while it streams; null when idle. */
      live: TurnStat | null
      isHidden: boolean
    }
  }
}
