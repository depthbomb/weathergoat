import { Prisma } from '../generated/client';

export default Prisma.defineExtension({
	name: 'forecast-destination-count-by-guild-extension',
	model: {
		forecastDestination: {
			async countByGuild<T>(this: T, guildId: string): Promise<number> {
				const ctx = Prisma.getExtensionContext(this);
				const cnt = await (ctx as any).count({ where: { guildId } }) as number;

				return cnt;
			}
		}
	}
});
