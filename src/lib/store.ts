import { Duration } from '@sapphire/duration';
import { Path } from '@depthbomb/node-common/pathlib';
import { stat, unlink, readFile, writeFile } from 'node:fs/promises';
import type { Nullable } from '@depthbomb/common/typing';

const ENTRY_HEADER_SIZE = 7;
const IV_LENGTH         = 12;
const AUTH_TAG_LENGTH   = 16;
const textEncoder       = new TextEncoder();
const textDecoder       = new TextDecoder();

enum Flags {
	None = 0,
	Compressed = 1 << 0,
	Encrypted = 1 << 1,
}

type Index = Record<string, number>;

interface EntryHeader {
	keyLength: number;
	dataLength: number;
	flags: number;
}

interface StoredValue<T> {
	__store: 1;
	value: T;
	expiresAt: number | null;
}

export interface IStoreOptions {
	compress?: boolean;
	encrypt?: boolean;
	ttl?: string | number | Date;
}

export class Store<T> {
	private index: Index = {};
	private ready: Promise<void>;
	private readonly encryptionKey: Uint8Array<ArrayBuffer>;
	private readonly cryptoKey: Promise<CryptoKey>;

	private readonly dataPath: string;
	private readonly indexPath: string;
	private readonly journalPath: string;
	private readonly lockPath: string;

	public constructor(basePath: string, encryptionKey: Buffer) {
		if (encryptionKey.length !== 32) {
			throw new Error('Encryption key must be 32 bytes');
		}

		this.encryptionKey = Uint8Array.from(encryptionKey);
		this.cryptoKey = crypto.subtle.importKey(
			'raw',
			this.encryptionKey,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);

		this.dataPath    = `${basePath}.bin`;
		this.indexPath   = `${basePath}.idx`;
		this.journalPath = `${basePath}.jrn`;
		this.lockPath    = `${basePath}.lock`;

		this.ready = this.init();
	}

	public async set(key: string, value: T, options: IStoreOptions = {}) {
		await this.ready;
		await this.acquireLock();

		try {
			const { data, flags } = await this.serialize(value, options);
			const entry           = this.buildEntry(key, data, flags);

			await writeFile(this.journalPath, entry, { flag: 'a' });
			await this.appendEntry(key, data, flags);
			await this.clearJournal();
			await this.saveIndex();
		} finally {
			await this.releaseLock();
		}
	}

	public async get(key: string) {
		await this.ready;

		const record = await this.readRecord(key);
		if (!record) {
			return null;
		}

		if (record.expired) {
			await this.delete(key);
			return null;
		}

		return record.value;
	}

	public async delete(key: string) {
		await this.ready;
		await this.acquireLock();

		try {
			delete this.index[key];
			await this.saveIndex();
		} finally {
			await this.releaseLock();
		}
	}

	public async keys(): Promise<string[]> {
		await this.ready;

		const keys        = Object.keys(this.index);
		const liveKeys    = [] as string[];
		const expiredKeys = [] as string[];

		for (const key of keys) {
			const record = await this.readRecord(key);
			if (!record) {
				expiredKeys.push(key);
				continue;
			}

			if (record.expired) {
				expiredKeys.push(key);
				continue;
			}

			liveKeys.push(key);
		}

		if (expiredKeys.length) {
			await this.deleteMany(expiredKeys);
		}

		return liveKeys;
	}

	public async has(key: string): Promise<boolean> {
		await this.ready;

		const record = await this.readRecord(key);
		if (!record) {
			return false;
		}

		if (record.expired) {
			await this.delete(key);
			return false;
		}

		return true;
	}

	private async init() {
		await this.recoverJournal();

		try {
			const json = await readFile(this.indexPath, 'utf8');
			this.index = JSON.parse(json) as Index;
		} catch {
			await this.rebuildIndex();
			await this.saveIndex();
		}
	}

	private async recoverJournal() {
		const journalPath = new Path(this.journalPath);
		if (!journalPath.existsSync()) {
			return;
		}

		const journal = new Uint8Array(await journalPath.readBytes());
		if (journal.length === 0) {
			return;
		}

		let offset = 0;
		while (offset < journal.length) {
			const entryOffset = offset;
			const header      = this.readHeader(journal, offset)!;

			offset += ENTRY_HEADER_SIZE;

			const keyStart = offset;
			const keyEnd   = keyStart + header.keyLength;
			const dataEnd  = keyEnd + header.dataLength;

			if (dataEnd > journal.length) {
				throw new Error(`Corrupt journal entry at offset ${entryOffset}`);
			}

			const key  = textDecoder.decode(journal.subarray(keyStart, keyEnd));
			const data = journal.slice(keyEnd, dataEnd);

			await this.appendEntry(key, data, header.flags);

			offset = dataEnd;
		}

		await this.clearJournal();
	}

