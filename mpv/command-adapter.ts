/** mpv property name used by command helpers. Known core properties get autocomplete; custom mpv properties remain allowed. */
export type MpvProperty =
	| 'duration'
	| 'eof-reached'
	| 'pause'
	| 'time-pos'
	| 'volume'
	| (string & {});

/** Primitive property values accepted by this curated adapter. Use `rawCommand()` for structured mpv values. */
export type MpvPropertyValue = boolean | number | string | null;

/**
 * Seek modes supported by mpv's `seek` input command.
 *
 * **relative (default)**
 * Seek relative to current position (a negative value seeks backwards).
 *
 * **absolute**
 * Seek to a given time (a negative value starts from the end of the file).
 *
 * **absolute-percent**
 * Seek to a given percent position.
 *
 * **relative-percent**
 * Seek relative to current position in percent.
 *
 * **keyframes**
 * Always restart playback at keyframe boundaries (fast).
 *
 * **exact**
 * Always do exact/hr/precise seeks (slow).
 * */
export type MpvSeekMode =
	| 'absolute'
	| 'absolute-percent'
	| 'exact'
	| 'keyframes'
	| 'relative'
	| 'relative-percent';

/** Playlist behavior flags for mpv's `loadfile` command.
 *
 * **replace (default)**
 * Stop playback of the current file, and play the new file immediately.
 *
 * **append**
 * Append the file to the playlist.
 *
 * **insert-next**
 * Insert the file into the playlist, directly after the current entry.
 *
 * **insert-at**
 * Insert the file into the playlist, at the index given in the third argument.
 *
 * **play**
 * If nothing is currently playing, start playback. (Always starts with the added file, even if the playlist was not empty before running this command).
 * Multiple flags can be combined, e.g.: append+play.
 *
 * By default, append, insert-next, and insert-at will not immediately start playback even if the playlist was previously empty. Adding the play flag to them forces playback to start.
 *
 * The following values are considered deprecated and were the old way (before mpv 0.42) of forcing playback to start before the play flag was added.
 *
 * **append-play**
 * Append the file, and if nothing is currently playing, start playback. (Always starts with the added file, even if the playlist was not empty before running this command.)
 *
 * **insert-next-play**
 * Insert the file next, and if nothing is currently playing, start playback. (Always starts with the added file, even if the playlist was not empty before running this command.)
 *
 * **insert-at-play**
 * Insert the file at the index given in the third argument, and if nothing is currently playing, start playback. (Always starts with the added file, even if the playlist was not empty before running this command.)
 *
 * The third argument is an insertion index, used only by the insert-at action. When used with those actions, the new item will be inserted at the index position in the playlist, or appended to the end if index is less than 0 or greater than the size of the playlist. This argument will be ignored for all other actions. This argument was added in mpv 0.38.0.
 *
 * The fourth argument is a list of options and values which should be set while the file is playing. It is of the form opt1=value1,opt2=value2,... When using the client API, this can be a MPV_FORMAT_NODE_MAP (or a Lua table), however the values themselves must be strings currently. These options are set during playback, and restored to the previous value at end of playback (see Per-File Options).
 */
export type MpvLoadFlag =
	| 'replace'
	| 'append'
	| 'append-play'
	| 'insert-next'
	| 'insert-next-play'
	| 'insert-at'
	| 'play';

/** Curated mpv command tuples supported by the engine plus the raw escape hatch. */
export type MpvCommand =
	| readonly ['add', MpvProperty, number]
	| readonly ['cycle', MpvProperty]
	| readonly ['get_property', MpvProperty]
	| readonly ['loadfile', string, MpvLoadFlag?]
	| readonly ['observe_property', number, MpvProperty]
	| readonly ['playlist-clear']
	| readonly ['playlist-next', 'force' | 'weak']
	| readonly ['playlist-next']
	| readonly ['playlist-play-index', number | 'current' | 'none']
	| readonly ['playlist-prev', 'force' | 'weak']
	| readonly ['playlist-prev']
	| readonly ['quit']
	| readonly ['seek', number, MpvSeekMode?]
	| readonly ['set_property', MpvProperty, MpvPropertyValue]
	| readonly ['show-text', string, number?]
	| RawMpvCommand;

