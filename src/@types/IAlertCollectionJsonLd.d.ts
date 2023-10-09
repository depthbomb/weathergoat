import type { IAlert } from './IAlert';

export interface IAlertCollectionJsonLd {
	title:    string;
	updated:  Date;
	'@graph': IAlert[];
}
