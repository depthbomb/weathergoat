import { Color } from '@constants';
import { time, EmbedBuilder, TimestampStyles } from 'discord.js';
import type { EarthquakeEvent } from '@models/Earthquake';

export type EarthquakePresentationOptions = {
	distanceKm?: number;
	stillEligible?: boolean;
	revisionNotice?: boolean;
};

const USGS_ATTRIBUTION = 'Source: U.S. Geological Survey (USGS)';

function truncate(value: string, maximum: number) {
	return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function formatNumber(value: number, maximumFractionDigits = 1) {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

export function buildEarthquakeEmbed(event: EarthquakeEvent, options: EarthquakePresentationOptions = {}) {
	const magnitude = event.magnitude === null
		? 'Unknown magnitude'
		: `M${formatNumber(event.magnitude)}${event.magnitudeType ? ` ${event.magnitudeType}` : ''}`;
	const review = event.reviewStatus === 'reviewed'
		? 'Reviewed USGS solution'
		: event.reviewStatus === 'automatic'
			? 'Automatic USGS solution — preliminary and subject to revision'
			: `USGS status: ${event.sourceStatus ?? event.reviewStatus}`;
	const fields = [
		{ name: 'Occurred', value: `${time(event.occurredAt, TimestampStyles.LongDateTime)} (${time(event.occurredAt, TimestampStyles.RelativeTime)})`, inline: false },
		{ name: 'Depth', value: `${formatNumber(event.coordinates.depthKm)} km`, inline: true },
		{ name: 'Coordinates', value: `${formatNumber(event.coordinates.latitude, 3)}, ${formatNumber(event.coordinates.longitude, 3)}`, inline: true },
		{ name: 'Last USGS update', value: time(event.updatedAt, TimestampStyles.LongDateTime), inline: false },
		{ name: 'Review state', value: review, inline: false }
	];

	if (options.distanceKm !== undefined) {
		fields.splice(2, 0, { name: 'Distance', value: `${formatNumber(options.distanceKm)} km`, inline: true });
	}

	if (event.significance !== null) {
		fields.push({ name: 'Significance', value: String(event.significance), inline: true });
	}

	if (event.feltReports !== null) {
		fields.push({ name: 'Felt reports', value: formatNumber(event.feltReports, 0), inline: true });
	}

	if (event.tsunamiFlag) {
		fields.push({
			name: 'Tsunami metadata',
			value: 'USGS flagged this event for tsunami-related review. This is not a tsunami warning; follow official warning centers.',
			inline: false
		});
	}

	if (options.stillEligible === false) {
		fields.unshift({
			name: 'Subscription update',
			value: 'This revised solution no longer meets the subscription criteria. The existing message was updated to preserve the event history.',
			inline: false
		});
	}

	const title = truncate(`${magnitude} — ${event.place ?? 'Location unavailable'}`, 256);
	const embed = new EmbedBuilder()
		.setColor(options.stillEligible === false ? Color.Warning : Color.Primary)
		.setTitle(title)
		.setDescription(options.revisionNotice ? 'USGS revised this earthquake solution.' : 'Post-detection catalog information; not earthquake prediction or early warning.')
		.addFields(fields.slice(0, 25))
		.setFooter({ text: `${USGS_ATTRIBUTION} • Event ${truncate(event.id, 100)}` })
		.setTimestamp(event.updatedAt);

	if (event.url) {
		embed.setURL(event.url);
	}

	return embed;
}

export function buildEarthquakeListEmbeds(events: EarthquakeEvent[], distances?: Map<string, number>) {
	return events.slice(0, 10).map(event => buildEarthquakeEmbed(event, {
		distanceKm: distances?.get(event.id)
	}));
}
