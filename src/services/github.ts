import { env } from '@env';
import { Octokit } from 'octokit';
import { RedisService } from './redis';
import { inject, injectable } from '@needle-di/core';
import { REPO_NAME, REPO_OWNER, BOT_USER_AGENT } from '@constants';

@injectable()
export class GithubService {
	private readonly octokit: Octokit;

	public constructor(
		private readonly redis = inject(RedisService)
	) {
		this.octokit = new Octokit({ auth: env.get('GITHUB_ACCESS_TOKEN'), userAgent: BOT_USER_AGENT });
	}

	/**
	 * Returns the SHA hash of the project's latest commit.
	 *
	 * @param short Whether to return the hash in a shortened format.
	 */
	public async getCurrentCommitHash() {
		const cacheKey = 'commit-hash';
		const cached   = await this.redis.get(cacheKey);
		if (cached) {
			return cached;
		}

		let hash: string;

		const hasGit = Bun.which('git') !== null;
		if (hasGit) {
			hash = (await Bun.$`git rev-parse HEAD`.text()).trim();
		} else {
			const res = await this._getAllCommits();
			if (!res) {
				throw new Error('Could not retrieve project commits from GitHub API');
			}

			const { sha } = res.data[0];

			hash = sha;
		}

		await this.redis.set(cacheKey, hash, '1m');

		return hash;
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
