import { serve } from 'bun';
import { injectable } from '@needle-di/core';
import type { Server } from 'bun';

@injectable()
export class ApiService {
	private readonly server: Server<undefined>;

	public constructor() {
		this.server = serve({
			port: 3001,
			routes: {
				'/health': new Response('OK'),
			}
		});
	}

	public async stop() {
		return this.server.stop();
	}
}
