import type { On, PromptFillInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { buildPrompt, clean, fillMode, parseTrigger, recentContext } from '../hooks/enhance'

const USAGE = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

describe('enhance helpers', () => {
  test('the trigger needs whitespace before ++ at the end', () => {
    expect(parseTrigger('fix the auth bug ++')).toBe('fix the auth bug')
    expect(parseTrigger('fix the auth bug ++  \n')).toBe('fix the auth bug')
    expect(parseTrigger('learn C++')).toBeNull()
    expect(parseTrigger('a ++ b')).toBeNull()
    expect(parseTrigger('++')).toBe('')
  })

  test('clean strips fences and wrapping quotes only', () => {
    expect(clean('```\nDo it.\n```')).toBe('Do it.')
    expect(clean('"Do it."')).toBe('Do it.')
    expect(clean('“Faça isso.”')).toBe('Faça isso.')
    expect(clean('Use "a" and "b"')).toBe('Use "a" and "b"')
  })

  test('the draft is replaced only when empty or still ours', () => {
    expect(fillMode('', 'x')).toBe('replace')
    expect(fillMode('fix it ++', 'fix it', 'fix it ++')).toBe('replace')
    expect(fillMode('something new', 'fix it')).toBe('append')
  })

  test('context keeps the newest text rows within the caps', () => {
    const rows = [
      { role: 'user' as const, text: 'old' },
      { role: 'assistant' as const, text: '' },
      { role: 'assistant' as const, text: 'the bug is in auth.ts' },
    ]
    expect(recentContext(rows)).toBe('User: old\n\nAssistant: the bug is in auth.ts')
    expect(recentContext(Array.from({ length: 20 }, () => ({ role: 'user' as const, text: 'x'.repeat(2000) }))).length)
      .toBeLessThan(6100)
  })

  test('the prompt fences the text to enhance', () => {
    const prompt = buildPrompt('fix it', 'C:/repo', '')
    expect(prompt).toContain('<working_directory>C:/repo</working_directory>')
    expect(prompt).toContain('<prompt_to_enhance>\nfix it\n</prompt_to_enhance>')
    expect(prompt).not.toContain('<recent_conversation>')
  })
})

function world(on: On, answer: () => any) {
  const fills: PromptFillInput[] = []
  const asked: { model: string; effort?: string }[] = []
  let box = ''
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'auth.ts has the bug', toolUses: [] }] }))
  on('model.complete', ($, e) => {
    asked.push(e)

    return answer()
  })
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    fills.push(e)
    box = e.mode === 'append' ? box + e.text : e.text

    return { isFilled: true }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  return { fills, asked }
}

test('a prompt ending in ++ is dropped and comes back enhanced by Sonnet 5.5', async ($, on) => {
  const clock = mock.clock(on)
  const { fills, asked } = world(on, () => ({
    value: { isAnswered: true, text: '"Fix the auth bug in auth.ts and verify login still works."', usage: USAGE },
  }))

  const result = await $.prompt.submit({ text: 'fix the auth bug ++', origin: { kind: 'composer' }, wait: false })
  expect(result.drop).toBeDefined()
  await clock.settle()

  expect(asked[0]?.model).toBe('claude-sonnet-5-5')
  expect(asked[0]?.effort).toBe('high')
  expect(fills.at(-1)).toEqual(
    expect.objectContaining({ text: 'Fix the auth bug in auth.ts and verify login still works.', mode: 'replace' }),
  )
})

test('a failed call puts the original prompt back', async ($, on) => {
  const clock = mock.clock(on)
  const { fills } = world(on, () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))

  await $.prompt.submit({ text: 'fix the auth bug ++', origin: { kind: 'composer' }, wait: false })
  await clock.settle()

  expect(fills.at(-1)).toEqual(expect.objectContaining({ text: 'fix the auth bug', mode: 'replace' }))
})

test('prompts without the marker pass through untouched', async ($, on) => {
  mock.clock(on)
  const { asked } = world(on, () => ({ value: { isAnswered: true, text: 'x', usage: USAGE } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))

  const result = await $.prompt.submit({ text: 'learn C++', origin: { kind: 'composer' }, wait: false })
  expect(result.text).toBe('learn C++')
  expect(asked.length).toBe(0)
})