/** Untyped mpv command tuple for commands not covered by the curated helpers yet. */
export type RawMpvCommand = readonly [string, ...unknown[]];

/**
 * Load a file or URL into mpv.
 *
 * `replace` starts the URL immediately and replaces the current playlist.
 * `append` adds the URL without starting playback. `append-play` starts it
 * when needed. This maps to mpv's `loadfile` command.
 */
export function loadFile(
	url: string,
	flag: MpvLoadFlag = 'replace',
): MpvCommand {
	return ['loadfile', url, flag];
}

/** Set an mpv property through `set_property`. Prefer specific helpers like `setPause()` and `setVolume()` when available. */
export function setProperty(
	name: MpvProperty,
	value: MpvPropertyValue,
): MpvCommand {
	return ['set_property', name, value];
}

/** Read an mpv property through `get_property`. */
export function getProperty(name: MpvProperty): MpvCommand {
	return ['get_property', name];
}

/** Subscribe mpv to property updates through `observe_property`. The id must be stable for later mpv correlation. */
export function observeProperty(id: number, name: MpvProperty): MpvCommand {
	return ['observe_property', id, name];
}

/** Build a typed mpv `seek` command with an explicit seek mode. */
export function seek(
	seconds: number,
	mode: MpvSeekMode = 'relative',
): MpvCommand {
	return ['seek', seconds, mode];
}

/** Seek to an absolute position in seconds. */
export function seekAbsolute(seconds: number): MpvCommand {
	return seek(seconds, 'absolute');
}

/** Seek relative to the current playback position in seconds. Negative values seek backwards. */
export function seekRelative(seconds: number): MpvCommand {
	return seek(seconds, 'relative');
}

/** Set mpv's `pause` property. */
export function setPause(paused: boolean): MpvCommand {
	return setProperty('pause', paused);
}

/** Set mpv volume, clamped to the 0-100 range used by the engine. */
export function setVolume(volume: number): MpvCommand {
	return setProperty('volume', Math.max(0, Math.min(100, volume)));
}

/** Add a numeric amount to an mpv property, for example volume or playback speed. */
export function addProperty(name: MpvProperty, amount: number): MpvCommand {
	return ['add', name, amount];
}

/** Cycle an mpv property to its next value, for example toggling `pause`. */
export function cycleProperty(name: MpvProperty): MpvCommand {
	return ['cycle', name];
}

/** Move to the next item in mpv's internal playlist. */
export function playlistNext(mode?: 'force' | 'weak'): MpvCommand {
	return mode ? ['playlist-next', mode] : ['playlist-next'];
}

/** Move to the previous item in mpv's internal playlist. */
export function playlistPrevious(mode?: 'force' | 'weak'): MpvCommand {
	return mode ? ['playlist-prev', mode] : ['playlist-prev'];
}

/** Select an item in mpv's internal playlist by index or special target. */
export function playlistPlayIndex(
	index: number | 'current' | 'none',
): MpvCommand {
	return ['playlist-play-index', index];
}

/** Clear mpv's internal playlist. */
export function playlistClear(): MpvCommand {
	return ['playlist-clear'];
}

/** Display text in the mpv OSD. Duration is in milliseconds. */
export function showText(text: string, durationMs?: number): MpvCommand {
	return typeof durationMs === 'number'
		? ['show-text', text, durationMs]
		: ['show-text', text];
}

/** Ask mpv to quit. `PlayerEngine.stop()` uses this before local socket/process cleanup. */
export function quit(): MpvCommand {
	return ['quit'];
}

/**
 * Build an untyped mpv command tuple.
 *
 * Use this only for commands that do not yet have a typed helper. Prefer the
 * curated helpers above for autocomplete and safer argument values.
 */
export function rawCommand(...command: RawMpvCommand): RawMpvCommand {
	return command;
}
