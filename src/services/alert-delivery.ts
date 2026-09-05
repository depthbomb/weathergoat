import { db } from '@database';
import { injectable } from '@needle-di/core';
import { DiscordAPIError, WebhookClient } from 'discord.js';
import { Prisma } from '@database/generated/client';
import type { AlertDeliveryClaim } from '@database/generated/client';
import type { WebhookMessageCreateOptions } from 'discord.js';

type Delivery = Pick<AlertDeliveryClaim, 'alertId' | 'guildId' | 'channelId' | 'expiresAt' | 'autoCleanup'>;

/** Disable transparent transport/5xx retries for non-idempotent webhook sends. */
export async function sendAlertWebhook(webhook: { id: string; token: string | null }, options: WebhookMessageCreateOptions) {
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
		if (data.expiresAt.getTime() <= Date.now()) return;
		let claim: AlertDeliveryClaim;
		try {
			claim = await this.database.alertDeliveryClaim.create({ data });
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
			throw error;
		}

		let message: { id: string };
		try {
			message = await send();
		} catch (error) {
			// A definitive API rejection is retryable. Transport/5xx failures may
			// have created a message, so retain the claim for operator review.
			if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500) {
				await this.database.alertDeliveryClaim.delete({ where: { id: claim.id } });
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
		for (const [id, messageId] of this.receipts) await this.saveReceipt(id, messageId);
		const claims = await this.database.alertDeliveryClaim.findMany({
			where: { finalized: false, messageId: { not: null } },
			orderBy: { id: 'asc' },
			take: 100
		});
		for (const claim of claims) await this.finalize(claim);
	}

	private async saveReceipt(id: number, messageId: string) {
		await this.database.alertDeliveryClaim.update({ where: { id }, data: { messageId } });
		this.receipts.delete(id);
	}

	private async finalize(claim: AlertDeliveryClaim) {
		if (!claim.messageId) return;
		const { alertId, guildId, channelId, messageId, expiresAt } = claim;
		await this.database.$transaction(async tx => {
			await tx.sentAlert.upsert({
				where: { alertId_guildId_channelId: { alertId, guildId, channelId } },
				create: { alertId, guildId, channelId, messageId, expiresAt },
				update: { messageId, expiresAt }
			});
			if (claim.autoCleanup) {
				await tx.volatileMessage.upsert({
					where: { messageId },
					create: { guildId, channelId, messageId, expiresAt },
					update: { expiresAt }
				});
			}
			await tx.alertDeliveryClaim.update({ where: { id: claim.id }, data: { finalized: true } });
		});
	}
}
