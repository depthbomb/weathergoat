export type DomainDefinition = {
	id: string;
	name: string;
	description: string;
	enabled?: boolean;
};


export const enum DomainModuleKind {
	Jobs           = 'jobs',
	Events         = 'events',
	Commands       = 'commands',
	Components     = 'components',
	LegacyCommands = 'legacy-commands'
}
