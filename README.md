# miguel-mods

Claude Code mods by Miguel Machado. Needs Claude Code 2.1.287 or later.

## turn-telemetry

A band above the prompt with telemetry for the last turn: duration, time to first token, tok/s with a sparkline of recent turns, output tokens, input tokens and how much of them was cached, request count and stalls (gaps of 5s or more in the stream). While a response streams, the band updates live.

- `/tps` toggles the band.
- `/tps reset` clears the last turn and the sparkline history.

## prompt-enhancer

Rewrites a prompt with Sonnet 5.5 at high effort and puts the result back in the prompt box, so you review it before sending. The rewrite follows the [Opus 5.5 prompting guide](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/): the whole task in one message, a "done means" line for changes, when to stop and ask, and no "think step by step" or emphasis. It keeps the language of your prompt, and reads the working directory and the last few messages only to turn references like "that bug" into concrete names.

- End a prompt with ` ++` and press Enter: the prompt is not sent, and the rewrite comes back to the box. Nothing enters the conversation.
- `/enhance <prompt>` does the same, but the command and its output stay in the conversation.
- `/enhance-undo` puts the original back.

If the call fails, your prompt comes back to the box as you wrote it.

## Install

In Claude Code:

```
/plugin marketplace add MiguelMachado-dev/miguel-mods
/plugin install turn-telemetry@miguel-mods
/plugin install prompt-enhancer@miguel-mods
/reload-plugins
```

If a mod doesn't show up, restart Claude Code.

A mod runs inside Claude Code on your machine with the same access Claude Code has. Read the source in [`turn-telemetry/hooks`](turn-telemetry/hooks) and [`prompt-enhancer/hooks`](prompt-enhancer/hooks) before installing.
