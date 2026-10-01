import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { StepStat } from '../types'
import { HISTORY, SEPARATOR, fit, segments, stallCounter, summarize } from './stats'

const COMMAND = 'tps'
/** How often the band redraws while a response streams. */
const LIVE_EVERY_MS = 1000

const last = atom({ plugin: 'turn-telemetry', key: 'last' } as const, null)
const history = atom({ plugin: 'turn-telemetry', key: 'history' } as const, [])
const live = atom({ plugin: 'turn-telemetry', key: 'live' } as const, null)
const isHidden = atom({ plugin: 'turn-telemetry', key: 'isHidden' } as const, false)

export const register: Register = on => {
  // The main-loop turn in flight; a hot reload mid-turn loses it, which
  // turn.complete tolerates.
  let turn: { id: string; steps: StepStat[] } | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Toggle the turn telemetry band (`/tps reset` clears its history)',
    })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'reset') {
      await update($, last, () => null)
      await update($, history, () => [])

      return { text: 'Turn telemetry cleared.' }
    }
    const hidden = await update($, isHidden, value => !value)

    return { text: hidden ? 'Turn telemetry hidden.' : 'Turn telemetry shown.' }
  })

  on('turn.start', async ($, e, next) => {
    turn = { id: e.turnId, steps: [] }
    await update($, live, () => null)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)

    if (turn?.id !== e.turnId) turn = { id: e.turnId, steps: [] }
    const current = turn
    const sentAt = await $.clock.now()
    let firstAt: number | null = null
    // Chunk-level timing stays on the synchronous clock so forwarding is
    // never held up by a host round trip.
    let perfFirst = 0
    let lastPush = 0
    let chars = 0
    const gaps = stallCounter()

    const pushLive = (perfNow: number) => {
      lastPush = perfNow
      const partial: StepStat = {
        ttftMs: firstAt === null ? null : firstAt - sentAt,
        genMs: perfNow - perfFirst,
        outTokens: Math.round(chars / 4),
        stalls: gaps.stalls,
        longestStallMs: gaps.longestStallMs,
      }

      return update($, live, () => summarize([...current.steps, partial], null))
    }

    const stream = next(e)
    for await (const chunk of stream) {
      let isFirst = false
      if (chunk.kind === 'text' || chunk.kind === 'thinking' || chunk.kind === 'input' || chunk.kind === 'tool') {
        const perfNow = performance.now()
        gaps.tick(perfNow)
        if (chunk.kind === 'text' || chunk.kind === 'thinking') chars += chunk.text.length
        if (chunk.kind === 'input') chars += chunk.json.length
        if (firstAt === null) {
          firstAt = await $.clock.now()
          perfFirst = perfNow
          isFirst = true
        }
      }
      yield chunk
      const perfNow = performance.now()
      if (firstAt !== null && (isFirst || perfNow - lastPush >= LIVE_EVERY_MS)) await pushLive(perfNow)
    }
    const result = await stream.result
    const endedAt = await $.clock.now()

    current.steps.push({
      ttftMs: firstAt === null ? null : firstAt - sentAt,
      genMs: firstAt === null ? 0 : endedAt - firstAt,
      outTokens: result.usage?.output_tokens ?? Math.round(chars / 4),
      stalls: gaps.stalls,
      longestStallMs: gaps.longestStallMs,
    })
    await update($, live, () => summarize(current.steps, null))

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result

    const steps = turn?.id === e.turnId ? turn.steps : []
    turn = null
    await update($, live, () => null)
    if (e.reason !== 'answer') return result

    const stat = summarize(steps, e.durationMs, e.usage)
    await update($, last, () => stat)
    const tps = stat.tps
    if (tps !== null) await update($, history, list => [...list, Math.round(tps)].slice(-HISTORY))

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId || (await read($, isHidden))) return next(e)

    const [done, now, spark] = await Promise.all([read($, last), read($, live), read($, history)])
    const isLive = e.props.isWorking && now !== null && now.ttftMs !== null
    const stat = isLive ? now : done
    if (stat === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts = fit(segments(stat, spark, isLive), e.props.bodyColumns)

    return (
      <Box flexDirection="row">
        {parts.flatMap((part, i) => [
          ...(i === 0 ? [] : [<Text key={`sep-${i}`} dimColor>{SEPARATOR}</Text>]),
          <Text key={`seg-${i}`} color={part.color} dimColor={part.dimColor} wrap="truncate-end">
            {part.text}
          </Text>,
        ])}
      </Box>
    )
  })
}
