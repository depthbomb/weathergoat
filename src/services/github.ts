import { Octokit } from 'octokit';
import { Tokens } from '@container';
import { logger } from '@lib/logger';
import type { Maybe } from '#types';
import type { IService } from '@services';
import type { Container } from '@container';
import type { Endpoints } from '@octokit/types';
import type { CacheStore, ICacheService } from './cache';

export interface IGithubService extends IService {
	/**
	 * Returns the SHA hash of the project's latest commit.
	 * @param short Whether to return the hash in a shortened format.
	 */
	getCurrentCommitHash(short?: boolean): Promise<string>;
	/**
	 * Returns all or a subset of the project's commits.
	 * @param count The number of commits to return.
	 */
	getCommits(count?: number): Promise<Endpoints['GET /repos/{owner}/{repo}/commits']['response']['data']>;
}

export default class GithubService implements IGithubService {
	private _repoOwner: Maybe<string>;
	private _repoName: Maybe<string>;
	private _octokit: Maybe<Octokit>;

	private readonly _cache: CacheStore;

	public constructor(container: Container) {
		const cacheService = container.resolve<ICacheService>(Tokens.Cache);

		this._cache = cacheService.createStore('github', '10 minutes');

		if (process.env.GITHUB_ACCESS_TOKEN) {
			if (!process.env.GITHUB_REPO) {
				throw new Error('Missing GITHUB_REPO environment variable');
			}

			const split = process.env.GITHUB_REPO.split('/');
			this._repoOwner = split[0];
			this._repoName = split[1];
			this._octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: 'depthbomb/weathergoat' });
		} else {
			logger.warn('No GitHub access token has been configured; operations that use the GitHub API may not work.');
		}
	}

	public async getCurrentCommitHash(short?: boolean) {
		const cacheKey = 'commit-hash_' + short;
		if (this._cache.has(cacheKey)) {
			return this._cache.get<string>(cacheKey)!;
		}

		const res = await this._getAllCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		const { sha } = res.data[0];
		const hash    = short ? sha.slice(0, 7) : sha;

		this._cache.set(cacheKey, hash);

		return hash;
	}

	public async getCommits(count?: number) {
		const res = await this._getAllCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		if (count) {
			return res.data.slice(0, count)
		}

		return res.data;
	}

	private async _getAllCommits() {
		return this._octokit!.request('GET /repos/{owner}/{repo}/commits', {
			owner: this._repoOwner!,
			repo: this._repoName!
		});
	}
}
