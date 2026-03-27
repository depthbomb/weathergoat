import { main } from 'bun';
import { join, dirname } from 'node:path';

export const CALVER = '2026.3.27' as const;

export const REPO_OWNER = 'depthbomb' as const;
export const REPO_NAME  = 'weathergoat' as const;
export const REPO       = `${REPO_OWNER}/${REPO_NAME}` as const;

export const API_BASE_ENDPOINT      = 'https://api.weather.gov' as const;
export const ALERTS_SEARCH_BASE_URL = 'https://alerts.weather.gov/search' as const;

export const BOT_USER_AGENT = `WeatherGoat (github: ${REPO})` as const;

export const ROOT_DIR      = dirname(main);
export const PROJECT_ROOT  = join(ROOT_DIR, '..');
export const DATA_DIR      = join(PROJECT_ROOT, '.data');
export const LOGS_DIR      = join(DATA_DIR, 'logs');
export const DOMAINS_DIR   = join(ROOT_DIR, 'domain');
export const FEATURES_FILE = join(PROJECT_ROOT, 'features.yaml');

/**
 * Feature flags that will be loaded from `FEATURES_FILE`.
 *
 * @privateRemarks
 * Keep this in sync with `FEATURES_FILE`.
 */
export const FEATURE_FLAGS = [
	'disableAlertReporting',
	'disableForecastReporting',
	'disableMessageSweeping',
	'disableRadarMessageUpdating',
	'disableStatusUpdating',
	'disableFeedbackSubmissions',
	'disableAnnouncementDispatching'
] as const;

export const IMAGE_ASSETS = {
	'alert-banner-extreme':  'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484203003965.png?size=1024',
	'alert-banner-minor':    'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424486711197697.png?size=1024',
	'alert-banner-moderate': 'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484551135314.png?size=1024',
	'alert-banner-severe':   'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484307734620.png?size=1024',
	'alert-banner-unknown':  'https://cdn.discordapp.com/app-assets/1009028718083199016/1364424484748267622.png?size=1024',
} as const;

export const enum Color {
	Primary          = 0x5876aa,
	Info             = 0x0ea5e9,
	Success          = 0x84cc16,
	Warning          = 0xeab308,
	Danger           = 0xdc2626,
	//
	SeverityUnknown  = 0x9ca3af,
	SeverityMinor    = 0xfbbf24,
	SeverityModerate = 0xf97316,
	SeveritySevere   = 0xdc2626,
	SeverityExtreme  = 0x7f1d1d
}
