import { logger } from '@lib/logger';

export interface IService {
	name: string;
}

export function defineService<T>(name: string, instantiator: () => T) {
	const service = instantiator();

	(service as IService).name = name;

	logger.info('Defined service', { name });

	return service;
}
