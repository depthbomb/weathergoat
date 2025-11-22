import { env } from '@env';
import { Octokit } from 'octokit';
import { CacheService } from './cache';
import { inject, injectable } from '@needle-di/core';
import { REPO_NAME, REPO_OWNER, BOT_USER_AGENT } from '@constants';
import type { CacheStore } from './cache';

@injectable()
export class GithubService {
	private readonly octokit: Octokit;
	private readonly store: CacheStore;

	public constructor(
		private readonly cache = inject(CacheService)
	) {
		this.store   = this.cache.getStore('github', { defaultTtl: '10 minutes' });
		this.octokit = new Octokit({ auth: env.get('GITHUB_ACCESS_TOKEN'), userAgent: BOT_USER_AGENT });
	}

	/**
	 * Returns the SHA hash of the project's latest commit.
	 *
	 * @param short Whether to return the hash in a shortened format.
	 */
	public async getCurrentCommitHash() {
		const cacheKey = 'commit-hash';
		if (this.store.has(cacheKey)) {
			return this.store.get<string>(cacheKey)!;
		}

		let hash: string;

		const hasGit = Bun.which('git') !== null;
		if (hasGit) {
			console.log('using git command to retrieve commit');
			hash = (await Bun.$`git rev-parse HEAD`.text()).trim();
		} else {
			const res = await this._getAllCommits();
			if (!res) {
				throw new Error('Could not retrieve project commits from GitHub API');
			}

			const { sha } = res.data[0];

			hash = sha;
		}

		this.store.set(cacheKey, hash);

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
