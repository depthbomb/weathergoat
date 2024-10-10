import { MakeErrorClass } from 'fejl';
import type { Nullable } from '#types';
import type { Container } from '@container';
import type { ChatInputCommandInteraction } from 'discord.js';

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

export abstract class BasePrecondition {
	/**
	 * Runs logic on a command interaction and returns a result describing whether the precondition
	 * failed or succeeded.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction|interaction} of the command to run
	 * the check on.
	 * @param container The {@link Container|service container instance}.
	 */
	public abstract check(interaction: ChatInputCommandInteraction, container: Container): Promise<PreconditionResult>;

	/**
	 * Runs logic on a command interaction and throws a {@link PreconditionError} if the check fails.
	 *
	 * @param interaction The {@link ChatInputCommandInteraction|interaction} of the command to run
	 * the check on.
	 */
	public async checkAndThrow(interaction: ChatInputCommandInteraction): Promise<void> {
		const res = await this.check(interaction, interaction.client.container);
		if (res.err) {
			throw res.err;
		}
	}
}

/**
 * Returns `true` if the {@link error} is a {@link PreconditionError} and `false` otherwise.
 *
 * @param err The {@link Error} to check
 */
export function isPreconditionError(err: unknown): err is PreconditionError {
	return err instanceof PreconditionError;
}
