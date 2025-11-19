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
		if (!process.env.GITHUB_ACCESS_TOKEN) {
			throw new Error('Missing GITHUB_ACCESS_TOKEN environment variable');
		}

		this.store   = this.cache.getStore('github', { defaultTtl: '10 minutes' });
		this.octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: BOT_USER_AGENT });
	}

	/**
	 * Returns the SHA hash of the project's latest commit.
	 *
	 * @param short Whether to return the hash in a shortened format.
	 */
	public async getCurrentCommitHash(short?: boolean) {
		const cacheKey = 'commit-hash_' + short;
		if (this.store.has(cacheKey)) {
			return this.store.get<string>(cacheKey)!;
		}

		const res = await this._getAllCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		const { sha } = res.data[0];
		const hash = short ? sha.slice(0, 7) : sha;

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
