import type { FieldOutputTypes } from './contract/contract';

export type ModelName                = keyof FieldOutputTypes['public'];
export type Row<M extends ModelName> = FieldOutputTypes['public'][M];
export type AlertDeliveryClaim       = Row<'AlertDeliveryClaim'>;
export type AlertDestination         = Row<'AlertDestination'>;
export type AutoRadarMessage         = Row<'AutoRadarMessage'>;
export type IncidentSeverity         = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus   = { ACTIVE: 'ACTIVE', RESOLVED: 'RESOLVED' } as const;
export const IncidentSeverity = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const;
