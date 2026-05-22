# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-22
**Commit:** 6be4736
**Branch:** main

## OVERVIEW

SA TypeScript playback engine built on top of mpv’s JSON IPC protocol. It manages mpv process lifecycle, IPC communication, typed playback commands, state/events, and resource cleanup, while staying UI-agnostic and focused on core playback primitives.

## STRUCTURE

```text
engine/
├── index.ts                  # public barrel export; package exports point here directly
├── test.ts                   # manual real-mpv smoke harness, not a unit test suite
├── events/event-bus.ts       # tiny RxJS-backed subscription helper
├── mpv/                      # binary resolution, JSON IPC client, typed command tuples
├── playback/                 # PlayerEngine, playback state, experimental queue metadata
├── README.md                 # package status and minimal usage
├── package.json              # ESM package metadata; typecheck-only script
└── tsconfig.json             # strict Bun/Node TypeScript config
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Public API shape | `index.ts` | All exported classes, functions, and types are re-exported from here. |
| High-level playback behavior | `playback/player-engine.ts` | Owns mpv process startup, IPC connection, state updates, cleanup. |
| Playback state model | `playback/playback-state.ts` | App-facing status/event/state types and initial state factory. |
| Queue metadata | `playback/queue-engine.ts` | Experimental app-level metadata store; mpv playlist remains playback source of truth. |
| mpv executable lookup | `mpv/binary-manager.ts` | User path → managed path → system `mpv` provider chain. |
| mpv command payloads | `mpv/command-adapter.ts` | Curated typed helpers for JSON IPC command tuples; `rawCommand()` is the escape hatch. |
| mpv socket protocol | `mpv/ipc-client.ts` | Low-level JSON IPC socket client, request IDs, property-change normalization. |
| Event helper | `events/event-bus.ts` | RxJS `Subject` wrapper with explicit unsubscribe tracking. |
| Manual verification | `test.ts` | Loads a YouTube URL through real mpv; requires local mpv/network/display support. |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `PlayerEngine` | class | `playback/player-engine.ts` | Main app-facing engine API: `load`, `pause`, `resume`, `seek`, `setVolume`, `stop`. |
| `MpvIpcClient` | class | `mpv/ipc-client.ts` | Connects to mpv JSON IPC, sends typed commands, emits raw/property messages. |
| `BinaryManager` | class | `mpv/binary-manager.ts` | Resolves a usable mpv binary from ordered providers. |
| `QueueEngine` | class | `playback/queue-engine.ts` | Tracks app metadata queue separate from mpv playlist state. |
| `EventBus<TEvent>` | class | `events/event-bus.ts` | Converts push events into RxJS observables and unsubscribe callbacks. |
| `createInitialPlaybackState` | function | `playback/playback-state.ts` | Initializes state snapshots for `PlayerEngine`. |
| command helpers | functions | `mpv/command-adapter.ts` | Build mpv command tuples; keep command construction centralized. |

## CONVENTIONS

- Source files live directly in the package root and domain folders; there is no `src/` or build output directory.
- `package.json` exports TypeScript source directly: `"types": "./index.ts"`, `"import": "./index.ts"`.
- Imports include `.ts` extensions; `tsconfig.json` enables `allowImportingTsExtensions` with bundler resolution.
- Formatting is tab-indented TypeScript with semicolons and single-quoted strings.
- Prefer named exports through `index.ts`; keep package surface visible in one barrel.
- Keep mpv command tuple construction inside `mpv/command-adapter.ts` instead of scattering raw arrays through playback code.
- Use RxJS streams for state/event observation, but expose small `onEvent`/unsubscribe helpers where ergonomic.

## ANTI-PATTERNS (THIS PROJECT)

- Do not add React, Ink, or TUI dependencies here; this package is explicitly engine-only.
- Do not make `QueueEngine` the playback source of truth yet; comments state mpv's internal playlist should remain authoritative for playback commands.
- Do not treat `test.ts` as an automated unit test. It is a manual smoke script against real mpv and a live YouTube URL.
- Avoid deprecated mpv `loadfile` flags documented in `mpv/command-adapter.ts` (`append-play`, `insert-next-play`, `insert-at-play`) for new behavior; prefer modern `+play` flag combinations.
- Do not bypass `PlayerEngine.stop()` cleanup when touching process/IPC lifecycle; it owns process shutdown, socket cleanup, and subscriptions.

## COMMANDS

```bash
npm run typecheck
```

There is no build script and no configured CI in this package. The package is typechecked in place with `tsc --noEmit -p tsconfig.json`.

Manual smoke test, only when local mpv/network/display side effects are acceptable:

```bash
bun test.ts
```

## NOTES

- `tsconfig.json` extends both `@sindresorhus/tsconfig` and `@tsconfig/bun`; expect strict TypeScript plus Bun globals/types.
- `MpvIpcClient` is intentionally low-level: sockets and JSON messages only. Playback state belongs in `PlayerEngine`.
- `PlayerEngine` resolves mpv lazily during load/startup; tests or callers can inject `binaryManager` and `ipcPath` through `PlayerEngineOptions`.
- The roadmap/status says the next integration step is direct real-mpv testing, then replacing the existing player service with this API.
