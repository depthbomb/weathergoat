import { URLPath } from '@depthbomb/common';
import { Type, Expose } from 'class-transformer';
import { ALERTS_SEARCH_BASE_URL } from '@constants';

export class AlertReference {
	@Expose({ name: '@id' })
	public id!: string;
	public identifier!: string;
	public senderName!: string;
	@Type(() => Date)
	public sent!: Date;

	public get url() {
		return URLPath.from(ALERTS_SEARCH_BASE_URL).withQuery({ id: this.identifier });
	}
}
