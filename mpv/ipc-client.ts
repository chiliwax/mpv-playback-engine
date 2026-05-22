import {connect, type Socket} from 'node:net';
import type {Observable} from 'rxjs';
import {EventBus, type Unsubscribe} from '../events/event-bus.ts';
import type {MpvCommand} from './command-adapter.ts';

/** Raw JSON message emitted by mpv's JSON IPC protocol. */
export type MpvIpcMessage = {
	event?: string;
	error?: string;
	data?: unknown;
	id?: number;
	name?: string;
	request_id?: number;
};

/** Normalized payload for mpv `property-change` events. */
export type MpvPropertyChange = {
	id?: number;
	name: string;
	data: unknown;
};

/** Retry behavior used while waiting for mpv to create its IPC socket. */
export type MpvIpcClientOptions = {
	connectRetries?: number;
	connectDelayMs?: number;
};

type PendingCommand = {
	resolve: (message: MpvIpcMessage) => void;
	reject: (error: Error) => void;
};

/**
 * Low-level mpv JSON IPC client.
 *
 * This class only knows about sockets and mpv JSON command messages. It does
 * not own playback state, queues, or UI behavior. Higher-level engine classes
 * should use it to send typed command tuples and observe raw mpv events.
 */
export class MpvIpcClient {
	private readonly ipcPath: string;
	private readonly options: MpvIpcClientOptions;
	private socket: Socket | null = null;
	private buffer = '';
	private nextRequestId = 1;
	private readonly pending = new Map<number, PendingCommand>();
	private readonly messageBus = new EventBus<MpvIpcMessage>();
	private readonly propertyBus = new EventBus<MpvPropertyChange>();
	/** Stream of every valid mpv IPC message received from the socket. */
	readonly messages$: Observable<MpvIpcMessage> = this.messageBus.observable;
	/** Stream of normalized mpv `property-change` events. */
	readonly propertyChanges$: Observable<MpvPropertyChange> =
		this.propertyBus.observable;

	constructor(ipcPath: string, options: MpvIpcClientOptions = {}) {
		this.ipcPath = ipcPath;
		this.options = options;
	}

	/** True when a socket is currently attached and has not been destroyed. */
	get connected(): boolean {
		return Boolean(this.socket && !this.socket.destroyed);
	}

	/** Subscribe to every raw mpv IPC message. Prefer `messages$` for RxJS pipelines. */
	onMessage(handler: (message: MpvIpcMessage) => void): Unsubscribe {
		return this.messageBus.on(handler);
	}

	/** Subscribe to normalized mpv property updates. Prefer `propertyChanges$` for RxJS pipelines. */
	onPropertyChange(handler: (change: MpvPropertyChange) => void): Unsubscribe {
		return this.propertyBus.on(handler);
	}

	/**
	 * Connect to mpv's IPC socket, retrying while mpv starts and creates the socket.
	 *
	 * `PlayerEngine` calls this immediately after spawning mpv. A short retry loop
	 * is required because the process can be alive before the socket path exists.
	 */
	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		const retries = this.options.connectRetries ?? 20;
		const delayMs = this.options.connectDelayMs ?? 100;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				await this.connectOnce();
				return;
			} catch (error) {
				if (attempt >= retries) {
					throw error;
				}

				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		}
	}

	/**
	 * Send a typed mpv command tuple and resolve with the matching IPC response.
	 *
	 * The client adds a monotonically increasing `request_id` so concurrent command
	 * responses can be matched back to the promise returned from this method.
	 */
	send(command: MpvCommand): Promise<MpvIpcMessage> {
		if (!this.socket || this.socket.destroyed) {
			return Promise.reject(new Error('mpv IPC socket is not connected'));
		}

		const requestId = this.nextRequestId++;
		const payload = JSON.stringify({command, request_id: requestId}) + '\n';

		return new Promise((resolve, reject) => {
			this.pending.set(requestId, {resolve, reject});
			this.socket?.write(payload, error => {
				if (!error) {
					return;
				}

				this.pending.delete(requestId);
				reject(error);
			});
		});
	}

	/** Hard-close the socket and reject commands still waiting for mpv responses. */
	disconnect(): void {
		this.rejectPending(new Error('mpv IPC socket disconnected'));
		this.socket?.destroy();
		this.socket = null;
		this.buffer = '';
	}

	private connectOnce(): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = connect(this.ipcPath);
			let settled = false;

			const cleanupInitialListeners = () => {
				socket.removeListener('connect', handleConnect);
				socket.removeListener('error', handleError);
			};

			const handleConnect = () => {
				settled = true;
				cleanupInitialListeners();
				this.socket = socket;
				this.attachSocketHandlers(socket);
				resolve();
			};

			const handleError = (error: Error) => {
				if (settled) {
					return;
				}

				settled = true;
				cleanupInitialListeners();
				socket.destroy();
				reject(error);
			};

			socket.once('connect', handleConnect);
			socket.once('error', handleError);
		});
	}

	private attachSocketHandlers(socket: Socket): void {
		socket.on('data', data => {
			this.handleData(data.toString('utf8'));
		});

		socket.on('close', () => {
			if (this.socket === socket) {
				this.socket = null;
			}

			this.rejectPending(new Error('mpv IPC socket closed'));
		});

		socket.on('error', error => {
			this.rejectPending(error);
		});
	}

	private handleData(data: string): void {
		this.buffer += data;
		const lines = this.buffer.split('\n');
		this.buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				continue;
			}

			const parsedMessage: unknown = JSON.parse(trimmedLine);
			if (!this.isMpvIpcMessage(parsedMessage)) {
				continue;
			}

			this.handleMessage(parsedMessage);
		}
	}

	private handleMessage(message: MpvIpcMessage): void {
		if (typeof message.request_id === 'number') {
			const pending = this.pending.get(message.request_id);
			if (pending) {
				this.pending.delete(message.request_id);
				if (message.error && message.error !== 'success') {
					pending.reject(new Error(message.error));
				} else {
					pending.resolve(message);
				}
			}
		}

		if (
			message.event === 'property-change' &&
			typeof message.name === 'string'
		) {
			this.propertyBus.emit({
				id: message.id,
				name: message.name,
				data: message.data,
			});
		}

		this.messageBus.emit(message);
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}

		this.pending.clear();
	}

	private isMpvIpcMessage(value: unknown): value is MpvIpcMessage {
		return typeof value === 'object' && value !== null;
	}
}
