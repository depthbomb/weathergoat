export type DomainDefinition = {
	id: string;
	name: string;
	description: string;
	enabled?: boolean;
};


export const enum DomainModuleKind {
	Jobs = 'jobs',
	Events = 'events',
	Controllers = 'controllers',
	Components = 'components'
}
