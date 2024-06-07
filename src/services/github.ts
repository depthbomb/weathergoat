import { Tokens } from '@tokens';
import { Octokit } from 'octokit';
import { logger } from '@lib/logger';
import { inject, singleton } from 'tsyringe';
import type { CacheStore, CacheService } from './cache';

@singleton()
export class GithubService {
	private readonly _repoOwner?: string;
	private readonly _repoName?: string;
	private readonly _cache: CacheStore;
	private readonly _octokit?: Octokit;

	public constructor(@inject(Tokens.Cache) cacheService: CacheService) {
		this._cache = cacheService.createStore('git', '1 hour');

		if (process.env.GITHUB_ACCESS_TOKEN) {
			if (!process.env.GITHUB_REPO) {
				throw new Error('Missing GITHUB_REPO environment variable');
			}

			const split = process.env.GITHUB_REPO.split('/');
			this._repoOwner = split[0];
			this._repoName  = split[1];

			this._octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: 'depthbomb/weathergoat' });
		} else {
			logger.warn('No GitHub access token has been configured; operations that use the GitHub API may not work.');
		}
	}

	public async getCurrentCommitHash(short = false) {
		const cacheKey = 'commit-hash_' + short;
		if (this._cache.has(cacheKey)) {
			return this._cache.get<string>(cacheKey)!;
		}

		const res = await this._getCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		const { sha } = res.data[0];
		const hash    = short ? sha.slice(0, 7) : sha;

		this._cache.set(cacheKey, hash);

		return hash;
	}

	public async getCommits(count?: number) {
		const res = await this._getCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		if (count) {
			return res.data.slice(0, count)
		}

		return res.data;
	}

	private async _getCommits() {
		return this._octokit!.request('GET /repos/{owner}/{repo}/commits', { owner: this._repoOwner!, repo: this._repoName! });
	}
}
