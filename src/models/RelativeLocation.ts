import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class RelativeLocation {
	@JSONProperty()
	public city!: string;

	@JSONProperty()
	public state!: string;

	@JSONProperty()
	public geometry!: string;

	public get cityState() {
		return `${this.city}, ${this.state}`;
	}
}
