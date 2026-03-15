import { Serializable, JSONProperty } from '@depthbomb/serde';

@Serializable()
export class Geocode {
	@JSONProperty({ isArray: true })
	public SAME!: string[];

	@JSONProperty({ isArray: true })
	public UGC!: string[];
}
