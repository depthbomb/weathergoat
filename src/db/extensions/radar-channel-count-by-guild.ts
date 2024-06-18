import { Prisma } from '@prisma/client';

export default Prisma.defineExtension({
	name: 'radar-channel-count-by-guild-extension',
	model: {
		radarChannel: {
			async countByGuild<T>(this: T, guildId: string): Promise<number> {
				const ctx = Prisma.getExtensionContext(this);
				const cnt = await (ctx as any).count({ where: { guildId } }) as number;

				return cnt;
			}
		}
	}
});
