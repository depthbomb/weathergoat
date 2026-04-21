import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ASSETS_DIR } from '@constants';
import { Resvg } from '@resvg/resvg-js';
import { injectable } from '@needle-di/core';
import { AlertSeverity } from '@models/Alert';

export const enum BannerIcon {
	Alert,
	CloudSleet,
}

@injectable()
export class BannerService {
	private readonly templateSVG: string;

	public constructor() {
		const templatePath = join(ASSETS_DIR, 'images', 'banner-template.svg');

		this.templateSVG = readFileSync(templatePath, 'utf8');
	}

	public generateBanner(headline: string, subtitle: string, icon: BannerIcon = BannerIcon.Alert) {
		const svg = this.templateSVG
			.replace('%HEADLINE%', headline)
			.replace('%SUBTITLE%', subtitle)
			.replace('%ICON%', this.getIconSVG(icon));

		const resvg = new Resvg(svg, {
			font: {
				fontFiles: [
					join(ASSETS_DIR, 'fonts', 'Bungee-Regular.ttf'),
					join(ASSETS_DIR, 'fonts', 'MozillaText-Light.ttf'),
				],
				loadSystemFonts: false,
			}
		});

		const pngData = resvg.render();
		const pngBuf  = pngData.asPng();

		return pngBuf;
	}

	private getIconSVG(icon: BannerIcon) {
		switch (icon) {
			default:
			case BannerIcon.Alert:
				return '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 640 640" x="-18" y="-18"><path fill="#fff" d="M320 64C334.7 64 348.2 72.1 355.2 85L571.2 485C577.9 497.4 577.6 512.4 570.4 524.5C563.2 536.6 550.1 544 536 544L104 544C89.9 544 76.8 536.6 69.6 524.5C62.4 512.4 62.1 497.4 68.8 485L284.8 85C291.8 72.1 305.3 64 320 64zM320 416C302.3 416 288 430.3 288 448C288 465.7 302.3 480 320 480C337.7 480 352 465.7 352 448C352 430.3 337.7 416 320 416zM320 224C301.8 224 287.3 239.5 288.6 257.7L296 361.7C296.9 374.2 307.4 384 319.9 384C332.5 384 342.9 374.3 343.8 361.7L351.2 257.7C352.5 239.5 338.1 224 319.8 224z"/></svg>';
			case BannerIcon.CloudSleet:
				return '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 640 640" x="-18" y="-18"><path fill="#fff" d="M160 384C107 384 64 341 64 288C64 245.5 91.6 209.4 129.9 196.8C128.6 190.1 128 183.1 128 176C128 114.1 178.1 64 240 64C283.1 64 320.5 88.3 339.2 124C353.9 106.9 375.7 96 400 96C444.2 96 480 131.8 480 176C480 181.5 479.4 186.8 478.4 192C478.9 192 479.5 192 480 192C533 192 576 235 576 288C576 341 533 384 480 384L160 384zM240 432C253.3 432 264 442.7 264 456L264 472L280 472C293.3 472 304 482.7 304 496C304 509.3 293.3 520 280 520L264 520L264 536C264 549.3 253.3 560 240 560C226.7 560 216 549.3 216 536L216 520L200 520C186.7 520 176 509.3 176 496C176 482.7 186.7 472 200 472L216 472L216 456C216 442.7 226.7 432 240 432zM512 456L512 472L528 472C541.3 472 552 482.7 552 496C552 509.3 541.3 520 528 520L512 520L512 536C512 549.3 501.3 560 488 560C474.7 560 464 549.3 464 536L464 520L448 520C434.7 520 424 509.3 424 496C424 482.7 434.7 472 448 472L464 472L464 456C464 442.7 474.7 432 488 432C501.3 432 512 442.7 512 456zM150.8 463.6L118.8 559.6C114.6 572.2 101 579 88.4 574.8C75.8 570.6 69 557 73.2 544.4L105.2 448.4C109.4 435.8 123 429 135.6 433.2C148.2 437.4 155 451 150.8 463.6zM398.8 463.6L366.8 559.6C362.6 572.2 349 579 336.4 574.8C323.8 570.6 317 557 321.2 544.4L353.2 448.4C357.4 435.8 371 429 383.6 433.2C396.2 437.4 403 451 398.8 463.6z"/></svg>';
		}
	}

	private getGradientFromSeverity(severity: AlertSeverity): [number, string, string] {
		switch (severity) {
			default:
			case AlertSeverity.Unknown:
				return [0xad46ff, '#ad46ff', '#8200db'];
			case AlertSeverity.Minor:
				return [0xffb900, '#ffb900', '#e17100'];
			case AlertSeverity.Moderate:
				return [0xff8904, '#ff8904', '#f54900'];
			case AlertSeverity.Severe:
				return [0xfb2c36, '#fb2c36', '#c10007'];
			case AlertSeverity.Extreme:
				return [0x82181a, '#82181a', '#460809'];
		}
	}
}
