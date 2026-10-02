# prompt-enhancer

A Claude Code mod that rewrites a prompt with Sonnet 5.5 at high effort and puts the result back in the prompt box, so you review it before sending. The rewrite follows the [Opus 5.5 prompting guide](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/): the whole task in one message, a "done means" line for changes, when to stop and ask, and no "think step by step" or emphasis. It keeps the language of your prompt, and reads the working directory and the last few messages only to turn references like "that bug" into concrete names.

Needs Claude Code 2.1.287 or later.

## Usage

- End a prompt with ` ++` and press Enter: the prompt is not sent, and the rewrite comes back to the box. Nothing enters the conversation.
- `/enhance <prompt>` does the same, but the command and its output stay in the conversation.
- `/enhance-undo` puts the original back.

If the call fails, your prompt comes back to the box as you wrote it.

To catch ` ++`, the mod hooks `prompt.submit`. It acts only on a prompt typed in the prompt box that ends with ` ++`, which it holds back instead of sending. Every other prompt, including one that another mod submits, passes through unchanged.

## What it sends and where

Each enhancement is one model call to `claude-sonnet-5-5` made through Claude Code, on your own plan or API key, so it counts toward your usage. The call carries:

- the prompt you asked to enhance
- the path of the session's working directory
- up to the last 6 messages of the conversation that have text, each cut at 1,200 characters and 6,000 in total

Nothing is sent anywhere else. The mod keeps the last original prompt and its rewrite in its own state so `/enhance-undo` can restore it, and it reads no files.

## Install

In Claude Code:

```
/plugin marketplace add MiguelMachado-dev/miguel-mods
/plugin install prompt-enhancer@miguel-mods
/reload-plugins
```

If `/enhance` doesn't show up, restart Claude Code.

A mod runs inside Claude Code on your machine with the same access Claude Code has. Read the source in [`hooks`](hooks) before installing.

## License

MIT. See [LICENSE](LICENSE).
