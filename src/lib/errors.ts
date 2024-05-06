import { MakeErrorClass } from 'fejl';

export type WeatherGoatError = InvalidPermissionsError;

export class InvalidPermissionsError extends MakeErrorClass('You do not have permission to perform this action') {}

export function isWeatherGoatError(err: unknown): err is WeatherGoatError {
	return err instanceof InvalidPermissionsError;
}
