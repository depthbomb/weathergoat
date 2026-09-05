import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = Bun.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('-')).map((arg) => (arg === '-f' ? '--force' : arg));
if (flags.some((flag) => !['--force', '--check'].includes(flag)))
	throw new Error('Usage: bun run deploy [host] [--force] [--check]');
const hosts = args.filter((arg) => !arg.startsWith('-'));
if (hosts.length > 1) throw new Error('Supply at most one SSH host');
const host = process.env.DEPLOY_HOST ?? hosts[0] ?? 'herd-prime';
const user = process.env.DEPLOY_USER ?? 'lamb';
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(host) || !/^[a-z_][a-z0-9_-]*$/.test(user))
	throw new Error('Invalid SSH host or user');
const remote = `${user}@${host}`;
const path = process.env.DEPLOY_PATH ?? `/home/${user}/weathergoat-deploy`;
const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

async function capture(command: string[]) {
	const proc = Bun.spawn(command, { stdout: 'pipe', stderr: 'inherit' });
	const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
	if (code) throw new Error(`${command[0]} failed (${code})`);
	return text.trim();
}

if (await capture(['git', 'status', '--porcelain'])) throw new Error('Commit changes before deploying');
const revision = await capture(['git', 'rev-parse', 'HEAD']);
const branch = await capture(['git', 'symbolic-ref', '--short', 'HEAD']);
const published = await capture(['git', 'ls-remote', 'origin', `refs/heads/${branch}`]);
if (published.split(/\s+/)[0] !== revision) throw new Error('Push the current branch before deploying');
if ((await capture(['ssh', '-T', remote, 'hostname'])) !== 'herd-prime')
	throw new Error('Unexpected deployment host');

const folder = `.data/deployments/${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${revision.slice(0, 12)}`;
async function backup() {
	await mkdir(folder, { recursive: true, mode: 0o700 });
	const proc = Bun.spawn(
		['ssh', '-T', remote, 'sudo -n -u postgres pg_dump --format=custom --dbname=weathergoat'],
		{ stdout: 'pipe', stderr: 'inherit' },
	);
	const [code, buffer] = await Promise.all([proc.exited, new Response(proc.stdout).arrayBuffer()]);
	if (code) throw new Error('Off-device database backup failed');
	const bytes = new Uint8Array(buffer);
	await writeFile(`${folder}/before-deploy.dump`, bytes, { flag: 'wx', mode: 0o600 });
	await writeFile(
		`${folder}/before-deploy.json`,
		JSON.stringify({
			revision,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			bytes: bytes.length,
		}),
		{ flag: 'wx', mode: 0o600 },
	);
}
if (!flags.includes('--check')) await backup();
console.log(`Deploying ${revision.slice(0, 12)} from ${branch} to ${remote}`);
const command = [
	`cd ${quote(path)}`,
	'test -z "$(git status --porcelain)"',
	`git fetch origin ${quote(branch)}`,
	`git checkout --detach ${quote(revision)}`,
	`bash update.sh ${quote(revision)} ${flags.map(quote).join(' ')}`,
].join(' && ');
const proc = Bun.spawn(['ssh', '-T', remote, command], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'ignore',
});
if (await proc.exited) throw new Error('Deployment failed; inspect the output and retained release');
if (!flags.includes('--check')) {
	const state = JSON.parse(
		await capture([
			'ssh',
			'-T',
			remote,
			`cat ${quote(`/home/${user}/.config/weathergoat/last-deployment.json`)}`,
		]),
	);
	if (state.commit !== revision || !state.healthy)
		throw new Error('Deployment did not confirm the requested commit');
	if (
		typeof state.backup !== 'string' ||
		!state.backup.startsWith(`/home/${user}/weathergoat-releases/`) ||
		!state.backup.endsWith('/.data/prestart.dump')
	)
		throw new Error('Unexpected backup path');
	const dump = Bun.spawn(['ssh', '-T', remote, `cat ${quote(state.backup)}`], {
		stdout: 'pipe',
		stderr: 'inherit',
	});
	const [code, buffer] = await Promise.all([dump.exited, new Response(dump.stdout).arrayBuffer()]);
	const bytes = new Uint8Array(buffer);
	if (code || createHash('sha256').update(bytes).digest('hex') !== state.backupSha256)
		throw new Error('Final backup download or checksum verification failed');
	await writeFile(`${folder}/prestart.dump`, bytes, { flag: 'wx', mode: 0o600 });
	await writeFile(`${folder}/deployment.json`, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
	console.log(`Deployment healthy; verified backups saved in ${folder}`);
}
