import { Prisma } from '@prisma/client';

export default Prisma.defineExtension({
	name: 'alertDestination-countByGuild-extension',
	model: {
		alertDestination: {
			async countByGuild<T>(this: T, guildId: string): Promise<number> {
				const ctx = Prisma.getExtensionContext(this);
				const cnt = await (ctx as any).count({ where: { guildId } }) as number;

				return cnt;
			}
		}
	}
});
