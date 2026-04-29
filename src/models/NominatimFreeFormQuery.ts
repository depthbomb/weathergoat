import { JSONProperty, Serializable } from '@depthbomb/serde';

@Serializable()
export class Address {
	@JSONProperty({ name: 'postcode' })
	public postCode?: string;

	@JSONProperty()
	public city?: string;

	@JSONProperty()
	public town?: string;

	@JSONProperty()
	public county!: string;

	@JSONProperty()
	public state!: string;

	@JSONProperty({ name: 'ISO3166-2-lvl4' })
	public iso3166SubdivisionLevel4!: string;

	@JSONProperty()
	public country!: string;

	@JSONProperty({ name: 'country_code' })
	public countryCode!: string;
}

@Serializable()
export class NominatimFreeFormQuery {
	@JSONProperty({ name: 'place_id' })
	public placeID!: number;

	@JSONProperty({ name: 'licence' })
	public license!: string;

	@JSONProperty({ name: 'lat' })
	public latitude!: string;

	@JSONProperty({ name: 'lon' })
	public longitude!: string;

	@JSONProperty()
	public category!: string;

	@JSONProperty({ name: 'place_rank' })
	public placeRank!: number;

	@JSONProperty()
	public importance!: number;

	@JSONProperty({ name: 'addresstype' })
	public addressType!: string;

	@JSONProperty()
	public name!: string;

	@JSONProperty({ name: 'display_name' })
	public displayName!: string;

	@JSONProperty({ type: () => Address })
	public address!: Address;
}
