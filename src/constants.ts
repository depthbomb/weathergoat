import { main } from 'bun';
import { join, dirname } from 'node:path';

export const CALVER = '2026.3.22' as const;

export const REPO_OWNER = 'depthbomb' as const;
export const REPO_NAME  = 'weathergoat' as const;
export const REPO       = `${REPO_OWNER}/${REPO_NAME}` as const;

export const API_BASE_ENDPOINT      = 'https://api.weather.gov' as const;
export const ALERTS_SEARCH_BASE_URL = 'https://alerts.weather.gov/search' as const;

export const BOT_USER_AGENT = `WeatherGoat (github: ${REPO})` as const;

export const ROOT_DIR       = dirname(main);
export const PROJECT_ROOT   = join(ROOT_DIR, '..');
export const DATA_DIR       = join(PROJECT_ROOT, '.data');
export const LOGS_DIR       = join(DATA_DIR, 'logs');
export const COMMANDS_DIR   = join(ROOT_DIR, 'commands');
export const COMPONENTS_DIR = join(ROOT_DIR, 'components');
export const EVENTS_DIR     = join(ROOT_DIR, 'events');
export const JOBS_DIR       = join(ROOT_DIR, 'jobs');

export const FEATURE_DEFINITIONS = {
	disableAlertReporting: {
		fraction: 0.0,
		description: 'Alert reporting killswitch'
	},
	disableForecastReporting: {
		fraction: 0.0,
		description: 'Forecast reporting killswitch'
	},
	disableMessageSweeping: {
		fraction: 0.0,
		description: 'Message sweeping killswitch'
	},
	disableRadarMessageUpdating: {
		fraction: 0.0,
		description: 'Radar message updating killswitch'
	},
	disableStatusUpdating: {
		fraction: 0.0,
		description: 'Status updating killswitch'
	},
	disableFeedbackSubmissions: {
		fraction: 0.0,
		description: 'Feedback submission killswitch'
	},
	disableAnnouncementDispatching: {
		fraction: 0.0,
		description: 'Announcement dispatching killswitch'
	}
} as const;

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
	SeverityUnknown  = 0x9ca3af,
	SeverityMinor    = 0xfbbf24,
	SeverityModerate = 0xf97316,
	SeveritySevere   = 0xdc2626,
	SeverityExtreme  = 0x7f1d1d
}
