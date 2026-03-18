import { ResettableValue } from './resettable-value';

export class Flag extends ResettableValue<boolean> {
	public constructor(value: boolean = false) {
		super(value);
	}

	public get isTrue() {
		return this.value === true;
	}

	public get isFalse() {
		return !this.isTrue;
	}

	public set(value: boolean) {
		super.set(value);
	}

	public setTrue() {
		this.value = true;
	}

	public setFalse() {
		this.value = false;
	}

	public toggle() {
		this.value = !this.value;
	}

}