	private async rebuildIndex() {
		const dataPath = new Path(this.dataPath);
		if (!dataPath.existsSync()) {
			this.index = {};
			return;
		}

		const data  = new Uint8Array(await dataPath.readBytes());
		const index = {} as Index;

		let offset = 0;

		while (offset < data.length) {
			const entryOffset = offset;
			const header      = this.readHeader(data, offset, true);
			if (!header) {
				break;
			}

			offset += ENTRY_HEADER_SIZE;

			const keyStart = offset;
			const keyEnd   = keyStart + header.keyLength;
			const dataEnd  = keyEnd + header.dataLength;
			if (dataEnd > data.length) {
				break;
			}

			const key = textDecoder.decode(data.subarray(keyStart, keyEnd));

			index[key] = entryOffset;

			offset = dataEnd;
		}

		this.index = index;
	}

	private async saveIndex() {
		await writeFile(this.indexPath, JSON.stringify(this.index));
	}

	private async clearJournal() {
		await writeFile(this.journalPath, new Uint8Array());
	}

	private isStoredValue(value: unknown): value is StoredValue<T> {
		return typeof value === 'object'
			&& value !== null
			&& Object.hasOwn(value, '__store')
			&& (value as StoredValue<T>).__store === 1
			&& Object.hasOwn(value, 'value')
			&& Object.hasOwn(value, 'expiresAt');
	}

	private resolveExpiry(ttl?: string | number | Date) {
		if (!ttl) {
			return null;
		}

		if (ttl instanceof Date) {
			return ttl.getTime();
		}

		if (typeof ttl === 'number') {
			return Date.now() + ttl;
		}

		return new Duration(ttl).fromNow.getTime();
	}

	private isExpired(expiresAt: Nullable<number>) {
		return expiresAt !== null && expiresAt <= Date.now();
	}

	private normalizeBytes(data: ArrayBuffer | Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
		return data instanceof Uint8Array ? Uint8Array.from(data) : new Uint8Array(data);
	}

	private readHeader(source: Uint8Array, offset: number, allowTruncated = false): Nullable<EntryHeader> {
		if (offset + ENTRY_HEADER_SIZE > source.length) {
			if (allowTruncated) {
				return null;
			}

			throw new Error(`Truncated entry header at offset ${offset}`);
		}

		const view = new DataView(source.buffer, source.byteOffset + offset, ENTRY_HEADER_SIZE);
		return {
			keyLength: view.getUint16(0),
			dataLength: view.getUint32(2),
			flags: view.getUint8(6),
		};
	}

	private buildEntry(key: string, data: Uint8Array, flags: number) {
		const keyBytes = textEncoder.encode(key);
		if (keyBytes.length > 0xffff) {
			throw new Error(`Key "${key}" is too large to store`);
		}

		const entry = new Uint8Array(ENTRY_HEADER_SIZE + keyBytes.length + data.length);
		const view  = new DataView(entry.buffer, entry.byteOffset, ENTRY_HEADER_SIZE);

		view.setUint16(0, keyBytes.length);
		view.setUint32(2, data.length);
		view.setUint8(6, flags);

		entry.set(keyBytes, ENTRY_HEADER_SIZE);
		entry.set(data, ENTRY_HEADER_SIZE + keyBytes.length);

		return entry;
	}

	private async acquireLock(retries = 20, delay = 50) {
		for (let attempt = 0; attempt < retries; attempt++) {
			try {
				await writeFile(this.lockPath, 'lock', { flag: 'wx' });
				return;
			} catch {
				await Bun.sleep(delay);
			}
		}

		throw new Error('Could not acquire lock');
	}

	private async releaseLock() {
		try {
			await unlink(this.lockPath);
		} catch {}
	}

