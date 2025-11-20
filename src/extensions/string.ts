import { spoiler, codeBlock, hyperlink, userMention, roleMention, channelLink, channelMention } from 'discord.js';

export default {}

declare global {
	interface String {
		capitalize(): string;
		toChannelLink(guildId?: string): string;
		toChannelMention(): string;
		toUserMention(): string;
		toRoleMention(): string;
		toHyperlink(url: string): string;
		toCodeBlock<Language extends string>(language: Language): string;
		toSpoiler(): string;
		bracketWrap(): `[${string}]`;
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

String.prototype.toCodeBlock = function(language) {
	return codeBlock(this.valueOf(), language);
};

String.prototype.toSpoiler = function() {
	return spoiler(this.valueOf());
};

String.prototype.bracketWrap = function() {
	return `[${this.valueOf()}]` as const;
};
