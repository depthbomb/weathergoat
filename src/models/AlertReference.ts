import { URLPath } from '@depthbomb/common/url';
import { ALERTS_SEARCH_BASE_URL } from '@constants';
import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class AlertReference {
	@JSONProperty({ name: '@id' })
	public id!: string;

	@JSONProperty()
	public identifier!: string;

	@JSONProperty()
	public senderName!: string;

	@JSONProperty({ type: Date })
	public sent!: Date;

	public get url() {
		return URLPath.from(ALERTS_SEARCH_BASE_URL).withQuery({ id: this.identifier }).toString();
	}
}
