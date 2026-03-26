import { db } from '@database';
import { assume } from '@depthbomb/common';
import { $msg } from '@lib/messages.generated';
import { BaseComponent } from '@infra/components';
import { isGuildMember } from '@sapphire/discord.js-utilities';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { ComponentMatch } from '@infra/components';
import type { MessageComponentInteraction } from 'discord.js';

export default class DeleteAutoRadarButton extends BaseComponent {
	public constructor() {
		super({ customId: 'delete-auto-radar:*' });
	}

	public async handle(interaction: MessageComponentInteraction, match: ComponentMatch) {
		if (!interaction.member || !isGuildMember(interaction.member)) {
			return;
		}

		if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				content: $msg.components.deleteAutoRadarButton.noPermission(),
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

		const autoRadarMessage = await db.autoRadarMessage.findFirst({ where });
		if (!autoRadarMessage) {
			await interaction.reply({
				content: $msg.components.deleteAutoRadarButton.couldNotFindMessage(),
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await db.autoRadarMessage.delete({ where });
		await interaction.message.delete();
	}
}
