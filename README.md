# Engine

A TypeScript playback engine built on top of mpv’s JSON IPC protocol. It manages mpv process lifecycle, IPC communication, typed playback commands, state/events, and resource cleanup, while staying UI-agnostic and focused on core playback primitives.

## What it owns

- mpv binary resolution
- mpv process startup
- mpv JSON IPC connection
- playback commands
- typed playback events
- queue primitives
- RxJS-backed internal coordination streams

## Minimal usage

```ts
import {PlayerEngine} from './index.ts';

const engine = new PlayerEngine({volume: 80});

const stateSubscription = engine.state$.subscribe(state => {
	console.log(state.status);
});

engine.onEvent(event => {
	console.log(event);
});

await engine.load('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
await engine.pause();
await engine.resume();
await engine.seek(60);
await engine.setVolume(50);
await engine.stop();

stateSubscription.unsubscribe();
```

