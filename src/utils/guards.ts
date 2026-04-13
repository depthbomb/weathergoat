import type { Team, User } from 'discord.js';
import type { Nullable } from '@depthbomb/common/typing';

export function isTeamOwner(value: Nullable<User | Team>): value is Team {
	return value !== null && Object.hasOwn(value, 'members');
}
