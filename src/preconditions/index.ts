import { MakeErrorClass } from 'fejl';
import type { Nullable } from '#types';
import type { Awaitable, ChatInputCommandInteraction } from 'discord.js';

export const enum CheckResult {
	Success,
	Fail
}

export class PreconditionError extends MakeErrorClass('Precondition failed') {}

export class PreconditionResult {
	private constructor(
		public readonly err: Nullable<PreconditionError> = null
	) {}

	public static from(result: CheckResult.Success): PreconditionResult;
	public static from(result: CheckResult.Fail, errorMessage?: string): PreconditionResult;
	public static from(result: CheckResult, errorMessage?: string): PreconditionResult {
		if (result === CheckResult.Success) {
			return new this();
		}

		return new this(
			new PreconditionError(errorMessage)
		);
	}

	public static fromSuccess() {
		return this.from(CheckResult.Success);
	}

	public static fromFailure(errorMessage?: string) {
		return this.from(CheckResult.Fail, errorMessage);
	}
}

export type Precondition = (interaction: ChatInputCommandInteraction) => Awaitable<PreconditionResult>

export function isPreconditionError(err: unknown): err is PreconditionError {
	return err instanceof PreconditionError;
}
