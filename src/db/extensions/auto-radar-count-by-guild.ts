import { Prisma } from '@prisma/client';

export default Prisma.defineExtension({
	name: 'auto-radar-count-by-guild-extension',
	model: {
		autoRadarMessage: {
			async countByGuild<T>(this: T, guildId: string): Promise<number> {
				const ctx = Prisma.getExtensionContext(this);
				const cnt = await (ctx as any).count({ where: { guildId } }) as number;

				return cnt;
			}
		}
	}
});
