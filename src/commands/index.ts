import { InvalidPermissionsError } from '@lib/errors';
import { isGuildMember, isGuildBasedChannel } from '@sapphire/discord.js-utilities';
import type {
	Awaitable,
	PermissionResolvable,
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export abstract class Command {
	public constructor(
		public readonly data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
	) {}

	abstract handle(interaction: ChatInputCommandInteraction): Awaitable<any>;

	public handleAutocomplete?(interaction: AutocompleteInteraction): Awaitable<any> {}

	public assertPermissions(interaction: ChatInputCommandInteraction, permissions: PermissionResolvable, message?: string) {
		const { channel, member } = interaction;

		message ??= 'You do not have permission to use this command.';

		return InvalidPermissionsError.assert(
			isGuildBasedChannel(channel) && isGuildMember(member) && member.permissions.has(permissions),
			message
		);
	}
}
