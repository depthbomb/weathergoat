import { ResettableValue } from './resettable-value';

export class ResettableString extends ResettableValue<string> {
	public constructor(value: string) {
		super(value);
	}
}
