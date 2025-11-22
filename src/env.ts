import { Env } from '@depthbomb/env';

export const env = Env.create({
	MODE: Env.schema.enum(['production', 'development'] as const, { defaultValue: 'development' }),
	BOT_ID: Env.schema.string(),
	BOT_TOKEN: Env.schema.string(),
	DATABASE_URL: Env.schema.url(),
	REDIS_URL: Env.schema.url(),
	SENTRY_DSN: Env.schema.string({ required: false }),
	GITHUB_ACCESS_TOKEN: Env.schema.string(),
	MAX_RADAR_MESSAGES_PER_GUILD: Env.schema.int(),
	MAX_ALERT_DESTINATIONS_PER_GUILD: Env.schema.int(),
	MAX_FORECAST_DESTINATIONS_PER_GUILD: Env.schema.int(),
});
