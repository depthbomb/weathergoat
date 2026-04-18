import { $ } from 'bun';
import { CALVER } from '@constants';
import { $msg } from '@lib/messages';
import { BaseEvent } from '@infra/events';
import { isTeamOwner } from '@utils/guards';
import { isNull } from '@depthbomb/common/guards';
import type { WeatherGoat } from '@lib/client';

export default class ClientReadyEvent extends BaseEvent<'clientReady'> {
	public constructor() {
		super({ name: 'clientReady' });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this.logger.withMetadata({ readyAt }).info('Logged in to Discord');

		const [sha, help, incidents] = await Promise.all([
			$`git rev-parse --short HEAD`.text(),
			client.getCommandLink('help'),
			client.getCommandLink('incidents')
		]);

		await client.application?.fetch();
		await client.application!.edit({ description: $msg.common.description(help, incidents, CALVER, sha) });

		// The bot won't receive the `messageCreate` event for DMs unless it sends a message first
		// or we manually create a DM with the user, so we automatically create a DM to application
		// owners.

		const owner = client.application!.owner;
		if (isNull(owner)) {
			return;
		}

		if (isTeamOwner(owner)) {
			for (const [,member] of owner.members) {
				await member.user.createDM(true);
			}
		} else {
			await owner.createDM(true);
		}
	}
}
