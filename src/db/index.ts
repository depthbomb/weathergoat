import { PrismaClient } from '@prisma/client';

// Extensions
import exists from './extensions/exists';
import radarChannelCountByGuild from './extensions/radar-channel-count-by-guild';
import alertDestinationCountByGuild from './extensions/alert-destination-count-by-guild';
import forecastDestinationCountByGuild from './extensions/forecast-destination-count-by-guild';

export const db = new PrismaClient()
	.$extends(exists)
	.$extends(radarChannelCountByGuild)
	.$extends(alertDestinationCountByGuild)
	.$extends(forecastDestinationCountByGuild);

export * from '@prisma/client';
