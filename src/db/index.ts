import { PrismaClient } from './generated';

// Extensions
import exists from './extensions/exists';
import autoRadarCountByGuild from './extensions/auto-radar-count-by-guild';
import alertDestinationCountByGuild from './extensions/alert-destination-count-by-guild';
import forecastDestinationCountByGuild from './extensions/forecast-destination-count-by-guild';

export const db = new PrismaClient()
	.$extends(exists)
	.$extends(autoRadarCountByGuild)
	.$extends(alertDestinationCountByGuild)
	.$extends(forecastDestinationCountByGuild);

export * from './';
