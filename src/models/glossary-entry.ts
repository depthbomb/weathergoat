import { Expose } from 'class-transformer';

export class GlossaryEntry {
	// For some reason, there is a glossary entry that has both a null `term` and `definition`
	// value. Because of this, we'll encourage the usage of the model's getters.

	@Expose({ name: 'term' })
	public originalTerm?: string;
	@Expose({ name: 'definition' })
	public originalDefinition?: string;

	private _anchorTagPattern = /<a\s+href=["'](.+?)["']\s*>(.*?)<\/a>/g;

	/**
	 * Returns a "cleaned" version of the definition that can be used in Discord messages.
	 * This should be preferred over {@link originalDefinition}.
	 */
	public get cleanedDefinition(): string {
		return this.originalDefinition!
			.replaceAll('<br>', '')
			.replaceAll(/\s{2,}/g, ' ')
			.replaceAll(/<a\s+href=["'](.+?)["']\s*>(.*?)<\/a>/g, (_, href, text) => `[${text}](${href})`);
	}
}
