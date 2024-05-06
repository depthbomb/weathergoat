import { InvalidPermissionsError } from '@lib/errors';
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type {
	Awaitable,
	GuildMember,
	PermissionsBitField,
	SlashCommandBuilder,
	ChatInputCommandInteraction,
	SlashCommandSubcommandsOnlyBuilder,
	PermissionResolvable,
} from 'discord.js';

export abstract class Command {
	public constructor(
		public readonly data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder
	) {}

	public handle(interaction: ChatInputCommandInteraction): Awaitable<any> {
		throw new Error(`Interaction command handler not implemented for ${interaction.commandName}`);
	}

	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not have permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
	}
}
