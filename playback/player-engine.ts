import {spawn, type ChildProcess} from 'node:child_process';
import {unlink} from 'node:fs/promises';
import {BehaviorSubject, type Observable} from 'rxjs';
import {EventBus, type Unsubscribe} from '../events/event-bus.ts';
import {
	BinaryManager,
	createDefaultMpvBinaryManager,
	type BinaryResolution,
} from '../mpv/binary-manager.ts';
import {
	getProperty,
	loadFile,
	observeProperty,
	quit,
	seek,
	setPause,
	setVolume as setVolumeCommand,
	type MpvCommand,
} from '../mpv/command-adapter.ts';
import {MpvIpcClient, type MpvPropertyChange} from '../mpv/ipc-client.ts';
import {
	createInitialPlaybackState,
	type PlaybackState,
	type PlayerEvent,
} from './playback-state.ts';

/** Options for the high-level mpv-backed player engine. */
export type PlayerEngineOptions = {
	/** Custom binary resolver. Defaults to `createDefaultMpvBinaryManager()`. */
	binaryManager?: BinaryManager;
	/** Initial volume in the 0-100 range. */
	volume?: number;
	/** Extra raw mpv CLI arguments appended after engine defaults. */
	mpvArgs?: readonly string[];
	/** Explicit IPC socket path. Mostly useful for tests/debugging. */
	ipcPath?: string;
};

/**
 * High-level mpv-backed playback engine.
 *
 * This class owns mpv process startup, IPC connection, playback state, and
 * cleanup. It consumes typed mpv command helpers from `command-adapter.ts` but
 * exposes app-level operations such as `load`, `pause`, `seek`, and `stop`.
 */
export class PlayerEngine {
	/** Playback events emitted by this engine. */
	readonly events$: Observable<PlayerEvent>;
	/** Latest playback state plus future state updates. */
	readonly state$: Observable<PlaybackState>;
	private readonly options: PlayerEngineOptions;
	private state: PlaybackState;
	private readonly stateSubject: BehaviorSubject<PlaybackState>;
	private process: ChildProcess | null = null;
	private ipc: MpvIpcClient | null = null;
	private ipcPath: string | null = null;
	private binary: BinaryResolution | null = null;
	private sessionId = 0;
	private readonly events = new EventBus<PlayerEvent>();
	private readonly binaryManager: BinaryManager;

	constructor(options: PlayerEngineOptions = {}) {
		this.options = options;
		this.state = createInitialPlaybackState(options.volume ?? 100);
		this.stateSubject = new BehaviorSubject(this.snapshot);
		this.events$ = this.events.observable;
		this.state$ = this.stateSubject.asObservable();
		this.binaryManager =
			options.binaryManager ?? createDefaultMpvBinaryManager();
	}

	/** Immutable snapshot of the latest playback state. */
	get snapshot(): PlaybackState {
		return {...this.state};
	}

	/** Resolved mpv binary metadata after the engine has started. */
	get binaryInfo(): BinaryResolution | null {
		return this.binary;
	}

	/** Subscribe to playback events without using RxJS directly. */
	onEvent(handler: (event: PlayerEvent) => void): Unsubscribe {
		return this.events.on(handler);
	}

