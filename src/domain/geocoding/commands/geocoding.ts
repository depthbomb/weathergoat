import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { reportError } from '@lib/logger';
import { BaseCommand } from '@infra/commands';
import { GeocodingService } from '@services/geocoding';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { HTTPRequestError, isWeatherGoatError } from '@errors';
import { inlineCode, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createErrorMessageComponent, createWarningMessageComponent } from '@utils/components';
import type { APIEmbedField, ChatInputCommandInteraction } from 'discord.js';

const enum Subcommands {
	Search = 'search'
}

export class GeocodingCommand extends BaseCommand {
	public constructor(
		private readonly geocoding = inject(GeocodingService)
	) {
		super({
			data: new SlashCommandBuilder()
				.setName('geocoding')
				.setDescription('Commands related to geocoding')
				.addSubcommand(sc => sc
					.setName(Subcommands.Search)
					.setDescription('Retrieves info about a location in the U.S.')
					.addStringOption(o => o
						.setName('query')
						.setDescription('Postal code / CITY, STATE / etc.')
						.setRequired(true)
					)
				),
		});

		this.configureSubcommands<Subcommands>({
			[Subcommands.Search]: [new CooldownPrecondition({ duration: '5s', global: true })]
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await this.handleSubcommand(interaction);
	}

	public async [Subcommands.Search](interaction: ChatInputCommandInteraction) {
		const query = interaction.options.getString('query', true).trim();
		if (!query.length) {
			await interaction.reply({
				components: [createErrorMessageComponent($msg.geocoding.command.errors.emptyQuery())],
				flags: MessageFlags.IsComponentsV2
			});
			return;
		}

		await interaction.deferReply();

		try {
			const res = await this.geocoding.queryLocationInfo(query);
			if (!res.length) {
				await interaction.editReply({
					components: [createWarningMessageComponent($msg.geocoding.command.errors.noResults())],
					flags: MessageFlags.IsComponentsV2
				});
				return;
			}

			const location = res[0];
			const fields   = [] as APIEmbedField[];
			const address  = location.address;

			if (address?.county) {
				fields.push({ name: 'County', value: address.county, inline: true });
			}
			if (address?.town) {
				fields.push({ name: 'Town', value: address.town, inline: true });
			} else if (address?.city) {
				fields.push({ name: 'City', value: address.city, inline: true });
			}
			if (address?.state) {
				fields.push({ name: 'State', value: address.state, inline: true });
			}

			fields.push(
				{ name: 'Latitude', value: inlineCode(location.latitude), inline: true },
				{ name: 'Longitude', value: inlineCode(location.longitude), inline: true }
			);

			const embed = new EmbedBuilder()
				.setColor(Color.Success)
				.setDescription(location.displayName)
				.addFields(fields);

			if (location.license) {
				embed.setFooter({ text: location.license });
			}

			await interaction.editReply({ embeds: [embed] });
		} catch (err: unknown) {
			if (isWeatherGoatError(err, HTTPRequestError)) {
				await interaction.editReply({
					components: [createErrorMessageComponent($msg.geocoding.command.errors.http(err.code, err.status))],
					flags: MessageFlags.IsComponentsV2
				});
			} else {
				reportError('Error searching for a geocoded location', err, { query });
				await interaction.editReply({
					components: [createErrorMessageComponent($msg.geocoding.command.errors.unknown())],
					flags: MessageFlags.IsComponentsV2
				});
			}
		}
	}
}
