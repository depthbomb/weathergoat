import type { Awaitable, CommandInteraction, ContextMenuCommandInteraction } from 'discord.js';
import type { SlashCommandBuilder, ContextMenuCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders';

export interface ICommand {
	/**
	 * Discord.js builder data.
	 */
	data: Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'> | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder;
	/**
	 * Executes the logic for the command.
	 * @param interaction {@link CommandInteraction} or {@link ContextMenuCommandInteraction}
	 */
	execute(interaction: CommandInteraction | ContextMenuCommandInteraction): Awaitable<any>;
}
