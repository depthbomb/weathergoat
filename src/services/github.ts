import { Octokit } from 'octokit';
import { logger } from '@lib/logger';
import { cacheService } from './cache';
import { defineService } from '@services';
import type { Maybe } from '#types';
import type { Endpoints } from '@octokit/types';

interface IGithubService {
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

export const githubService = defineService<IGithubService>('GitHub', () => {
	const cache = cacheService.createStore('github', '10 minutes');

	let repoOwner: Maybe<string>;
	let repoName: Maybe<string>;
	let octokit: Maybe<Octokit>;

	if (process.env.GITHUB_ACCESS_TOKEN) {
		if (!process.env.GITHUB_REPO) {
			throw new Error('Missing GITHUB_REPO environment variable');
		}

		const split = process.env.GITHUB_REPO.split('/');
		repoOwner   = split[0];
		repoName    = split[1];
		octokit     = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN, userAgent: 'depthbomb/weathergoat' });
	} else {
		logger.warn('No GitHub access token has been configured; operations that use the GitHub API may not work.');
	}

	async function _getCommits() {
		return octokit!.request('GET /repos/{owner}/{repo}/commits', { owner: repoOwner!, repo: repoName! });
	}

	async function getCurrentCommitHash(short = false) {
		const cacheKey = 'commit-hash_' + short;
		if (cache.has(cacheKey)) {
			return cache.get<string>(cacheKey)!;
		}

		const res = await _getCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		const { sha } = res.data[0];
		const hash    = short ? sha.slice(0, 7) : sha;

		cache.set(cacheKey, hash);

		return hash;
	}

	async function getCommits(count?: number) {
		const res = await _getCommits();
		if (!res) {
			throw new Error('Could not retrieve project commits from GitHub API');
		}

		if (count) {
			return res.data.slice(0, count)
		}

		return res.data;
	}

	return { getCurrentCommitHash, getCommits };
});
