# miguel-mods

Claude Code mods by Miguel Machado. Needs Claude Code 2.1.287 or later.

## turn-telemetry

A band above the prompt with telemetry for the last turn: duration, time to first token, tok/s with a sparkline of recent turns, output tokens, input tokens and how much of them was cached, request count and stalls (gaps of 5s or more in the stream). While a response streams, the band updates live.

- `/tps` toggles the band.
- `/tps reset` clears the last turn and the sparkline history.

## Install

In Claude Code:

```
/plugin marketplace add MiguelMachado-dev/miguel-mods
/plugin install turn-telemetry@miguel-mods
/reload-plugins
```

If the band doesn't show up, restart Claude Code.

A mod runs inside Claude Code on your machine with the same access Claude Code has. Read the source in [`turn-telemetry/hooks`](turn-telemetry/hooks) before installing.
