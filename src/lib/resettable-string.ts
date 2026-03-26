import { ResettableValue } from '@depthbomb/common/state';

export class ResettableString extends ResettableValue<string> {
	public constructor(value: string) {
		super(value);
	}
}