	/** Start mpv and connect the JSON IPC socket if not already connected. */
	async start(): Promise<void> {
		if (this.process && this.ipc?.connected) {
			return;
		}

		this.binary = await this.binaryManager.resolve();
		const ipcPath = this.options.ipcPath ?? this.createIpcPath();
		this.ipcPath = ipcPath;
		const args = this.buildMpvArgs(ipcPath);

		this.process = spawn(this.binary.path, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		this.process.once('exit', () => {
			this.process = null;
			this.ipc?.disconnect();
			this.ipc = null;
			void this.cleanupIpcSocket().catch(error => {
				this.events.emit({type: 'error', error: toError(error)});
			});
			this.updateState({status: 'stopped'});
		});

		this.process.once('error', error => {
			this.updateState({status: 'error', error: error.message});
			this.events.emit({type: 'error', error});
		});

		this.ipc = new MpvIpcClient(ipcPath);
		this.ipc.onPropertyChange(change => {
			this.handlePropertyChange(change);
		});

		await this.ipc.connect();
		await this.observeCoreProperties();
		await this.setVolume(this.state.volume);
	}

	/** Load a playable URL into mpv and mark the engine as playing. */
	async load(url: string): Promise<void> {
		await this.start();
		this.updateState({status: 'loading', url, position: 0, error: null});
		await this.send(loadFile(url));
		this.updateState({status: 'playing'});
	}

	/** Pause playback. */
	async pause(): Promise<void> {
		await this.send(setPause(true));
		this.updateState({status: 'paused'});
	}

	/** Resume playback. */
	async resume(): Promise<void> {
		await this.send(setPause(false));
		this.updateState({status: 'playing'});
	}

	/** Seek to an absolute playback position in seconds. */
	async seek(seconds: number): Promise<void> {
		const position = Math.max(0, seconds);
		await this.send(seek(position, 'absolute'));
		this.updateState({position});
		this.events.emit({type: 'position', position});
	}

	/** Set playback volume, clamped to the 0-100 range. */
	async setVolume(volume: number): Promise<void> {
		const nextVolume = Math.max(0, Math.min(100, volume));
		await this.send(setVolumeCommand(nextVolume));
		this.updateState({volume: nextVolume});
	}

	/** Stop playback, disconnect IPC, terminate mpv, and remove the IPC socket file. */
	async stop(): Promise<void> {
		if (this.ipc?.connected) {
			await this.ipc.send(quit()).catch(() => undefined);
		}

		this.ipc?.disconnect();
		this.ipc = null;
		this.process?.kill('SIGTERM');
		this.process = null;
		await this.cleanupIpcSocket();
		this.updateState({
			status: 'stopped',
			url: null,
			position: 0,
			duration: null,
		});
	}

	private async observeCoreProperties(): Promise<void> {
		await Promise.all([
			this.send(observeProperty(1, 'time-pos')),
			this.send(observeProperty(2, 'duration')),
			this.send(observeProperty(3, 'pause')),
			this.send(observeProperty(4, 'eof-reached')),
		]);

		await this.send(getProperty('pause')).catch(() => undefined);
	}

	private async send(command: MpvCommand): Promise<void> {
		if (!this.ipc?.connected) {
			throw new Error('Player engine is not connected to mpv');
		}

		await this.ipc.send(command);
	}

	private handlePropertyChange(change: MpvPropertyChange): void {
		switch (change.name) {
			case 'time-pos': {
				if (typeof change.data !== 'number') {
					return;
				}

				this.updateState({position: change.data});
				this.events.emit({type: 'position', position: change.data});
				break;
			}

			case 'duration': {
				const duration = typeof change.data === 'number' ? change.data : null;
				this.updateState({duration});
				this.events.emit({type: 'duration', duration});
				break;
			}

			case 'pause': {
				if (typeof change.data !== 'boolean') {
					return;
				}

				this.updateState({status: change.data ? 'paused' : 'playing'});
				this.events.emit({type: 'pause', paused: change.data});
				break;
			}

			case 'eof-reached': {
				if (change.data === true) {
					this.updateState({status: 'stopped'});
					this.events.emit({type: 'ended'});
				}

				break;
			}
		}
	}

	private updateState(patch: Partial<PlaybackState>): void {
		this.state = {...this.state, ...patch};
		const state = this.snapshot;
		this.stateSubject.next(state);
		this.events.emit({type: 'state', state});
	}

	private createIpcPath(): string {
		this.sessionId++;
		if (process.platform === 'win32') {
			return `\\.\pipe\ytui-engine-mpv-${process.pid}-${this.sessionId}`;
		}

		return `/tmp/ytui-engine-mpv-${process.pid}-${this.sessionId}.sock`;
	}

	private async cleanupIpcSocket(): Promise<void> {
		const ipcPath = this.ipcPath;
		if (!ipcPath) {
			return;
		}

		this.ipcPath = null;

		try {
			await unlink(ipcPath);
		} catch (error) {
			if (!isFileNotFoundError(error)) {
				throw error;
			}
		}
	}

	private buildMpvArgs(ipcPath: string): string[] {
		return [
			'--no-video',
			'--no-terminal',
			'--no-audio-display',
			'--really-quiet',
			'--msg-level=all=error',
			'--idle=yes',
			'--cache=yes',
			'--cache-secs=30',
			'--network-timeout=10',
			`--volume=${this.state.volume}`,
			`--input-ipc-server=${ipcPath}`,
			...(this.options.mpvArgs ?? []),
		];
	}
}

function isFileNotFoundError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'ENOENT'
	);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
