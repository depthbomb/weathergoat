import { hyperlink, userMention, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ICommand } from '#ICommand';
import type { ChatInputCommandInteraction } from 'discord.js';
import { client } from '@client';

export default ({
	data: new SlashCommandBuilder()
		.setName('about')
		.setDescription('About me!'),
	async execute(interaction: ChatInputCommandInteraction) {
		const embed = new EmbedBuilder()
			.setTitle('About me!')
			.setDescription(`I'm a Discord bot made by ${userMention('133325534548590594')} to retrive info from the ${hyperlink('National Weather Service', 'https://www.weather.gov/')} and use that data to post weather alerts and forecasts to channels.`)
			.setThumbnail(client.user!.avatarURL())
			.setFields([
				{
					name: 'Technology',
					value: `I'm written in ${hyperlink('TypeScript', 'https://www.typescriptlang.org/')}, built on the ${hyperlink('discord.js', 'https://discord.js.org/#/')} library, and I store my info in a ${hyperlink('SQLite', 'https://www.sqlite.org/index.html')} database via the ${hyperlink('Prisma', 'https://www.prisma.io/')} ORM.\nAs of my creation, I'm running on my creator\'s ${hyperlink('Raspberry Pi 4', 'https://www.raspberrypi.com/products/raspberry-pi-4-model-b')}.`
				}
			]);

		await interaction.reply({ embeds: [embed] });
	},
}) satisfies ICommand;
