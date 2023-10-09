import { client } from '@client';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ICommand } from '#ICommand';
import type { ChatInputCommandInteraction } from 'discord.js';

import addSubcommand from './_add';
import removeSubcommand from './_remove';
import listSubcommand from './_list';

export default ({
	data: new SlashCommandBuilder()
		.setName('alert')
		.setDescription('Weather alert commands')
		.addSubcommand(sc => sc
			.setName('add')
			.setDescription('Designates a channel for posting weather alerts to')
			.addNumberOption(o => o
				.setName('latitude')
				.setDescription('The latitude of the area to check for active alerts')
				.setRequired(true))
			.addNumberOption(o => o
				.setName('longitude')
				.setDescription('The longitude of the area to check for active alerts')
				.setRequired(true))
			.addChannelOption(o => o
				.setName('channel')
				.setDescription('The channel in which to send alerts to')
				.setRequired(true))
			.addBooleanOption(o => o
				.setName('auto-cleanup')
				.setDescription('Whether my messages should be deleted periodically (true by default)')
				.setRequired(false)))
		.addSubcommand(sc => sc
			.setName('remove')
			.setDescription('Removes alert reporting')
			.addStringOption(o => o
				.setName('snowflake')
				.setDescription('The snowflake associated with the alert reporting you want to remove')
				.setRequired(true)))
		.addSubcommand(sc => sc
			.setName('list')
			.setDescription('Lists all alert reporting destinations in this server'))
		.setDMPermission(false)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
	async execute(interaction: ChatInputCommandInteraction) {
		await client.executeSubcommand(interaction, {
			'add': addSubcommand,
			'remove': removeSubcommand,
			'list': listSubcommand,
		});
	},
}) satisfies ICommand;
