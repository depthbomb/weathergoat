import { database } from '@data';
import { EmbedBuilder, channelMention } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default async function listSubcommand(interaction: ChatInputCommandInteraction): Promise<any> {
	const { guild } = interaction;
	if (!guild) {
		return;
	}

	const forecastDestinations = await database.forecastDestination.findMany({
		where: {
			guildId: guild.id
		}
	});

	if (!forecastDestinations.length) {
		return await interaction.reply('This server has no forecast destinations.');
	}

	const embed = new EmbedBuilder().setDescription('I\'m reporting the following weather forecasts:');

	const fields = forecastDestinations.slice(0, 25).map(d => {
		const { latitude, longitude, channelId, snowflake, autoCleanup } = d;

		return {
			name: `${latitude},${longitude}`,
			value: `To: ${channelMention(channelId)}\nSnowflake: \`${snowflake}\`\nAuto-Cleanup: ${autoCleanup ? '✅': '❌'}`,
			inline: true
		};
	});

	embed.addFields(fields);

	await interaction.reply({ embeds: [embed] });
}
