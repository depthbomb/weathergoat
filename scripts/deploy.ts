const rawArgs = Bun.argv.slice(2);
const hostArg = rawArgs.find(a => !a.startsWith('-'));
const flags   = rawArgs.filter(a => a.startsWith('-'));

const host   = process.env['DEPLOY_HOST'] ?? hostArg ?? 'herd-prime';
const user   = process.env['DEPLOY_USER'] ?? 'lamb';
const path   = process.env['DEPLOY_PATH'] ?? `/home/${user}/weathergoat`;
const remote = `${user}@${host}`;

console.log(`\nDeploying to ${remote}:${path}\n`);

const remoteCmd = [`cd ${path}`, `bash update.sh ${flags.join(' ')}`.trim()].join(' && ');

const proc = Bun.spawn(['ssh', '-tt', remote, remoteCmd], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin:  'inherit',
});

process.exit(await proc.exited);
