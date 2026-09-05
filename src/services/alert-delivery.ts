import { db } from '@database';
import { injectable } from '@needle-di/core';
import { and } from '@prisma/orm-postgres/orm-client';
import { WebhookClient, DiscordAPIError } from 'discord.js';
import { toInstant, requireRecord, isUniqueViolation } from '@database/values';
import type { AlertDeliveryClaim } from '@database/models';
import type { WebhookMessageCreateOptions } from 'discord.js';

type Delivery = Pick<AlertDeliveryClaim, 'alertId' | 'guildId' | 'channelId' | 'autoCleanup'> & {
	expiresAt: Date;
};

/** Disable transparent transport/5xx retries for non-idempotent webhook sends. */
export async function sendAlertWebhook(
	webhook: { id: string; token: string | null },
	options: WebhookMessageCreateOptions,
) {
	if (!webhook.token) throw new Error('Alert webhook has no usable token.');
	const sender = new WebhookClient({ id: webhook.id, token: webhook.token }, { rest: { retries: 0 } });
	try {
		return await sender.send(options);
	} finally {
		await sender.destroy();
	}
}

@injectable()
export class AlertDeliveryService {
	// Receipts bridge a temporary DB failure after send while this process is alive.
	private readonly receipts = new Map<number, string>();

	public constructor(private readonly database = db) {}

	public async deliver(data: Delivery, send: () => Promise<{ id: string }>) {
		if (data.expiresAt.getTime() <= Date.now()) {
			return;
		}

		let claim: AlertDeliveryClaim;
		try {
			claim = await this.database.orm.public.AlertDeliveryClaim.create({
				...data,
				expiresAt: toInstant(data.expiresAt),
			});
		} catch (error) {
			if (isUniqueViolation(error)) {
				return;
			}

			throw error;
		}

		let message: { id: string };
		try {
			message = await send();
		} catch (error) {
			// A definitive API rejection is retryable. Transport/5xx failures may
			// have created a message, so retain the claim for operator review.
			if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500) {
				await this.database.orm.public.AlertDeliveryClaim.where((f) => f.id.eq(claim.id))
					.delete()
					.then(requireRecord);
			}

			throw error;
		}

		this.receipts.set(claim.id, message.id);

		await this.saveReceipt(claim.id, message.id);
		await this.finalize({ ...claim, messageId: message.id });

		return message;
	}

	/** Repair bookkeeping without repeating Discord sends, including after restart. */
	public async recover() {
		await this.flushReceipts();
		const claims = await this.database.orm.public.AlertDeliveryClaim
			.where((f) => and(f.finalized.eq(false), f.messageId.isNotNull()))
				.orderBy([(f) => f.id.asc()])
				.limit(100)
				.all();

		for (const claim of claims) {
			await this.finalize(claim);
		}
	}

	/** Persist every known send outcome before a clean shutdown; never resend. */
	public async flushReceipts() {
		for (const [id, messageId] of this.receipts) {
			await this.saveReceipt(id, messageId);
		}
	}

	private async saveReceipt(id: number, messageId: string) {
		await this.database.orm.public.AlertDeliveryClaim.where((f) => f.id.eq(id))
			.update({ messageId: messageId })
			.then(requireRecord);

		this.receipts.delete(id);
	}

	private async finalize(claim: AlertDeliveryClaim) {
		if (!claim.messageId) return;
		const { alertId, guildId, channelId, messageId, expiresAt } = claim;
		await this.database.transaction(async (tx) => {
			// These existing unique indexes are not exposed as conflict targets by
			// the RC's ORM types. Native parameterized SQL preserves atomic upserts.
			await tx.execute(
				this.database.raw.sql`
				INSERT INTO "SentAlert" ("alertId", "guildId", "channelId", "messageId", "expiresAt")
				VALUES (${alertId}, ${guildId}, ${channelId}, ${messageId}, ${expiresAt.toString()}::timestamptz)
				ON CONFLICT ("alertId", "guildId", "channelId") DO UPDATE
				SET "messageId" = EXCLUDED."messageId", "expiresAt" = EXCLUDED."expiresAt"`
					.affectedCount()
					.build(),
			);
			if (claim.autoCleanup) {
				await tx.execute(
					this.database.raw.sql`
					INSERT INTO "VolatileMessage" ("guildId", "channelId", "messageId", "expiresAt")
					VALUES (${guildId}, ${channelId}, ${messageId}, ${expiresAt.toString()}::timestamptz)
					ON CONFLICT ("messageId") DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt"`
						.affectedCount()
						.build(),
				);
			}
			await tx.orm.public.AlertDeliveryClaim.where((f) => f.id.eq(claim.id))
				.update({ finalized: true })
				.then(requireRecord);
		});
	}
}
