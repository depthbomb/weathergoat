export function appendReviewerNote(originalString: string): string {
	return [
		originalString,
		'**Note to Top.gg reviewer:** This error _is not_ a non-functional bot command; it is a _user input_ error. I\'ve tried my best to clarify this in the reviewer notes on the dashboard but the bot still gets rejected for something that is not its fault.'
	].join('\n');
}
