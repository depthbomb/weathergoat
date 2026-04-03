import { $msg } from '@lib/messages';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

const enum Subcommands {
	Enable  = 'enable',
	Disable = 'disable',
}

export default class MaintenanceCommand extends BaseLegacyCommand {
	public constructor() {
		super({
			syntax: `maintenance <${Subcommands.Enable} [reason:string...] | ${Subcommands.Disable}>`,
			description: 'Toggle maintenance mode.',
		});
	}

	public async [Subcommands.Enable](message: Message) {
		const reason = this.ctx?.params.getString('reason', false);

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
