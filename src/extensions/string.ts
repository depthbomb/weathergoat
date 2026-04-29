import {
	spoiler,
	codeBlock,
	hyperlink,
	inlineCode,
	channelLink,
	roleMention,
	userMention,
	channelMention
} from 'discord.js';

export default {}

declare global {
	interface String {
		capitalize(): string;
		toChannelLink(guildId?: string): string;
		toChannelMention(): string;
		toUserMention(): string;
		toRoleMention(): string;
		toHyperlink(url: string): string;
		toInlineCode(): `\`${string}\``;
		toCodeBlock<Language extends string>(language?: Language): string;
		toSpoiler(): string;
		bracketWrap(): `[${string}]`;
		toSlug(): string;
	}
}

String.prototype.capitalize = function() {
	return this.valueOf()[0].toUpperCase() + this.valueOf().slice(1);
};

String.prototype.toChannelLink = function(guildId?: string) {
	return channelLink(this.valueOf(), guildId ?? '@me');
};

String.prototype.toChannelMention = function() {
	return channelMention(this.valueOf());
};

String.prototype.toUserMention = function() {
	return userMention(this.valueOf());
};

String.prototype.toRoleMention = function() {
	return roleMention(this.valueOf());
};

String.prototype.toHyperlink = function(url) {
	return hyperlink(this.valueOf(), url);
};

String.prototype.toInlineCode = function() {
	return inlineCode(this.valueOf());
};

String.prototype.toCodeBlock = function(language) {
	return codeBlock(language ?? '', this.valueOf());
};

String.prototype.toSpoiler = function() {
	return spoiler(this.valueOf());
};

String.prototype.bracketWrap = function() {
	return `[${this.valueOf()}]` as const;
};

String.prototype.toSlug = function() {
	return this.valueOf()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
};

String.empty = function() {
	return '';
}
