import {PlayerEngine} from './index.ts';

const engine = new PlayerEngine({
	volume: 80,
	mpvArgs: ['--vid=auto', '--force-window=immediate', '--msg-level=all=debug'],
});

const stateSubscription = engine.state$.subscribe(state => {
	console.log(state.status);
});

const sleep = (ms: number): Promise<void> => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

engine.onEvent(event => {
	console.log(event);
});

try {
	await engine.load('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	await sleep(1000);
	await engine.pause();
	await sleep(1000);
	await engine.resume();
	await sleep(10000);
	await engine.seek(60);
	await sleep(10000);
	await engine.setVolume(50);
} finally {
	await engine.stop();
	stateSubscription.unsubscribe();
}
