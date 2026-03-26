import { Prisma } from '../generated/client';

export default Prisma.defineExtension({
	name: 'exists-extension',
	model: {
		$allModels: {
			async exists<T>(this: T, where: Prisma.Args<T, 'findFirst'>['where']): Promise<boolean> {
				const ctx = Prisma.getExtensionContext(this);
				const res = await (ctx as any).findFirst({ where });

				return res !== null;
			}
		}
	}
});
