import { Env } from '@depthbomb/env';

export const env = Env.create({
	MODE:                                Env.schema.enum(['production', 'development']),
	BOT_ID:                              Env.schema.string(),
	BOT_TOKEN:                           Env.schema.secret(),
	BOT_OWNER_ID:                        Env.schema.string(),
	OWNER_PREFIX:                        Env.schema.string(),
	DATABASE_URL:                        Env.schema.url(),
	REDIS_URL:                           Env.schema.url(),
	REDIS_PREFIX:                        Env.schema.string({ defaultValue: 'wg' }),
	SENTRY_DSN:                          Env.schema.secret({ required: false }),
	BEACON_WEBHOOK_URL:                  Env.schema.url({ required: false }),
	MAX_RADAR_MESSAGES_PER_GUILD:        Env.schema.int({ positive: true }),
	MAX_ALERT_DESTINATIONS_PER_GUILD:    Env.schema.int({ positive: true }),
	MAX_FORECAST_DESTINATIONS_PER_GUILD: Env.schema.int({ positive: true }),
});
