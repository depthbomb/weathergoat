import { name, version } from '../../package.json';

export async function makeRequest(input: NodeJS.fetch.RequestInfo, init?: NodeJS.fetch.RequestInit | undefined) {
	if (typeof input === 'string' && !input.startsWith('http')) {
		input = 'https://api.weather.gov' + input;
	}

	return fetch(input, {
		...init,
		headers: {
			Accept: 'application/ld+json',
			'user-agent': `${name} ${version}`
		}
	});
}
