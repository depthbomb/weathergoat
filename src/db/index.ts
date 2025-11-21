import { env } from '@env';
import { PrismaClient } from './generated/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// Extensions
import exists from './extensions/exists';
import autoRadarCountByGuild from './extensions/auto-radar-count-by-guild';
import alertDestinationCountByGuild from './extensions/alert-destination-count-by-guild';
import forecastDestinationCountByGuild from './extensions/forecast-destination-count-by-guild';

const adapter = new PrismaLibSql({ url: env.get('DATABASE_URL') });

export const db = new PrismaClient({ adapter })
	.$extends(exists)
	.$extends(autoRadarCountByGuild)
	.$extends(alertDestinationCountByGuild)
	.$extends(forecastDestinationCountByGuild);

export * from './';
