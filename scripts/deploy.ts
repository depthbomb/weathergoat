const host   = process.env['DEPLOY_HOST'] ?? Bun.argv[2] ?? 'herd-prime';
const user   = process.env['DEPLOY_USER'] ?? 'lamb';
const path   = process.env['DEPLOY_PATH'] ?? `/home/${user}/weathergoat`;
const remote = `${user}@${host}`;

console.log(`\nDeploying to ${remote}:${path}\n`);

const proc = Bun.spawn(['ssh', '-tt', remote, `cd ${path} && bash update.sh`], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin:  'inherit',
});

process.exit(await proc.exited);
