import { $msg } from '@lib/messages';
import { injectable } from '@needle-di/core';
import { BaseCommand } from '@infra/commands';
import { OwnerPrecondition } from '@preconditions/owner';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

@injectable()
export default class MaintenanceCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
			.setName('maintenance')
			.setDescription('Commands related to maintenance mode. Owner only.')
			.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
			.addSubcommand(sc => sc
				.setName('enable')
				.setDescription('Enables maintenance mode, disabling use of commands.')
				.addStringOption(o => o
					.setName('reason')
					.setDescription('The reason for maintenance being enabled')
					.setRequired(false)
				)
			)
			.addSubcommand(sc => sc
				.setName('disable')
				.setDescription('Disables maintenance mode')
			)
		});

		this.createSubcommandMap<'enable' | 'disable'>({
			enable: {
				handler: this._handleEnableSubcommand,
				preconditions: [
					new OwnerPrecondition()
				]
			},
			disable: {
				handler: this._handleDisableSubcommand,
				preconditions: [
					new OwnerPrecondition()
				]
			}
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	private async _handleEnableSubcommand(interaction: ChatInputCommandInteraction) {
		const reason = interaction.options.getString('reason', false);

		interaction.client.maintenanceModeFlag.setTrue();

		if (reason) {
			interaction.client.maintenanceModeReason.set(reason);
		}

		await interaction.reply($msg.commands.maintenance.enabled());
	}

	private async _handleDisableSubcommand(interaction: ChatInputCommandInteraction) {
		interaction.client.maintenanceModeFlag.setFalse();
		interaction.client.maintenanceModeReason.reset();

		await interaction.reply($msg.commands.maintenance.disabled());
	}
}
