import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelCompleteResult, Register } from 'claude-code'

import {
  EFFORT,
  MAX_TOKENS,
  MODEL,
  SYSTEM,
  TIMEOUT_MS,
  buildPrompt,
  clean,
  fillMode,
  parseTrigger,
  recentContext,
} from './enhance'

const lastRun = atom({ plugin: 'prompt-enhancer', key: 'lastRun' } as const, null)

function why(reply: Exclude<ModelCompleteResult, { isAnswered: true }>): string {
  if (reply.reason === 'api-error') return `API error${reply.status ? ` ${reply.status}` : ''}`
  if (reply.reason === 'aborted') return 'timed out'

  return 'empty reply'
}

/** Puts `text` in the prompt box without clobbering a draft typed meanwhile. */
async function place($: EngineInterface, text: string, ...ours: string[]): Promise<boolean> {
  const box = await $.prompt.read()
  const mode = fillMode(box.text, ...ours)
  const filled = await $.prompt.fill({ text: mode === 'append' ? `\n\n${text}` : text, mode })

  return filled.isFilled
}

async function enhance($: EngineInterface, text: string, typed: string): Promise<void> {
  const giveBack = async (reason: string) => {
    await place($, text, typed)
    $.ui.toast(`${reason}; your prompt is back in the box`)
  }

  $.ui.status('✦ enhancing prompt (Sonnet 5.5)…')
  try {
    const [cwd, rows] = await Promise.all([$.session.cwd(), $.session.messages({})])
    const context = 'deny' in rows ? '' : recentContext(rows)
    let reply: ModelCompleteResult
    try {
      reply = await $.model.complete({
        model: MODEL,
        effort: EFFORT,
        system: SYSTEM,
        prompt: buildPrompt(text, cwd, context),
        maxTokens: MAX_TOKENS,
        timeoutMs: TIMEOUT_MS,
      })
    } catch (error) {
      await giveBack(`Enhancement refused: ${error instanceof Error ? error.message : String(error)}`)

      return
    }
    if (!reply.isAnswered) {
      await giveBack(`Enhancement failed (${why(reply)})`)

      return
    }
    const enhanced = clean(reply.text)
    if (!enhanced) {
      await giveBack('Enhancement came back empty')

      return
    }

    await update($, lastRun, () => ({ original: text, enhanced }))
    const isFilled = await place($, enhanced, text, typed)
    $.ui.toast(
      isFilled
        ? '✦ Prompt enhanced: review it and press Enter (/enhance-undo restores the original)'
        : 'Prompt enhanced, but the box could not take it; close the dialog and run /enhance-undo to get the original',
    )
  } finally {
    $.ui.status(undefined)
  }
}

// The model call outlives the dispatch that asked for it: a timer runs it on
// its own, so the prompt box is free while Sonnet thinks.
function start($: EngineInterface, text: string, typed: string): void {
  $.clock.after(0, () => void enhance($, text, typed))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a prompt with Sonnet 5.5 and put it in the box for review (or end a prompt with " ++")',
      argumentHint: '<prompt>',
    })
    await $.command.register({
      name: 'enhance-undo',
      description: 'Put the prompt from before the last enhancement back in the box',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const text = parseTrigger(e.text)
    if (text === null) return next(e)
    if (!text) return { drop: 'Nothing to enhance before " ++"' }

    start($, text, e.text)

    return { drop: '✦ Enhancing with Sonnet 5.5; the result comes back to the prompt box' }
  })

  on('command.run', { command: 'enhance' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) return { text: 'Usage: /enhance <prompt>, or end any prompt with " ++"' }

    start($, text, text)

    return { text: '✦ Enhancing with Sonnet 5.5…' }
  })

  on('command.run', { command: 'enhance-undo' }, async $ => {
    const run = await read($, lastRun)
    if (!run) return { text: 'No enhancement to undo.' }
    const isFilled = await place($, run.original, run.enhanced)

    return { text: isFilled ? 'Original prompt restored.' : 'The prompt box could not take it.' }
  })
}
