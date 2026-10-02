# turn-telemetry

A Claude Code mod that draws a band above the prompt with telemetry for the last turn: duration, time to first token, tok/s with a sparkline of recent turns, output tokens, input tokens and how much of them was cached, request count and stalls (gaps of 5s or more in the stream). While a response streams, the band updates live.

Needs Claude Code 2.1.287 or later. The band shows in the terminal and in the Code tab of the Claude desktop app; other surfaces don't draw it.

## Commands

- `/tps` toggles the band.
- `/tps reset` clears the last turn and the sparkline history.

## What it reads and sends

The mod reads the timings and token counts Claude Code reports for each turn and keeps them in its own state to draw the band and the sparkline. It makes no network requests, calls no model and reads no files.

## Install

In Claude Code:

```
/plugin marketplace add MiguelMachado-dev/miguel-mods
/plugin install turn-telemetry@miguel-mods
/reload-plugins
```

If the band doesn't show up, restart Claude Code.

A mod runs inside Claude Code on your machine with the same access Claude Code has. Read the source in [`hooks`](hooks) before installing.

## License

MIT. See [LICENSE](LICENSE).
