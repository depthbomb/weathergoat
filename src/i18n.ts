import { join } from 'node:path';
import { t, use } from 'i18next';
import { LOCALES_PATH } from '@constants';
import fsBackend from 'i18next-fs-backend';
import type enUS from '../locales/en-US.json';
import type { Channel, User } from 'discord.js';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'en-US',
		resources: {
			'en-US': typeof enUS
		}
	}
}

export default async function() {
	await use(fsBackend).init({
		backend: {
			loadPath: join(LOCALES_PATH, '{{lng}}.json')
		},
		fallbackLng: ['en-US'],
		interpolation: {
			escapeValue: false,
			format: function(value, format) {
				if (format === 'mention') {
					return (value as Channel | User).toString();
				}

				return value;
			}
		}
	});
}

export const _ = t;
