import '@abraham/reflection';
import { logger } from '@lib/logger';
import { Partials, GatewayIntentBits } from 'discord.js';
import { installSourceMapSupport } from '@swc-node/sourcemap-support';

installSourceMapSupport();

if (process.argv.length > 2) {
	const { runCli } = await import('@cli');
	await runCli();
} else {
	const { init, captureException } = await import('@sentry/node');

	if (process.env.SENTRY_DSN) {
		init({ dsn: process.env.SENTRY_DSN });
	}

	const { WeatherGoat } = await import('@lib/client');
	const wg = new WeatherGoat({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildWebhooks,
		],
		partials: [
			Partials.Message,
			Partials.Channel
		]
	});
	await wg.login(process.env.BOT_TOKEN);

	for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT'] as const) process.on(sig, async () => await wg.destroy());
	for (const err of ['uncaughtException', 'unhandledRejection'] as const) process.on(err, async (err) => {
		captureException(err);
		logger.error(err);
		await wg.destroy()
		process.exit(1);
	});
}
