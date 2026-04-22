import { db } from '@database';
import { $msg } from '@lib/messages.generated';
import { assume } from '@depthbomb/common/typing';
import { BaseComponent } from '@infra/components';
import { isGuildMember } from '@sapphire/discord.js-utilities';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { ComponentMatch } from '@infra/components';
import type { MessageComponentInteraction } from 'discord.js';

export class DeleteForecastButton extends BaseComponent {
	public constructor() {
		super({ customId: 'delete-forecast:*' });
	}

	public async handle(interaction: MessageComponentInteraction, match: ComponentMatch) {
		if (!interaction.member || !isGuildMember(interaction.member)) {
			return;
		}

		if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				content: $msg.components.deleteForecastButton.noPermission(),
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await interaction.deferUpdate();

		const { guildId, channelId } = interaction;
		const [messageId]            = match.wildcards;

		assume<string>(guildId);
		assume<string>(channelId);

		const where = { guildId, channelId, messageId };

		const forecastMessage = await db.forecastDestination.findFirst({ where });
		if (!forecastMessage) {
			await interaction.reply({
				content: $msg.components.deleteForecastButton.couldNotFindMessage(),
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await db.forecastDestination.delete({ where });
		await interaction.message.delete();
	}
}
