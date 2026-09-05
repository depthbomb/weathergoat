import { expect, test, spyOn } from 'bun:test';
import { BannerService } from './banner';
import { Alert, AlertSeverity } from '@models/Alert';

test('a failed render is shared by concurrent callers but retried on the next request', async () => {
	const service = Object.assign(Object.create(BannerService.prototype), { renderCache: new Map() }) as BannerService;
	const alert = Object.assign(new Alert(), { event: 'Tornado Warning', severity: AlertSeverity.Extreme });
	const renderer = spyOn(service as unknown as { renderBanner: () => Promise<Buffer> }, 'renderBanner')
		.mockRejectedValueOnce(new Error('temporary disk failure'))
		.mockResolvedValue(Buffer.from('png'));
	try {
		const results = await Promise.allSettled([service.generateBanner(alert), service.generateBanner(alert)]);
		expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
		expect(renderer).toHaveBeenCalledTimes(1);
		expect(await service.generateBanner(alert)).toEqual(Buffer.from('png'));
		expect(renderer).toHaveBeenCalledTimes(2);
	} finally {
		renderer.mockRestore();
	}
});
