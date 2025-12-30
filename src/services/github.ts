import { env } from '@env';
import { Octokit } from 'octokit';
import { injectable } from '@needle-di/core';
import { REPO_NAME, REPO_OWNER, BOT_USER_AGENT } from '@constants';

@injectable()
export class GithubService {
	private readonly octokit: Octokit;

	public constructor() {
		this.octokit = new Octokit({ auth: env.get('GITHUB_ACCESS_TOKEN'), userAgent: BOT_USER_AGENT });
	}

	/**
	 * Returns all or a subset of the project's commits.
	 *
	 * @param count The number of commits to return.
	 */
	public async getCommits(count?: number) {
		const res = await this._getAllCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		if (count) {
			return res.data.slice(0, count);
		}

		return res.data;
	}

	private async _getAllCommits() {
		return this.octokit!.request('GET /repos/{owner}/{repo}/commits', {
			owner: REPO_OWNER,
			repo: REPO_NAME
		});
	}
}
