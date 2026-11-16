import { env } from '@env';
import { MessageCreateEvent } from './create';
import { mock, test, expect, describe } from 'bun:test';
import { ChannelType, Collection, TeamMemberRole } from 'discord.js';
import type { ClientApplication, Message } from 'discord.js';
import type { LegacyCommandContext } from '@infra/legacy-commands';

function createMessage(owner: unknown, options: {
	userId?: string;
	content?: string;
	channelType?: ChannelType;
	bot?: boolean;
} = {}) {
	const callHandler = mock(async (_context: LegacyCommandContext) => {});
	const getLegacyCommand = mock(() => ({ callHandler }));
	const reply = mock(async () => {});
	const message = {
		author: { id: options.userId ?? 'caller', tag: 'test-user', bot: options.bot ?? false },
		content: options.content ?? `${env.get('OWNER_PREFIX')}eval 1 + 1`,
		channel: { type: options.channelType ?? ChannelType.DM },
		client: { application: { owner }, getLegacyCommand, legacyCommandRegistry: {} },
		reply
	} as unknown as Message;

	return { message, callHandler, getLegacyCommand, reply };
}

function createTeam(role: string, memberId = 'caller') {
	return { members: new Collection([[memberId, { id: memberId, role }]]) };
}

describe('owner DM commands', () => {
	test('does not execute commands from someone other than the application owner', async () => {
		const { message, callHandler } = createMessage({ id: 'owner' });
		await new MessageCreateEvent().handle(message);
		expect(callHandler).not.toHaveBeenCalled();
	});

	test('executes commands from the application owner', async () => {
		const { message, callHandler } = createMessage({ id: 'caller' });
		await new MessageCreateEvent().handle(message);
		expect(callHandler).toHaveBeenCalledTimes(1);
		expect(callHandler.mock.calls[0]).toEqual([expect.objectContaining({ message, invokedName: 'eval' })]);
	});

	for (const role of [TeamMemberRole.Admin, TeamMemberRole.Developer]) {
		test(`allows team ${role} members`, async () => {
			const { message, callHandler } = createMessage(createTeam(role));
			await new MessageCreateEvent().handle(message);
			expect(callHandler).toHaveBeenCalledTimes(1);
		});
	}

	for (const [name, owner] of [
		['a read-only team member', createTeam(TeamMemberRole.ReadOnly)],
		['an unknown team role', createTeam('unknown')],
		['someone outside the team', createTeam(TeamMemberRole.Admin, 'owner')],
		['an empty team', { members: new Collection() }],
		['missing ownership data', null]
	] as const) {
		test(`rejects ${name} before looking up commands`, async () => {
			const { message, callHandler, getLegacyCommand, reply } = createMessage(owner);
			await new MessageCreateEvent().handle(message);
			expect(callHandler).not.toHaveBeenCalled();
			expect(getLegacyCommand).not.toHaveBeenCalled();
			expect(reply).not.toHaveBeenCalled();
		});
	}

	test('fails closed before the application is available', async () => {
		const { message, callHandler, getLegacyCommand } = createMessage(null);
		message.client.application = null as unknown as ClientApplication;
		await new MessageCreateEvent().handle(message);
		expect(callHandler).not.toHaveBeenCalled();
		expect(getLegacyCommand).not.toHaveBeenCalled();
	});

	test('does not parse or reply to malformed commands from non-owners', async () => {
		const { message, callHandler, reply } = createMessage({ id: 'owner' }, {
			content: `${env.get('OWNER_PREFIX')}eval "unterminated`
		});
		await new MessageCreateEvent().handle(message);
		expect(callHandler).not.toHaveBeenCalled();
		expect(reply).not.toHaveBeenCalled();
	});

	for (const channelType of [ChannelType.GuildText, ChannelType.GroupDM]) {
		test(`ignores owner commands outside bot DMs (channel ${channelType})`, async () => {
			const { message, callHandler, getLegacyCommand } = createMessage({ id: 'caller' }, { channelType });
			await new MessageCreateEvent().handle(message);
			expect(callHandler).not.toHaveBeenCalled();
			expect(getLegacyCommand).not.toHaveBeenCalled();
		});
	}

	test('ignores bot-authored commands', async () => {
		const { message, callHandler } = createMessage({ id: 'caller' }, { bot: true });
		await new MessageCreateEvent().handle(message);
		expect(callHandler).not.toHaveBeenCalled();
	});

	test('ignores owner messages without the command prefix', async () => {
		const { message, callHandler, getLegacyCommand } = createMessage({ id: 'caller' }, { content: 'eval 1 + 1' });
		await new MessageCreateEvent().handle(message);
		expect(callHandler).not.toHaveBeenCalled();
		expect(getLegacyCommand).not.toHaveBeenCalled();
	});
});
