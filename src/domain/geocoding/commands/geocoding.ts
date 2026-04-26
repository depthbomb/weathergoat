import { Color } from '@constants';
import { $msg } from '@lib/messages';
import { inject } from '@needle-di/core';
import { BaseCommand } from '@infra/commands';
import { GeocodingService } from '@services/geocoding';
import { isNonEmptyString } from '@depthbomb/common/guards';
import { CooldownPrecondition } from '@preconditions/cooldown';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createErrorMessageComponent, createWarningMessageComponent } from '@utils/components';
import type { ChatInputCommandInteraction } from 'discord.js';

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
		const query = interaction.options.getString('query', true);
		if (!isNonEmptyString(query)) {
			await interaction.editReply({
				components: [createErrorMessageComponent($msg.announcements.command.subscribe.alreadySubscribed())],
				flags: MessageFlags.IsComponentsV2
			});
			return;
		}

		await interaction.deferReply();

		const res = await this.geocoding.queryLocationInfo(query);
		if (!res.length) {
			await interaction.editReply({
				components: [createWarningMessageComponent($msg.announcements.command.subscribe.alreadySubscribed())],
				flags: MessageFlags.IsComponentsV2
			});
			return;
		}

		const location = res[0];
		const embed = new EmbedBuilder()
			.setColor(Color.Success)
			.setDescription(location.displayName)
			.addFields([
				{ name: 'County',    value: location.address.county, },
				{ name: 'Town',      value: location.address.town, },
				{ name: 'State',     value: location.address.state },
				{ name: 'Latitude',  value: location.latitude.toInlineCode(), inline: true },
				{ name: 'Longitude', value: location.longitude.toInlineCode(), inline: true },
			])
			.setFooter({ text: location.license })

		await interaction.editReply({ embeds: [embed] });
	}
}
