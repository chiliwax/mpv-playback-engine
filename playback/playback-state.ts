/** High-level playback lifecycle state exposed by the engine. */
export type PlaybackStatus =
	| 'idle'
	| 'loading'
	| 'playing'
	| 'paused'
	| 'stopped'
	| 'error';

/** Snapshot of the current player state as understood by the engine. */
export type PlaybackState = {
	/** Current lifecycle state. */
	status: PlaybackStatus;
	/** Currently loaded URL, or `null` when idle/stopped. */
	url: string | null;
	/** Current playback position in seconds. */
	position: number;
	/** Media duration in seconds, when mpv has reported it. */
	duration: number | null;
	/** Engine volume in the 0-100 range. */
	volume: number;
	/** Last user-facing playback error message, if any. */
	error: string | null;
};

/** Event stream emitted by `PlayerEngine.events$` and `PlayerEngine.onEvent()`. */
export type PlayerEvent =
	| {type: 'state'; state: PlaybackState}
	| {type: 'position'; position: number}
	| {type: 'duration'; duration: number | null}
	| {type: 'pause'; paused: boolean}
	| {type: 'ended'}
	| {type: 'error'; error: Error};

/** Build the default idle playback state for a new player instance. */
export function createInitialPlaybackState(volume = 100): PlaybackState {
	return {
		status: 'idle',
		url: null,
		position: 0,
		duration: null,
		volume,
		error: null,
	};
}
