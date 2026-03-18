export class ResettableValue<T> {
	public value: T;
	readonly #initialValue: T;

	public constructor(value: T) {
		this.value         = value;
		this.#initialValue = value;
	}

	public set(value: T) {
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
