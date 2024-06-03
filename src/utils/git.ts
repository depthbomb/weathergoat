import { $ } from 'bun';
import { Type, Expose, plainToInstance } from 'class-transformer';

class CommitMessage {
	public hash!: string;
	@Expose({ name: 'hash_short' })
	public shortHash!: string;
	@Expose({ name: 'author_name' })
	public authorName!: string;
	public message!: string;
	@Type(() => Date)
	public date!: Date;
}

export class Git {
	private static _lastHash: string | null = null;

	private constructor() {}

	public static async getCurrentCommitHash() {
		if (!this._lastHash) {
			try {
				const out = await $`git rev-parse --short HEAD`.text();

				this._lastHash = out.trim();
			} catch {
				this._lastHash = 'INDEV';
			}
		}

		return this._lastHash;
	}

	public static async getCommitMessages(count: number | null = null) {
		const option = count && count > 0 ? `-${count}` : '';
		const res    = await $`git log ${option} --format='{"hash":"%H","hash_short":"%h","author_name":"%cn","message":"%s","date":"%cd"}'`.text();
		const json   = `[${res.trim().split('\n').map(line => line).join()}]`;

		return (JSON.parse(json) as object[]).map(v => plainToInstance(CommitMessage, v));
	}
}
