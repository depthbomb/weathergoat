import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'node:crypto';
import { injectable } from '@needle-di/core';
import { Alert, AlertSeverity } from '@models/Alert';
import { Path } from '@depthbomb/node-common/pathlib';
import { ICONS, DATA_DIR, ASSETS_DIR, ALERT_SEVERITY_COLORS } from '@constants';

const EXACT_EVENT_ICON_MAP = {
	'Tornado Warning': ICONS.Tornado,
	'Tornado Watch': ICONS.Tornado,
	'Severe Thunderstorm Warning': ICONS.CloudBolt,
	'Severe Thunderstorm Watch': ICONS.CloudBolt,
	'Flash Flood Warning': ICONS.HouseFloodWater,
	'Flood Warning': ICONS.HouseFloodWater,
	'Flood Advisory': ICONS.HouseFloodWater,
	'Blizzard Warning': ICONS.Snowflake,
	'Winter Storm Warning': ICONS.Snowflake,
	'Winter Weather Advisory': ICONS.Snowflake,
	'Excessive Heat Warning': ICONS.TemperatureArrowUp,
	'Heat Advisory': ICONS.TemperatureArrowUp,
	'Extreme Cold Warning': ICONS.TemperatureArrowDown,
	'Freeze Warning': ICONS.TemperatureArrowDown,
	'Frost Advisory': ICONS.TemperatureArrowDown,
	'High Wind Warning': ICONS.Windsock,
	'Wind Advisory': ICONS.Windsock,
	'Dense Fog Advisory': ICONS.CloudFog,
	'Red Flag Warning': ICONS.Fire,
	'Fire Weather Watch': ICONS.Fire,
	'Air Quality Alert': ICONS.Smog,
	'Small Craft Advisory': ICONS.Sailboat,
	'High Surf Advisory': ICONS.Wave,
	'Rip Current Statement': ICONS.PersonSwimming
} as Record<string, string>;

const EVENT_ICON_REGEX = [
	[/tornado/i, ICONS.Tornado],
	[/hurricane|tropical/i, ICONS.Hurricane],
	[/thunderstorm|lightning/i, ICONS.CloudBolt],
	[/flood/i, ICONS.HouseFloodWater],
	[/snow|blizzard|winter/i, ICONS.Snowflake],
	[/ice|freeze|freezing/i, ICONS.Icicles],
	[/wind/i, ICONS.Windsock],
	[/heat/i, ICONS.TemperatureArrowUp],
	[/cold|frost/i, ICONS.TemperatureArrowDown],
	[/fog/i, ICONS.CloudFog],
	[/fire|red flag/i, ICONS.Fire],
	[/air|smoke/i, ICONS.Smog],
] as const;

@injectable()
export class BannerService {
	private readonly templateSVG: string;
	private readonly cacheDir: Path;
	private readonly renderCache = new Map<string, Promise<Buffer>>();

	public constructor() {
		const templatePath = join(ASSETS_DIR, 'images', 'banner-template.svg');

		this.templateSVG = readFileSync(templatePath, 'utf8');
		this.cacheDir    = Path.from(DATA_DIR, 'banners');

		this.cacheDir.mkdirSync({ recursive: true });
	}

	public async generateBanner(alert: Alert): Promise<Buffer> {
		const cacheKey = this.createCacheKey(alert.event, alert.severity);

		if (!this.renderCache.has(cacheKey)) {
			this.renderCache.set(cacheKey, this.renderBanner(alert, cacheKey));
		}

		return this.renderCache.get(cacheKey)!;
	}

	private async renderBanner(alert: Alert, cacheKey: string) {
		const headline = alert.event;
		const severity = alert.severity;
		const icon     = this.resolveAlertIcon(headline);

		const cachePath = this.cacheDir.joinpath(`${cacheKey}.png`);

		const exists = await cachePath.exists();
		if (exists) {
			return cachePath.readBytes();
		}

		const [color1, color2] = this.getAlertSeverityColors(severity);

		const svg = this.templateSVG
			.replace('%COLOR1%', color1)
			.replace('%COLOR2%', color2)
			.replace('%HEADLINE%', this.escapeXml(headline))
			.replace('%SUBTITLE%', this.escapeXml(severity))
			.replace('%ICON%', icon);

		const resvg = new Resvg(svg, {
			font: {
				fontFiles: [
					join(ASSETS_DIR, 'fonts', 'Bungee-Regular.ttf'),
					join(ASSETS_DIR, 'fonts', 'MozillaText-Light.ttf'),
				],
				loadSystemFonts: false,
			},
		});

		const pngBuf = resvg.render().asPng();

		const tmpPath = this.cacheDir.joinpath(`${cacheKey}.tmp`);
		await tmpPath.writeBytes(pngBuf);
		await tmpPath.rename(cachePath);

		return pngBuf;
	}

	private createCacheKey(headline: string, severity: AlertSeverity) {
		return createHash('sha256')
			.update(JSON.stringify({ headline, severity }))
			.digest('base64url');
	}

	private resolveAlertIcon(event: string): string {
		const exact = EXACT_EVENT_ICON_MAP[event];
		if (exact) {
			return exact;
		}

		for (const [regex, icon] of EVENT_ICON_REGEX) {
			if (regex.test(event)) {
				return icon;
			}
		}

		return ICONS.Alert;
	}

	private getAlertSeverityColors(severity: AlertSeverity) {
		const [,color1, color2] = ALERT_SEVERITY_COLORS[severity] ?? ALERT_SEVERITY_COLORS.Unknown;
		return [color1, color2];
	}

	private escapeXml(str: string) {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}
}
