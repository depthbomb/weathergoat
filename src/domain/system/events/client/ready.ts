import { $ } from 'bun';
import { CALVER } from '@constants';
import { $msg } from '@lib/messages';
import { BaseEvent } from '@infra/events';
import { isTeamOwner } from '@utils/guards';
import type { WeatherGoat } from '@lib/client';

export default class ClientReadyEvent extends BaseEvent<'clientReady'> {
	public constructor() {
		super({ name: 'clientReady' });
	}

	public async handle(client: WeatherGoat<true>) {
		const { readyAt } = client;

		this.logger.withMetadata({ readyAt }).info('Logged in to Discord');

		const sha = await $`git rev-parse --short HEAD`.text();

		await client.application?.fetch();
		await client.application?.edit({
			description: $msg.common.description(CALVER, sha)
		});

		const owner = client.application!.owner!;
		if (isTeamOwner(owner)) {
			for (const [,member] of owner.members) {
				await member.user.createDM(true);
			}
		} else {
			await owner.createDM(true);
		}
	}
}
