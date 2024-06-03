import { Tokens } from '@tokens';
import { inject, singleton } from 'tsyringe';
import { plainToClass } from 'class-transformer';
import { AlertCollection } from '@models/alert-collection';
import type { HttpClient, HttpService } from '@services/http';

@singleton()
export class AlertsService {
	private readonly _http: HttpClient;

	public constructor(@inject(Tokens.Http) httpService: HttpService) {
		this._http = httpService.createClient({ baseUrl: 'https://api.weather.gov' });
	}

	public async getActiveAlerts() {
		const res = await this._http.get('/alerts/active');
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}

	public async getActiveAlertsForZone(zoneId: string, countyId?: string) {
		const ids = [zoneId];
		if (countyId) {
			ids.push(countyId);
		}

		const res = await this._http.get('/alerts/active', {
			query: {
				'zone[]': ids
			}
		});
		if (!res.ok) {
			throw new Error(res.statusText);
		}

		const json = await res.json();
		const data = plainToClass(AlertCollection, json);

		return data.alerts;
	}
}
