import { inject } from '@needle-di/core';
import { IncidentsService } from '@services/incidents';
import { BaseLegacyCommand } from '@infra/legacy-commands';
import { IncidentSeverity } from '@database/generated/enums';
import type { Message } from 'discord.js';

const enum Subcommands {
	Create  = 'create',
	Resolve = 'resolve',
}

export default class IncidentsCommand extends BaseLegacyCommand {
	public constructor(
		private readonly incidents = inject(IncidentsService)
	) {
		super({
			syntax: `incidents <${Subcommands.Create} <title:string> <severity:string> <description:string> [autoResolveAt:string] | ${Subcommands.Resolve} <title:string>>`,
			description: 'Incidents management commands.',
		});
	}

	public async [Subcommands.Create](message: Message) {
		const title         = this.ctx!.params.getString('title', true);
		const severity      = this.ctx!.params.getString('severity', true);
		const description   = this.ctx!.params.getString('description', true);
		const autoResolveAt = this.ctx!.params.getString('autoResolveAt', false);

		try {
			const incident = await this.incidents.ensureActiveIncident(title, description, this.parseSeverity(severity), autoResolveAt);

			await message.reply(`Successfully created incident \`${incident.snowflake}\`.`);
		} catch (err) {
			await message.reply(`Failed to create incident.\n${(err as Error).stack?.toCodeBlock()}`);
		}
	}

	public async [Subcommands.Resolve](message: Message) {
		const title = this.ctx!.params.getString('title', true);

		const key       = title.toSlug();
		const { count } = await this.incidents.resolve(key);
		if (count > 0) {
			await message.reply(`Resolved ${count} incident(s).`);
		} else {
			await message.reply('No incidents to resolve.');
		}
	}

	private parseSeverity(value: string) {
		switch (value) {
			case IncidentSeverity.LOW:
			case IncidentSeverity.MEDIUM:
			case IncidentSeverity.HIGH:
				return value
			default:
				throw new Error(`Invalid IncidentSeverity: ${value}`)
		}
	}
}
