import { Env } from '@depthbomb/env';

export const env = Env.create({
	MODE: Env.schema.enum(['production', 'development'], {
		required: true,
	}),
	BOT_TOKEN: Env.schema.secret({
		required: true,
	}),
	BOT_OWNER_ID: Env.schema.string({
		required: true,
	}),
	OWNER_PREFIX: Env.schema.string({
		required: true,
	}),
	OWNER_EMAIL: Env.schema.email({
		required: true,
	}),
	DATABASE_URL: Env.schema.url({
		required: true,
	}),
	REDIS_URL: Env.schema.url({
		required: true,
	}),
	REDIS_PREFIX: Env.schema.string({
		defaultValue: 'wg',
	}),
	SENTRY_DSN: Env.schema.secret({
		required: false,
	}),
	BEACON_WEBHOOK_URL: Env.schema.url({
		required: false,
	}),
	MAX_RADAR_MESSAGES_PER_GUILD: Env.schema.int({
		positive: true,
	}),
	MAX_ALERT_DESTINATIONS_PER_GUILD: Env.schema.int({
		positive: true,
	}),
	MAX_FORECAST_DESTINATIONS_PER_GUILD: Env.schema.int({
		positive: true,
	}),
});
