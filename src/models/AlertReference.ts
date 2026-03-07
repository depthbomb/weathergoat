import { URLPath } from '@depthbomb/common';
import { ALERTS_SEARCH_BASE_URL } from '@constants';
import { Serializable, JSONProperty } from '@depthbomb/serde';

@Serializable()
export class AlertReference {
	@JSONProperty({ name: '@id' })
	public id!: string;

	@JSONProperty()
	public identifier!: string;

	@JSONProperty()
	public senderName!: string;

	@JSONProperty({
		deserializeTransform: (raw) => new Date(raw as string),
		serializeTransform: (d: Date) => d.toISOString(),
	})
	public sent!: Date;

	public get url() {
		return URLPath.from(ALERTS_SEARCH_BASE_URL).withQuery({ id: this.identifier }).toString();
	}
}
