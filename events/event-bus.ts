import {Subject, type Observable, type Subscription} from 'rxjs';

export type Unsubscribe = () => void;

export class EventBus<TEvent> {
	private readonly subscriptions = new Set<Subscription>();
	private subject = new Subject<TEvent>();

	get observable(): Observable<TEvent> {
		return this.subject.asObservable();
	}

	on(handler: (event: TEvent) => void): Unsubscribe {
		const subscription = this.subject.subscribe(handler);
		this.subscriptions.add(subscription);

		return () => {
			subscription.unsubscribe();
			this.subscriptions.delete(subscription);
		};
	}

	emit(event: TEvent): void {
		this.subject.next(event);
	}

	clear(): void {
		for (const subscription of this.subscriptions) {
			subscription.unsubscribe();
		}

		this.subscriptions.clear();
	}
}
