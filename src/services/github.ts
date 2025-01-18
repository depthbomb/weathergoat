import { Octokit } from 'octokit';
import { container } from '@container';
import { REPO_NAME, REPO_OWNER, BOT_USER_AGENT } from '@constants';
import type { IService } from '@services';
import type { Endpoints } from '@octokit/types';
import type { CacheStore, ICacheService } from './cache';

export interface IGithubService extends IService {
	/**
	 * Returns the SHA hash of the project's latest commit.
	 *
	 * @param short Whether to return the hash in a shortened format.
	 */
	getCurrentCommitHash(short?: boolean): Promise<string>;
	/**
	 * Returns all or a subset of the project's commits.
	 *
	 * @param count The number of commits to return.
	 */
	getCommits(count?: number): Promise<Endpoints['GET /repos/{owner}/{repo}/commits']['response']['data']>;
}

export default class GithubService implements IGithubService {
	private readonly _octokit: Octokit;
	private readonly _cache: CacheStore;

	public constructor() {
		if (!process.env.GITHUB_ACCESS_TOKEN) {
			throw new Error('Missing GITHUB_ACCESS_TOKEN environment variable');
		}

		this._cache   = container.resolve('Cache').createStore('github', '10 minutes');
		this._octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: BOT_USER_AGENT });
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
		const hash = short ? sha.slice(0, 7) : sha;

		this._cache.set(cacheKey, hash);

		return hash;
	}

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
		return this._octokit!.request('GET /repos/{owner}/{repo}/commits', {
			owner: REPO_OWNER,
			repo: REPO_NAME
		});
	}
}
