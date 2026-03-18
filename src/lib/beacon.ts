import { env } from '@env';
import { $msg } from './messages';
import { Color } from '@constants';
import { EmbedBuilder, WebhookClient } from 'discord.js';
import type { WeatherGoat } from './client';

export class Beacon {
	public install(client: WeatherGoat) {
		const webhook = new WebhookClient({
			url: env.get('BEACON_WEBHOOK_URL')
		});

		client.on('guildCreate', async guild => {
			const embed = new EmbedBuilder()
				.setTitle($msg.beacon.titles.guildAdded())
				.setColor(Color.Success)
				.setThumbnail(guild.iconURL())
				.addFields([
					{
						name: $msg.beacon.fields.name(),
						value: `${guild.name} (${guild.id})`
					},
					{
						name: $msg.beacon.fields.members(),
						value: guild.memberCount.toLocaleString(),
						inline: true
					},
					{
						name: $msg.beacon.fields.channels(),
						value: guild.channels.cache.size.toLocaleString(),
						inline: true
					},
				]);

			if (guild.banner) {
				embed.setImage(guild.bannerURL());
			}

			await webhook.send({ embeds: [embed] });
		});

		client.on('guildDelete', async guild => {
			const embed = new EmbedBuilder()
				.setTitle($msg.beacon.titles.guildRemoved())
				.setColor(Color.Danger)
				.addFields([{
					name: $msg.beacon.fields.name(),
					value: `${guild.name} (${guild.id})`
				}]);

			await webhook.send({ embeds: [embed] });
		});
	}
}
