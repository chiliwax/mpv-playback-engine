import {BehaviorSubject, type Observable} from 'rxjs';

/** App-level metadata for an item that may also be represented in mpv's playlist. */
export type QueueItem = {
	/** Stable app/provider id for the item. */
	id: string;
	/** Playable URL passed to mpv when the item is loaded. */
	url: string;
	/** Optional display title not necessarily known by mpv. */
	title?: string;
};

/** Snapshot of the experimental app-level queue metadata state. */
export type QueueState = {
	/** Current queue items. */
	items: readonly QueueItem[];
	/** Current queue index, or -1 when empty. */
	position: number;
	/** Current item, or `null` when empty. */
	current: QueueItem | null;
};

/**
 * Experimental app-level queue metadata store.
 *
 * For now, mpv's internal playlist should be treated as the playback source of
 * truth through commands such as `loadfile`, `playlist-next`, and
 * `playlist-prev`. Keep this queue separate until the engine needs metadata
 * mpv does not own, such as YouTube ids, titles, thumbnails, providers,
 * favorites, or custom history/shuffle rules.
 */
export class QueueEngine {
	/** Reactive queue metadata snapshots. */
	readonly state$: Observable<QueueState>;
	private items: QueueItem[] = [];
	private position = -1;
	private readonly stateSubject = new BehaviorSubject<QueueState>(
		this.createState(),
	);

	constructor() {
		this.state$ = this.stateSubject.asObservable();
	}

	/** Current queue item, or `null` when the queue is empty. */
	get current(): QueueItem | null {
		return this.items[this.position] ?? null;
	}

	/** Immutable copy of the current queue items. */
	get snapshot(): readonly QueueItem[] {
		return [...this.items];
	}

	/** Current queue index, or -1 when the queue is empty. */
	get currentPosition(): number {
		return this.position;
	}

	/** Replace all queue items and select the requested position. */
	set(items: readonly QueueItem[], position = 0): QueueItem | null {
		this.items = [...items];
		this.position =
			this.items.length === 0
				? -1
				: Math.max(0, Math.min(position, this.items.length - 1));
		this.publishState();
		return this.current;
	}

	/** Append an item and select it when the queue was previously empty. */
	add(item: QueueItem): void {
		this.items.push(item);
		if (this.position === -1) {
			this.position = 0;
		}

		this.publishState();
	}

	/** Advance to the next metadata item, if one exists. */
	next(): QueueItem | null {
		if (this.position + 1 >= this.items.length) {
			return null;
		}

		this.position++;
		this.publishState();
		return this.current;
	}

	/** Move to the previous metadata item, if one exists. */
	previous(): QueueItem | null {
		if (this.position <= 0) {
			return null;
		}

		this.position--;
		this.publishState();
		return this.current;
	}

	/** Clear all queue metadata. */
	clear(): void {
		this.items = [];
		this.position = -1;
		this.publishState();
	}

	private publishState(): void {
		this.stateSubject.next(this.createState());
	}

	private createState(): QueueState {
		return {
			items: this.snapshot,
			position: this.position,
			current: this.current,
		};
	}
}
