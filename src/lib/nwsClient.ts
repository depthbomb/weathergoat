import { ofetch } from 'ofetch/node';
import { name, version } from '../../package.json';

export const nwsClient = ofetch.create({
	baseURL: 'https://api.weather.gov',
	headers: {
		Accept: 'application/ld+json',
		'user-agent': `${name} ${version}`
	}
});
