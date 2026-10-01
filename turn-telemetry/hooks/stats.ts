import type { ModelUsage } from 'claude-code'

import type { StepStat, TurnStat } from '../types'

/** A gap this long between two streamed chunks counts as a stall. */
export const STALL_MS = 5000
/** Steps shorter than this stream in one burst; their tok/s is noise. */
export const MIN_GEN_MS = 250
export const MIN_GEN_TOKENS = 16
/** How many turns the sparkline remembers. */
export const HISTORY = 16

export type Segment = {
  text: string
  color?: string
  dimColor?: boolean
  /** Lower survives longer when the band is too narrow. */
  priority: number
}

/** Counts stalls from monotonic chunk stamps. */
export function stallCounter() {
  let lastAt: number | null = null
  const counter = {
    stalls: 0,
    longestStallMs: 0,
    tick(now: number) {
      if (lastAt !== null) {
        const gap = now - lastAt
        if (gap >= STALL_MS) {
          counter.stalls += 1
          counter.longestStallMs = Math.max(counter.longestStallMs, gap)
        }
      }
      lastAt = now
    },
  }

  return counter
}

export function summarize(
  steps: readonly StepStat[],
  durationMs: number | null,
  usage?: ModelUsage | null,
): TurnStat {
  let genMs = 0
  let genTokens = 0
  let stepTokens = 0
  let stalls = 0
  let longestStallMs = 0
  for (const step of steps) {
    stepTokens += step.outTokens
    stalls += step.stalls
    longestStallMs = Math.max(longestStallMs, step.longestStallMs)
    if (step.genMs >= MIN_GEN_MS && step.outTokens >= MIN_GEN_TOKENS) {
      genMs += step.genMs
      genTokens += step.outTokens
    }
  }

  return {
    durationMs,
    ttftMs: steps.find(step => step.ttftMs !== null)?.ttftMs ?? null,
    tps: genMs > 0 ? genTokens / (genMs / 1000) : null,
    inTokens: usage
      ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : 0,
    cachedTokens: usage?.cache_read_input_tokens ?? 0,
    outTokens: usage?.output_tokens ?? stepTokens,
    requests: steps.length,
    stalls,
    longestStallMs,
  }
}

const BARS = '▁▂▃▄▅▆▇█'

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return BARS.charAt(3).repeat(values.length)

  return values.map(v => BARS.charAt(Math.round(((v - min) / (max - min)) * (BARS.length - 1)))).join('')
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const seconds = Math.round(ms / 1000)

  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`

  return `${(n / 1_000_000).toFixed(1)}M`
}

function ttftColor(ms: number): string {
  if (ms < 2000) return 'green'
  if (ms < 5000) return 'yellow'

  return 'red'
}

/** The band's pieces in display order; `fit` drops the least important. */
export function segments(stat: TurnStat, history: readonly number[], isLive: boolean): Segment[] {
  const out: Segment[] = []
  if (isLive) {
    out.push({ text: '● live', color: 'cyan', priority: 0 })
  } else if (stat.durationMs !== null) {
    out.push({ text: `turn ${fmtMs(stat.durationMs)}`, priority: 0 })
  }
  if (stat.ttftMs !== null) {
    out.push({ text: `ttft ${fmtMs(stat.ttftMs)}`, color: ttftColor(stat.ttftMs), priority: 1 })
  }
  if (stat.tps !== null) {
    const spark = history.length >= 2 ? ` ${sparkline(history)}` : ''
    out.push({ text: `${isLive ? '~' : ''}${Math.round(stat.tps)} tok/s${spark}`, priority: 1 })
  }
  if (stat.outTokens > 0) {
    out.push({ text: `out ${fmtTokens(stat.outTokens)}`, dimColor: true, priority: 3 })
  }
  if (stat.inTokens > 0) {
    const cached = Math.round((stat.cachedTokens / stat.inTokens) * 100)
    const note = cached >= 1 ? ` (${cached}% cached)` : ''
    out.push({ text: `in ${fmtTokens(stat.inTokens)}${note}`, dimColor: true, priority: 4 })
  }
  if (stat.requests > 1) {
    out.push({ text: `${stat.requests} req`, dimColor: true, priority: 5 })
  }
  if (stat.stalls > 0) {
    const plural = stat.stalls === 1 ? '' : 's'
    out.push({
      text: `${stat.stalls} stall${plural} (max ${fmtMs(stat.longestStallMs)})`,
      color: 'yellow',
      priority: 2,
    })
  }

  return out
}

export const SEPARATOR = ' · '

/** Drops the least important segments until the row fits `width` cells. */
export function fit(parts: readonly Segment[], width: number): Segment[] {
  const kept = [...parts]
  const length = () =>
    kept.reduce((sum, part) => sum + part.text.length, 0) + SEPARATOR.length * (kept.length - 1)
  while (kept.length > 1 && length() > width) {
    let drop = 0
    kept.forEach((part, i) => {
      if (part.priority >= (kept[drop]?.priority ?? 0)) drop = i
    })
    kept.splice(drop, 1)
  }

  return kept
}
