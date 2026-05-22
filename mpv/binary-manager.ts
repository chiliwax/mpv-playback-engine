import {spawn} from 'node:child_process';

/** Resolved mpv executable metadata. */
export type BinaryResolution = {
	/** Executable path or command name passed to `spawn()`. */
	path: string;
	/** Provider that resolved this executable. */
	source: 'user' | 'managed' | 'system';
	/** First line of `mpv --version`, when available. */
	version?: string;
};

/** Strategy interface for resolving an mpv executable. */
export type BinaryProvider = {
	/** Stable provider name used in diagnostics. */
	readonly name: string;
	/** Return a usable mpv binary or `null` when this provider cannot resolve one. */
	resolve(): Promise<BinaryResolution | null>;
};

type VersionReadResult =
	| {ok: true; version: string}
	| {ok: false; reason: string};

function executableName(name: string): string {
	return process.platform === 'win32' ? `${name}.exe` : name;
}

function readVersion(command: string): Promise<VersionReadResult> {
	return new Promise(resolve => {
		const child = spawn(command, ['--version'], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		let output = '';

		child.stdout?.on('data', chunk => {
			output += String(chunk);
		});

		child.stderr?.on('data', chunk => {
			output += String(chunk);
		});

		child.once('error', error => {
			resolve({ok: false, reason: error.message});
		});

		child.once('close', code => {
			if (code !== 0) {
				const reason = output.trim() || `exited with code ${code ?? 'unknown'}`;
				resolve({ok: false, reason});
				return;
			}

			const version = output.trim().split('\n')[0]?.trim();
			if (!version) {
				resolve({ok: false, reason: 'version output was empty'});
				return;
			}

			resolve({ok: true, version});
		});
	});
}

/** Resolves an explicit user-configured mpv path, usually from `MPV_PATH`. */
export class UserConfiguredBinaryProvider implements BinaryProvider {
	readonly name = 'user';
	private readonly path?: string;

	constructor(path?: string) {
		this.path = path;
	}

	async resolve(): Promise<BinaryResolution | null> {
		const configuredPath = this.path?.trim();
		if (!configuredPath) {
			return null;
		}

		const version = await readVersion(configuredPath);
		if (!version.ok) {
			throw new Error(`${configuredPath}: ${version.reason}`);
		}

		return {path: configuredPath, source: 'user', version: version.version};
	}
}

/** Resolves `mpv` from the user's system `PATH` (`mpv.exe` on Windows). */
export class SystemBinaryProvider implements BinaryProvider {
	readonly name = 'system';
	private readonly binaryName: string;

	constructor(binaryName = executableName('mpv')) {
		this.binaryName = binaryName;
	}

	async resolve(): Promise<BinaryResolution | null> {
		const version = await readVersion(this.binaryName);
		if (!version.ok) {
			throw new Error(`${this.binaryName}: ${version.reason}`);
		}

		return {path: this.binaryName, source: 'system', version: version.version};
	}
}

/** Placeholder provider for a bundled or downloaded mpv binary managed by the engine package. */
export class ManagedBinaryProvider implements BinaryProvider {
	readonly name = 'managed';
	private readonly resolution: BinaryResolution | null;

	constructor(resolution: BinaryResolution | null = null) {
		this.resolution = resolution;
	}

	async resolve(): Promise<BinaryResolution | null> {
		return this.resolution;
	}
}

/** Tries binary providers in priority order and returns the first usable mpv executable. */
export class BinaryManager {
	private readonly providers: readonly BinaryProvider[];

	constructor(providers: readonly BinaryProvider[]) {
		this.providers = providers;
	}

	async resolve(): Promise<BinaryResolution> {
		const failures: string[] = [];

		for (const provider of this.providers) {
			try {
				const resolution = await provider.resolve();
				if (resolution) {
					return resolution;
				}

				failures.push(`${provider.name}: not found`);
			} catch (error) {
				failures.push(`${provider.name}: ${formatError(error)}`);
			}
		}

		throw new Error(
			`Unable to resolve mpv binary. Tried providers: ${failures.join('; ')}`,
		);
	}
}

/** Create the default mpv resolver: explicit `MPV_PATH`, managed binary, then system `mpv`. */
export function createDefaultMpvBinaryManager(): BinaryManager {
	return new BinaryManager([
		new UserConfiguredBinaryProvider(process.env['MPV_PATH']),
		new ManagedBinaryProvider(),
		new SystemBinaryProvider(),
	]);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
