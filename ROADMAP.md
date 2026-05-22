# Engine Roadmap

The engine is currently a working prototype playback core. It has a package
boundary, mpv process startup, JSON IPC, typed command helpers, RxJS-backed
state/events, and basic playback commands.

It is not package-ready yet. The remaining work should keep the engine focused
on playback primitives, not product features. UI, search, import, download,
history, scrobbling, radio, web, MPRIS, background playback policy, presets,
and persistence should stay in app services around the engine.

## 1. Startup diagnostics

- Capture mpv stderr/stdout during startup.
- Surface mpv exit code and startup failure reason through `PlayerEvent` and
  thrown errors.
- Preserve enough stderr context to debug invalid args, missing codecs, bad
  URLs, yt-dlp failures, and IPC socket creation failures.

Verification:

- Invalid mpv args produce a readable engine error instead of only socket
  `ENOENT`.
- `bun run --cwd engine typecheck` passes.

## 2. Deterministic lifecycle

- Add a final `destroy()` or `dispose()` method.
- Define whether `state$` and `events$` complete on destroy.
- Make `start()`, `stop()`, process `exit`, and socket cleanup idempotent.
- Prevent duplicate stopped-state emissions when stop and mpv exit race.

Verification:

- Calling `stop()` multiple times is safe.
- Calling `destroy()` after `stop()` is safe.
- Socket files are removed after stop/exit.

## 3. Typed mpv startup options

- Replace raw-only `mpvArgs: string[]` with typed startup options for common
  engine needs.
- Keep an explicit `extraArgs` escape hatch for unsupported mpv options.
- Type video/window options so mistakes like `--video=yes` are caught before
  runtime.

Verification:

- Common options autocomplete in TypeScript.
- Invalid typed option values fail typecheck.
- Raw escape hatch still supports unknown mpv options.

## 4. Command coordination with RxJS

- Serialize or coordinate commands that can race.
- Handle repeated `load()` calls so stale loads cannot overwrite newer state.
- Handle seek spam with throttling, accumulation, or latest-intent semantics.
- Define behavior for `stop()` while a command is in flight.

Verification:

- Rapid load/seek/stop scenarios produce deterministic final state.
- No command promise remains pending after disconnect/stop.

## 5. Playback state correctness

- Revisit status transitions driven by mpv `pause`, `eof-reached`, `loadfile`,
  and process exit.
- Distinguish user stop from natural end if the UI needs it.
- Consider buffering/loading/error states based on mpv events.

Verification:

- `state$` emits expected states for load, pause, resume, seek, end, stop, and
  mpv crash.

## 6. Test coverage

- Unit test `command-adapter.ts` command tuples.
- Unit test `binary-manager.ts` provider priority and failure messages.
- Unit test `MpvIpcClient` parsing, request matching, pending rejection, and
  malformed JSON handling.
- Add an optional mpv integration smoke test that can be skipped when mpv is not
  installed.

Verification:

- Tests run without requiring network by default.
- Integration smoke test clearly reports missing mpv/yt-dlp prerequisites.

## 7. Public API boundary

- Keep the root package API focused on app-level playback types.
- Later move low-level mpv helpers and IPC classes to explicit subpath exports,
  such as `@involvex/ytui-engine/mpv`, if they remain public.
- Avoid making `EventBus` and other internals stable root exports.

Verification:

- Root import stays simple: `import {PlayerEngine} from '@involvex/ytui-engine'`.
- Advanced mpv APIs are available only through deliberate subpaths if exposed.

## 8. Package build readiness

- Decide whether the engine publishes TypeScript source or compiled `dist`.
- Add package build output for JavaScript and declaration files before npm
  publishing.
- Update `engine/package.json` exports to point at build artifacts when ready.

Verification:

- A clean consumer project can import the package without relying on repo-local
  TypeScript settings.
- Package contents include only intended files.

## Current non-goals

- No UI code in the engine.
- No search/import/download/history/scrobbling/radio/web/MPRIS logic.
- No app-level background playback policy.
- No named equalizer/crossfade/gapless product presets.
- No direct app config or persistence reads from the engine.
