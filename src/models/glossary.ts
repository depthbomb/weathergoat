import { Type } from 'class-transformer';
import { GlossaryEntry } from '@models/glossary-entry';

export class Glossary {
	@Type(() => GlossaryEntry)
	public glossary!: GlossaryEntry[];
}
