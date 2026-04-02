import { $msg } from '@lib/messages';
import { BaseCommand } from '@infra/commands';
import { OwnerPrecondition } from '@preconditions/owner';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Enable  = 'enable',
	Disable = 'disable',
}

export default class MaintenanceCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('maintenance')
				.setDescription('Commands related to maintenance mode. Owner only.')
				.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
				.addSubcommand(sc => sc
					.setName(Subcommands.Enable)
					.setDescription('Enables maintenance mode, disabling use of commands.')
					.addStringOption(o => o
						.setName('reason')
						.setDescription('The reason for maintenance being enabled')
						.setRequired(false)
					)
				)
				.addSubcommand(sc => sc
					.setName(Subcommands.Disable)
					.setDescription('Disables maintenance mode')
				)
		});

		this.configureSubcommands<Subcommands>({
			[Subcommands.Enable]: [new OwnerPrecondition()],
			[Subcommands.Disable]: [new OwnerPrecondition()]
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.Enable](interaction: ChatInputCommandInteraction) {
		const reason = interaction.options.getString('reason', false);

		interaction.client.maintenanceModeFlag.setTrue();

		if (reason) {
			interaction.client.maintenanceModeReason.set(reason);
		}

		await interaction.reply($msg.commands.maintenance.enabled());
	}

	public async [Subcommands.Disable](interaction: ChatInputCommandInteraction) {
		interaction.client.maintenanceModeFlag.setFalse();
		interaction.client.maintenanceModeReason.reset();

		await interaction.reply($msg.commands.maintenance.disabled());
	}
}
