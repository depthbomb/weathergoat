import { db } from '@database';
import { BaseCommand } from '@infra/commands';
import { time, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { IncidentStatus, IncidentSeverity } from '@database/generated/enums';
import type { ChatInputCommandInteraction } from 'discord.js';

export default class IncidentsCommand extends BaseCommand {
	public constructor() {
		super({
			data: new SlashCommandBuilder()
				.setName('incidents')
				.setDescription('View active incidents affecting my operations.')
		});
	}

	public async handle(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply();

		const activeIncidents = await db.incident.findMany({ where: { status: IncidentStatus.ACTIVE }, take: 10 });
		if (activeIncidents.length === 0) {
			await interaction.editReply('There are currently no active incidents.');
		} else {
			const embeds = [] as EmbedBuilder[];
			for (const incident of activeIncidents) {
				const embed = new EmbedBuilder()
					.setTitle(`${this.getSeverityEmoji(incident.severity)} ${incident.severity.bracketWrap()} ${incident.title}`)
					.setDescription(incident.description)
					.setFields([
						{
							name: 'Created',
							value: time(incident.createdAt, 'R')
						}
					]);

				embeds.push(embed);
			}

			await interaction.editReply({ embeds });
		}
	}

	private getSeverityEmoji(severity: IncidentSeverity) {
		switch (severity) {
			case IncidentSeverity.LOW:
				return '<:incidentLow:1493085222554697738>';
			case IncidentSeverity.MEDIUM:
				return '<:incidentMedium:1493085224878346260>';
			case IncidentSeverity.HIGH:
				return '<:incidentHigh:1493085220419928155>';
		}
	}
}
