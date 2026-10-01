import type { RenderElement } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { fit, sparkline, stallCounter, summarize } from '../hooks/stats'

const USAGE = {
  input_tokens: 1000,
  output_tokens: 100,
  cache_read_input_tokens: 9000,
  cache_creation_input_tokens: 0,
  model: 'claude-opus-5-5',
}

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

describe('stats', () => {
  test('tok/s ignores one-burst steps and tokens come from the turn usage', () => {
    const stat = summarize(
      [
        { ttftMs: 900, genMs: 2000, outTokens: 100, stalls: 0, longestStallMs: 0 },
        { ttftMs: 400, genMs: 10, outTokens: 40, stalls: 1, longestStallMs: 6000 },
      ],
      5000,
      USAGE,
    )
    expect(stat.ttftMs).toBe(900)
    expect(stat.tps).toBe(50)
    expect(stat.inTokens).toBe(10_000)
    expect(stat.outTokens).toBe(100)
    expect(stat.requests).toBe(2)
    expect(stat.stalls).toBe(1)
  })

  test('stalls are gaps of five seconds or more', () => {
    const gaps = stallCounter()
    for (const at of [0, 100, 5200, 5300, 12_000]) gaps.tick(at)
    expect(gaps.stalls).toBe(2)
    expect(gaps.longestStallMs).toBe(6700)
  })

  test('sparkline spans the bar range', () => {
    expect(sparkline([10, 20, 30])).toBe('▁▅█')
    expect(sparkline([5, 5])).toBe('▄▄')
  })

  test('fit drops the least important segments first', () => {
    const parts = [
      { text: 'turn 3.0s', priority: 0 },
      { text: 'in 10k (90% cached)', priority: 4 },
      { text: 'ttft 800ms', priority: 1 },
    ]
    expect(fit(parts, 30).map(p => p.text)).toEqual(['turn 3.0s', 'ttft 800ms'])
  })
})

test('measures a streamed main-loop turn and draws it above the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    await clock.advance(800)
    yield { kind: 'text', index: 0, text: 'Hello' }
    await clock.advance(2000)
    yield { kind: 'text', index: 0, text: ' world' }
    yield { kind: 'stop', stopReason: 'end_turn', usage: USAGE }

    return { turnId: e.turnId, index: e.index, answer: 'Hello world', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const kinds: string[] = []
  for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) {
    kinds.push(chunk.kind)
  }
  expect(kinds).toEqual(['text', 'text', 'stop'])

  const done = await $.turn.complete({
    answer: 'Hello world',
    durationMs: 3000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: USAGE,
  })
  expect(done.text).toBe('Hello world')

  const ui = await $.ui.mount({ plugin: 'turn-telemetry', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /turn 3\.0s/ })).toBeDefined()
  expect(await ui.find({ text: /ttft 800ms/ })).toBeDefined()
  expect(await ui.find({ text: /50 tok\/s/ })).toBeDefined()
  expect(await ui.find({ text: /90% cached/ })).toBeDefined()
})

test('subagent turns are not measured', async ($, on) => {
  mock.clock(on)
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'sub' }

    return { turnId: e.turnId, index: e.index, answer: 'sub', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  // With nothing measured the band passes, so the engine's own drawing shows.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return h(Text, { key: 'engine' }, 'engine band') as RenderElement
  })

  for await (const _ of $.turn.step({ turnId: 's1', index: 0, model: 'm', messageCount: 1, agentId: 'a1' })) {
    // drain
  }
  await $.turn.complete({
    answer: 'sub',
    durationMs: 100,
    isAborted: false,
    turnId: 's1',
    reason: 'answer',
    agentId: 'a1',
    usage: USAGE,
  })

  const ui = await $.ui.mount({ plugin: 'turn-telemetry', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /engine band/ })).toBeDefined()
  expect(await ui.find({ text: /tok\/s/ })).toBeUndefined()
})
