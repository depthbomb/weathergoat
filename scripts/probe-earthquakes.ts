import '@extensions/string';
import { dirname, resolve } from 'node:path';
import { HTTPService } from '@services/http';
import { RedisService } from '@services/redis';
import { mkdir, appendFile } from 'node:fs/promises';
import { RedisLeaseService } from '@services/redis-lease';
import { EarthquakeService, earthquakeDistanceKm } from '@services/earthquakes';
import { isEarthquakeEligible, determineDeliveryAction } from '@domain/earthquakes/delivery-policy';

type ProbeOptions = {
	durationHours: number;
	cadenceSeconds: number;
	output?: string;
};

function readNumberArgument(name: string, fallback: number) {
	const prefix = `--${name}=`;
	const value = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new RangeError(`${name} must be a positive number.`);
	}

	return parsed;
}

function parseOptions(): ProbeOptions {
	const durationHours = readNumberArgument('duration-hours', 24);
	const cadenceSeconds = readNumberArgument('cadence-seconds', 65);
	if (cadenceSeconds < 60) {
		throw new RangeError('cadence-seconds must be at least the documented 60-second USGS feed cadence.');
	}

	const outputArg = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length);

	return {
		durationHours,
		cadenceSeconds,
		output: outputArg ? resolve(outputArg) : undefined
	};
}

async function writeObservation(output: string | undefined, observation: Record<string, unknown>) {
	const line = JSON.stringify(observation);
	console.log(line);

	if (output) {
		await mkdir(dirname(output), { recursive: true });
		await appendFile(output, `${line}\n`, 'utf8');
	}
}

const options = parseOptions();
const http = new HTTPService();
const earthquakes = new EarthquakeService(http);
const redis = new RedisService();
const leases = new RedisLeaseService(redis);
const startedAt = Date.now();
const endsAt = startedAt + options.durationHours * 60 * 60_000;
const revisions = new Map<string, number>();
const deliveries = new Map<string, number>();
const probeLocation = { latitude: 41.8781, longitude: -87.6298, depthKm: 0 };
const probeCriteria = { minimumMagnitude: 2.5, radiusKm: 2_000 };

let lastModified: string | undefined;
let baselined = false;
let requests = 0;
let notModified = 0;
let parsedEvents = 0;
let revisedEvents = 0;
let parseFailures = 0;
let retryFailures = 0;
let leaseRenewals = 0;
let leaseFailures = 0;
let candidateCreates = 0;
let candidateEdits = 0;
let duplicateCreates = 0;

const lease = await Promise.race([
	leases.acquire('leases:earthquake-probe', 120_000),
	Bun.sleep(5_000).then(() => {
		throw new Error('Timed out acquiring the publication-disabled probe lease from Redis.');
	})
]).catch(error => {
	redis.close();
	throw error;
});
if (!lease) {
	throw new Error('Another publication-disabled earthquake probe already owns the Redis lease.');
}

await writeObservation(options.output, {
	type: 'start',
	startedAt: new Date(startedAt).toISOString(),
	durationHours: options.durationHours,
	cadenceSeconds: options.cadenceSeconds,
	publicationEnabled: false,
	leaseKey: 'leases:earthquake-probe',
	probeCriteria,
	probeLocation,
	endpoint: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
});

try {
	while (Date.now() < endsAt) {
		const requestStartedAt = performance.now();
		requests++;

		try {
			if (requests > 1) {
				await lease.renew();
				leaseRenewals++;
			}

			const result = await earthquakes.getAllDayFeedResult({ lastModified });
			lastModified = result.validators.lastModified ?? lastModified;
			if (result.notModified) {
				notModified++;
				await writeObservation(options.output, {
					type: 'request',
					at: new Date().toISOString(),
					request: requests,
					status: 304,
					latencyMs: Math.round(performance.now() - requestStartedAt),
					memoryBytes: process.memoryUsage().rss,
					lastModified
				});
			} else {
				let changed = 0;
				for (const event of result.collection.events) {
					const revision = event.updatedAt.getTime();
					const previous = revisions.get(event.id);
					const deliveredRevision = deliveries.get(event.id);
					const distanceKm = earthquakeDistanceKm(probeLocation, event.coordinates);
					const eligible = isEarthquakeEligible(
						{ magnitude: event.magnitude, distanceKm },
						probeCriteria
					);
					const action = determineDeliveryAction({
						hasDelivery: deliveredRevision !== undefined,
						isBaseline: !baselined,
						isEligible: eligible,
						sourceUpdatedAt: event.updatedAt,
						deliveredRevisionAt: deliveredRevision === undefined ? null : new Date(deliveredRevision)
					});
					if (action === 'create') {
						if (deliveries.has(event.id)) {
							duplicateCreates++;
						}

						candidateCreates++;
						deliveries.set(event.id, revision);
					} else if (action === 'edit') {
						candidateEdits++;
						deliveries.set(event.id, revision);
					}
					if (previous !== undefined && revision > previous) {
						changed++;
						revisedEvents++;
					}

					revisions.set(event.id, Math.max(revision, previous ?? 0));
				}

				baselined = true;
				parsedEvents += result.collection.events.length;
				await writeObservation(options.output, {
					type: 'request',
					at: new Date().toISOString(),
					request: requests,
					status: 200,
					latencyMs: Math.round(performance.now() - requestStartedAt),
					memoryBytes: process.memoryUsage().rss,
					generatedAt: result.collection.generatedAt.toISOString(),
					events: result.collection.events.length,
					revisions: changed,
					uniqueEvents: revisions.size,
					candidateCreates,
					candidateEdits,
					duplicateCreates,
					lastModified
				});
			}
		} catch (error) {
			parseFailures++;
			retryFailures++;
			if (!lease.held) {
				leaseFailures++;
			}

			await writeObservation(options.output, {
				type: 'failure',
				at: new Date().toISOString(),
				request: requests,
				latencyMs: Math.round(performance.now() - requestStartedAt),
				name: error instanceof Error ? error.name : 'UnknownError',
				message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
			});
			if (!lease.held) {
				break;
			}
		}

		const remainingMs = endsAt - Date.now();
		if (remainingMs > 0) {
			await Bun.sleep(Math.min(options.cadenceSeconds * 1_000, remainingMs));
		}
	}
} finally {
	if (lease.held) {
		await lease.release();
	}

	redis.close();
}

await writeObservation(options.output, {
	type: 'summary',
	startedAt: new Date(startedAt).toISOString(),
	endedAt: new Date().toISOString(),
	requests,
	notModified,
	parsedEvents,
	uniqueEvents: revisions.size,
	revisedEvents,
	candidateCreates,
	candidateEdits,
	duplicateCreates,
	parseFailures,
	retryFailures,
	leaseRenewals,
	leaseFailures,
	publicationEnabled: false,
	memoryBytes: process.memoryUsage().rss
});