	private async encrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
		const iv        = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
		const encrypted = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv, tagLength: AUTH_TAG_LENGTH * 8 },
			await this.cryptoKey,
			data
		);

		const encryptedBytes   = new Uint8Array(encrypted);
		const ciphertextLength = encryptedBytes.length - AUTH_TAG_LENGTH;
		const combined         = new Uint8Array(IV_LENGTH + AUTH_TAG_LENGTH + ciphertextLength);

		combined.set(iv, 0);
		combined.set(encryptedBytes.subarray(ciphertextLength), IV_LENGTH);
		combined.set(encryptedBytes.subarray(0, ciphertextLength), IV_LENGTH + AUTH_TAG_LENGTH);

		return combined;
	}

	private async decrypt(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
		if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
			throw new Error('Encrypted payload is too short');
		}

		const iv        = this.normalizeBytes(data.subarray(0, IV_LENGTH));
		const tag       = this.normalizeBytes(data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
		const encrypted = this.normalizeBytes(data.subarray(IV_LENGTH + AUTH_TAG_LENGTH));
		const payload   = new Uint8Array(encrypted.length + tag.length);
		payload.set(encrypted, 0);
		payload.set(tag, encrypted.length);

		return new Uint8Array(
			await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv, tagLength: AUTH_TAG_LENGTH * 8 },
				await this.cryptoKey,
				payload
			)
		);
	}

	private async appendEntry(key: string, data: Uint8Array<ArrayBuffer>, flags: number) {
		const entry  = this.buildEntry(key, data, flags);
		const offset = await this.getFileSize(this.dataPath);

		await writeFile(this.dataPath, entry, { flag: 'a' });

		this.index[key] = offset;
	}

	private async getFileSize(path: string) {
		try {
			return (await stat(path)).size;
		} catch {
			return 0;
		}
	}

	private async serialize(value: T, options: IStoreOptions): Promise<{ data: Uint8Array<ArrayBuffer>; flags: number }> {
		const expiresAt = this.resolveExpiry(options.ttl);
		const payload: StoredValue<T> = {
			__store: 1,
			value,
			expiresAt,
		};

		let data  = textEncoder.encode(JSON.stringify(payload));
		let flags = Flags.None;

		if (options.compress) {
			data = this.normalizeBytes(Bun.gzipSync(data));
			flags |= Flags.Compressed;
		}

		if (options.encrypt) {
			data = await this.encrypt(data);
			flags |= Flags.Encrypted;
		}

		return { data, flags };
	}

	private async deserialize(data: Uint8Array<ArrayBuffer>, flags: number): Promise<T> {
		let result: Uint8Array<ArrayBuffer> = data;

		if (flags & Flags.Encrypted) {
			result = await this.decrypt(result);
		}

		if (flags & Flags.Compressed) {
			result = this.normalizeBytes(Bun.gunzipSync(result));
		}

		const parsed = JSON.parse(textDecoder.decode(result)) as T | StoredValue<T>;
		if (this.isStoredValue(parsed)) {
			return parsed.value;
		}

		return parsed as T;
	}

	private async deserializeRecord(data: Uint8Array<ArrayBuffer>, flags: number): Promise<{ value: T; expiresAt: number | null }> {
		let result: Uint8Array<ArrayBuffer> = data;

		if (flags & Flags.Encrypted) {
			result = await this.decrypt(result);
		}

		if (flags & Flags.Compressed) {
			result = this.normalizeBytes(Bun.gunzipSync(result));
		}

		const parsed = JSON.parse(textDecoder.decode(result)) as T | StoredValue<T>;
		if (this.isStoredValue(parsed)) {
			return {
				value: parsed.value,
				expiresAt: parsed.expiresAt,
			};
		}

		return {
			value: parsed as T,
			expiresAt: null,
		};
	}

	private async readRecord(key: string): Promise<{ value: T; expiresAt: number | null; expired: boolean } | null> {
		const offset = this.index[key];
		if (offset === undefined) {
			return null;
		}

		const file         = Bun.file(this.dataPath);
		const headerBuffer = this.normalizeBytes(await file.slice(offset, offset + ENTRY_HEADER_SIZE).bytes());
		if (headerBuffer.length < ENTRY_HEADER_SIZE) {
			return null;
		}

		const header    = this.readHeader(headerBuffer, 0)!;
		const dataStart = offset + ENTRY_HEADER_SIZE + header.keyLength;
		const dataEnd   = dataStart + header.dataLength;
		const data      = this.normalizeBytes(await file.slice(dataStart, dataEnd).bytes());

		if (data.length !== header.dataLength) {
			return null;
		}

		const record = await this.deserializeRecord(data, header.flags);

		return {
			...record,
			expired: this.isExpired(record.expiresAt),
		};
	}

	private async deleteMany(keys: string[]) {
		if (keys.length === 0) {
			return;
		}

		await this.acquireLock();

		try {
			for (const key of keys) {
				delete this.index[key];
			}

			await this.saveIndex();
		} finally {
			await this.releaseLock();
		}
	}
}
