const child = Bun.spawn([process.execPath, '--no-env-file', 'test', ...process.argv.slice(2)], {
	// Keep unit tests isolated from production credentials and local services.
	env: {
		PATH: process.env.PATH,
		SystemRoot: process.env.SystemRoot,
		TEMP: process.env.TEMP,
		MODE: 'development',
		DATABASE_URL: 'postgresql://127.0.0.1:1/unused',
		BOT_TOKEN: 'offline-test',
		BOT_OWNER_ID: '1',
		OWNER_PREFIX: '%',
		OWNER_EMAIL: 'tests@example.invalid',
		REDIS_URL: 'redis://127.0.0.1:1',
		REDIS_PREFIX: 'weathergoat_test',
		MAX_RADAR_MESSAGES_PER_GUILD: '1',
		MAX_ALERT_DESTINATIONS_PER_GUILD: '2',
		MAX_FORECAST_DESTINATIONS_PER_GUILD: '2',
	},
	stdout: 'inherit',
	stderr: 'inherit',
});
process.exitCode = await child.exited;
