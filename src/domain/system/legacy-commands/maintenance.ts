import { $msg } from '@lib/messages';
import { BaseLegacyCommand, LegacyCommandParam } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Enable  = 'enable',
	Disable = 'disable',
}

export class MaintenanceCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			name: 'maintenance',
			description: 'Maintenance management commands.',
			subcommands: {
				[Subcommands.Enable]: [
					LegacyCommandParam.string('reason', { required: false, rest: true }),
				],
				[Subcommands.Disable]: [],
			},
		});
	}

	public async [Subcommands.Enable](message: Message) {
		const reason = this.ctx.params.getString('reason', false);

		message.client.maintenanceModeFlag.setTrue();
		if (reason) {
			message.client.maintenanceModeReason.set(reason);
		}

		await message.reply($msg.legacyCommands.maintenance.enabled());
	}

	public async [Subcommands.Disable](message: Message) {
		message.client.maintenanceModeFlag.setFalse();
		message.client.maintenanceModeReason.reset();

		await message.reply($msg.legacyCommands.maintenance.disabled());
	}
}
