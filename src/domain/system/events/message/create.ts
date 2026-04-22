import { env } from '@env';
import { $msg } from '@lib/messages';
import { BaseEvent } from '@infra/events';
import { reportError } from '@lib/logger';
import { TeamMemberRole } from 'discord.js';
import { Stopwatch } from '@sapphire/stopwatch';
import { LegacyCommandError, LegacyCommandArguments } from '@infra/legacy-commands';
import type { Message } from 'discord.js';

export class MessageCreateEvent extends BaseEvent<'messageCreate'> {
	public constructor() {
		super({ name: 'messageCreate' });
	}

	public async handle(message: Message) {
		if (message.author.bot || !message.content.length) {
			return;
		}

		const prefix = env.get('OWNER_PREFIX');
		if (!message.content.startsWith(prefix)) {
			return;
		}

		const content = message.content.slice(prefix.length).trim();
		if (!content.length) {
			return;
		}

		let parsed: ReturnType<typeof LegacyCommandArguments.parse>;
		try {
			parsed = LegacyCommandArguments.parse(content);
		} catch (err) {
			if (err instanceof LegacyCommandError) {
				await message.reply(err.message);
				return;
			}

			throw err;
		}

		if (!parsed) {
			return;
		}

		const command = message.client.getLegacyCommand(parsed.commandName);
		if (!command) {
			return;
		}

		const isOwner = this.isOwner(message);
		if (!isOwner) {
			return;
		}

		const sw = new Stopwatch();

		try {
			this.logger
				.withMetadata({ args: JSON.stringify(parsed.args.toArray()) })
				.info(`${message.author.tag} (${message.author.id}) executed ${prefix}${parsed.commandName}`);

			await command.callHandler({
				message,
				args: parsed.args,
				prefix,
				invokedName: parsed.commandName,
				commands: message.client.legacyCommandRegistry
			});
		} catch (err) {
			if (err instanceof LegacyCommandError) {
				await message.reply(err.message);
			} else {
				reportError('Error in legacy command handler', err, { command: parsed.commandName });
				await message.reply($msg.events.interaction.create.commandFailed());
			}
		} finally {
			this.logger.debug(`Legacy command completed in ${sw.toString()}`);
		}
	}

	private async isOwner(message: Message) {
		const userId = message.author.id;
		const owner  = message.client.application.owner!;
		if ('members' in owner) {
			return owner.members.some(
				m => m.id === userId && (
					m.role === TeamMemberRole.Admin ||
					m.role === TeamMemberRole.Developer
				)
			);
		} else {
			return owner.id === userId;
		}
	}
}
