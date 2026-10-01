/** The last enhancement, kept so /enhance-undo can put the original back. */
export type Enhancement = { original: string; enhanced: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      lastRun: Enhancement | null
    }
  }
}
