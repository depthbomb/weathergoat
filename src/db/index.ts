import { PrismaClient } from '@prisma/client';

// Extensions
import exists from './extensions/exists';
import radarChannelCountByGuild from './extensions/radarChannelCountByGuild';
import alertDestinationCountByGuild from './extensions/alertDestinationCountByGuild';
import forecastDestinationCountByGuild from './extensions/forecastDestinationCountByGuild';

export const db = new PrismaClient()
	.$extends(exists)
	.$extends(radarChannelCountByGuild)
	.$extends(alertDestinationCountByGuild)
	.$extends(forecastDestinationCountByGuild);

export * from '@prisma/client';
