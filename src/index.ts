import '@abraham/reflection';
import { captureError } from '@lib/errors';
import { Partials, GatewayIntentBits } from 'discord.js';
import { installSourceMapSupport } from '@swc-node/sourcemap-support';

installSourceMapSupport();

if (process.argv.length > 2) {
	const { runCli } = await import('@cli');
	await runCli();
} else {
	if (process.env.SENTRY_DSN) {
		const { init } = await import('@sentry/bun');

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

	for (const sig of ['SIGINT', 'SIGHUP', 'SIGTERM', 'SIGQUIT']) process.on(sig, async () => await wg.destroy());
	for (const err of ['uncaughtException', 'unhandledRejection']) process.on(err, async (err) => {
		captureError('Unhandled error', err);
		await wg.destroy()
		process.exit(1);
	});
}
