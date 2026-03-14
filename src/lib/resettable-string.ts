export class ResettableString {
	public value: string;
	readonly #initialValue: string;

	public constructor(value: string) {
		this.value        = value;
		this.#initialValue = value;
	}

	public set(value: string) {
		this.value = value;
	}

	public reset() {
		this.value = this.#initialValue;
	}

	public valueOf() {
		return this.value;
	}

	public toString() {
		return String(this.value);
	}
}
