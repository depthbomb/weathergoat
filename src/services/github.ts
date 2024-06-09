import { Octokit } from 'octokit';
import { logger } from '@lib/logger';
import { cacheService } from './cache';
import type { Maybe } from '#types';
import type { IService } from '@services';
import type { Endpoints } from '@octokit/types';

interface IGithubService extends IService {
	/**
	 * @internal
	 */
	[kCache]: ReturnType<typeof cacheService.createStore>;
	/**
	 * @internal
	 */
	[kRepoName]: Maybe<string>;
	/**
	 * @internal
	 */
	[kRepoOwner]: Maybe<string>;
	/**
	 * @internal
	 */
	[kOctokit]: Maybe<Octokit>;
	[kGetCommits](): Promise<Endpoints['GET /repos/{owner}/{repo}/commits']['response']>;
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

const kCache      = Symbol('cache');
const kRepoName   = Symbol('repo-name');
const kRepoOwner  = Symbol('repo-owner');
const kOctokit    = Symbol('octokit');
const kGetCommits = Symbol('get-commits-method');

export const githubService: IGithubService = ({
	name: 'com.services.github',

	[kCache]: cacheService.createStore('github', '10 minutes'),
	[kRepoName]: undefined,
	[kRepoOwner]: undefined,
	[kOctokit]: undefined,

	async [kGetCommits]() {
		return this[kOctokit]!.request('GET /repos/{owner}/{repo}/commits', {
			owner: this[kRepoOwner]!,
			repo: this[kRepoName]!
		});
	},

	init() {
		if (process.env.GITHUB_ACCESS_TOKEN) {
			if (!process.env.GITHUB_REPO) {
				throw new Error('Missing GITHUB_REPO environment variable');
			}

			const split      = process.env.GITHUB_REPO.split('/');
			this[kRepoOwner] = split[0];
			this[kRepoName]  = split[1];
			this[kOctokit]   = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: 'depthbomb/weathergoat' });
		} else {
			logger.warn('No GitHub access token has been configured; operations that use the GitHub API may not work.');
		}
	},

	async getCurrentCommitHash(short = false) {
		const cacheKey = 'commit-hash_' + short;
		if (this[kCache].has(cacheKey)) {
			return this[kCache].get<string>(cacheKey)!;
		}

		const res = await this[kGetCommits]();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		const { sha } = res.data[0];
		const hash    = short ? sha.slice(0, 7) : sha;

		this[kCache].set(cacheKey, hash);

		return hash;
	},
	async getCommits(count?: number) {
		const res = await this[kGetCommits]();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		if (count) {
			return res.data.slice(0, count)
		}

		return res.data;
	}
});
