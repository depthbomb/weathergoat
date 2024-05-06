export class RelativeLocation {
	public city!: string;
	public state!: string;
	public geometry!: string;

	public get cityState() {
		return `${this.city}, ${this.state}`;
	}
}
