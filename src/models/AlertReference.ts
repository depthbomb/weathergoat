import { Type } from 'class-transformer';

export class AlertReference {
	public '@id'!: string;
	public identifier!: string;
	public senderName!: string;
	@Type(() => Date)
	public sent!: Date;
}
