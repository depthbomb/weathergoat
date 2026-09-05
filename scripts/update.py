"""Deploy a committed release on herd-prime, preserving the previous release."""

import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def prop(name):
    return output(['systemctl', 'show', 'wg.service', '-p', name, '--value'])


def journal(since):
    return output(['journalctl', '-u', 'wg.service', '--since', '@' + str(int(since)),
                   '--no-pager', '-o', 'short-iso-precise'])


def main():
    if socket.gethostname() != 'herd-prime':
        raise RuntimeError('This updater requires herd-prime')
    revision = sys.argv[1] if len(sys.argv) > 1 else output(['git', 'rev-parse', 'HEAD'])
    if not re.fullmatch('[a-f0-9]{40}', revision):
        raise RuntimeError('Pass a full Git commit SHA')
    flags = set(sys.argv[2:])
    if flags - {'--force', '--check'}:
        raise RuntimeError('Supported flags: --force, --check')
    controller = Path(__file__).resolve().parent.parent
    if output(['git', 'rev-parse', 'HEAD'], cwd=controller) != revision:
        raise RuntimeError('Controller checkout differs from requested commit')
    if output(['git', 'status', '--porcelain'], cwd=controller):
        raise RuntimeError('Deployment checkout must be clean')
    home = Path.home()
    config_dir = home / '.config/weathergoat'
    credentials_file = config_dir / 'deploy.json'
    if not credentials_file.is_file() or credentials_file.stat().st_mode & 0o077:
        raise RuntimeError('Configure private ~/.config/weathergoat/deploy.json (mode 600)')
    # Prevent two deployments from preparing or switching the service together.
    with (config_dir / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        deploy(controller, revision, flags, home, config_dir, credentials_file)


def deploy(controller, revision, flags, home, config_dir, credentials_file):
    live = Path(prop('WorkingDirectory'))
    if not live.is_relative_to(home) or live.resolve() != live or prop('ActiveState') != 'active':
        raise RuntimeError('Expected an active release inside the deployment user home')
    if not (live / '.env').is_file() or not (live / 'features.yaml').is_file():
        raise RuntimeError('Live production configuration is missing')
    drop = Path('/etc/systemd/system/wg.service.d/20-database-migration.conf')
    previous_config = drop.read_bytes()
    if ('WorkingDirectory=' + str(live)) not in previous_config.decode():
        raise RuntimeError('Unexpected service override')
    owner_url = json.loads(credentials_file.read_text())['MIGRATION_DATABASE_URL']
    from urllib.parse import urlparse
    owner = urlparse(owner_url)
    if owner.scheme not in ('postgres', 'postgresql') or owner.hostname != '127.0.0.1' or (owner.port or 5432) != 5432 or owner.path != '/weathergoat':
        raise RuntimeError('Migration credential must target local weathergoat PostgreSQL')
    if shutil.disk_usage(home).free < 2 * 1024**3:
        raise RuntimeError('At least 2 GiB free space is required to prepare a release')
    if '--check' in flags:
        print(json.dumps({'ready': True, 'commit': revision, 'live': str(live)}), flush=True)
        return
    if '--force' not in flags and (live / '.data/deployment.json').is_file():
        if json.loads((live / '.data/deployment.json').read_text()).get('commit') == revision:
            print('Requested commit is already deployed; use --force to redeploy.', flush=True)
            return

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    releases = home / 'weathergoat-releases'
    releases.mkdir(mode=0o700, exist_ok=True)
    if releases.resolve() != releases:
        raise RuntimeError('Release directory must not be a symlink')
    root = releases / (stamp + '-' + revision[:12])
    # A separate checkout keeps the running release untouched during preparation.
    run(['git', 'clone', '--no-hardlinks', '--no-checkout', str(controller), str(root)])
    root.chmod(0o700)
    run(['git', 'remote', 'set-url', 'origin', 'https://github.com/depthbomb/weathergoat.git'], cwd=root)
    run(['git', 'checkout', '--detach', revision], cwd=root)
    shutil.copy2(live / '.env', root / '.env')
    shutil.copy2(live / 'features.yaml', root / 'features.yaml')
    data = root / '.data'
    data.mkdir(mode=0o700)
    env = dict(os.environ)
    node = home / '.nvm/versions/node/v24.19.0/bin'
    env['PATH'] = str(home / '.bun/bin') + ':' + str(node) + ':' + env.get('PATH', '')
    env['DO_NOT_TRACK'] = '1'
    env['MIGRATION_DATABASE_URL'] = owner_url
    bun = str(home / '.bun/bin/bun')
    for args in [['install', '--frozen-lockfile'], ['run', 'generate-client'],
                 ['run', 'generate-messages'], ['node_modules/typescript/bin/tsc', '--noEmit'],
                 ['run', 'lint'], ['run', 'test']]:
        run([bun, *args], cwd=root, env=env)

    preview = output([bun, 'node_modules/prisma/dist/prisma.js', 'db', 'migrate', '--show', '--json'], cwd=root, env=env)
    result = next(json.loads(line)['envelope']['result'] for line in preview.splitlines()
                  if json.loads(line).get('kind') == 'result')
    (data / 'migration-preview.jsonl').write_text(preview)
    # Automatic recovery to the previous application is safe only with unchanged
    # storage. Schema-changing releases require a separately reviewed migration.
    if not result.get('ok') or result.get('migrations') != []:
        raise RuntimeError('Pending database migrations require review before deployment; live service unchanged')
    preflight = data / 'preflight.ts'
    preflight.write_text("""import { db } from '../src/database';
import { createPostgresControlClient } from '@prisma/orm-postgres/control';
import contract from '../src/database/contract/contract.json';
const app = new URL(process.env.DATABASE_URL!);
const owner = new URL(process.env.MIGRATION_DATABASE_URL!);
if (app.hostname !== owner.hostname || (app.port || '5432') !== (owner.port || '5432') || app.pathname !== owner.pathname)
  throw new Error('Runtime and migration targets differ');
const control = createPostgresControlClient({connection: process.env.DATABASE_URL});
try {
  const verified = await control.schemaVerify({contract});
  if (!verified.ok) throw new Error('Live schema differs from the release contract');
  await db.orm.public.AlertDestination.first();
  await db.orm.public.Incident.first();
  console.log('Production schema and runtime queries verified');
} finally { await db.close(); await control.close(); }
""")
    run([bun, '.data/preflight.ts'], cwd=root, env=env)
    if (root / '.env').read_bytes() != (live / '.env').read_bytes() or (root / 'features.yaml').read_bytes() != (live / 'features.yaml').read_bytes():
        raise RuntimeError('Live configuration changed during preparation')
    if prop('WorkingDirectory') != str(live) or drop.read_bytes() != previous_config:
        raise RuntimeError('Active release changed during preparation')
    saved = data / 'previous-service.conf'
    saved.write_bytes(previous_config)
    config = data / 'service.conf'
    config.write_text('[Service]\nWorkingDirectory=' + str(root) + '\nEnvironment=RELEASE_REVISION=' + revision + '\n')

    def install(source):
        run(['sudo', '-n', 'install', '-m', '644', str(source), str(drop) + '.new'])
        run(['sudo', '-n', 'mv', '-T', str(drop) + '.new', str(drop)])
        run(['sudo', '-n', 'systemctl', 'daemon-reload'])

    state = {'commit': revision, 'release': str(root), 'previous': str(live), 'stopRequestedAt': time.time()}
    print('Candidate verified; draining service and taking final backup.', flush=True)
    try:
        run(['sudo', '-n', 'systemctl', 'stop', 'wg.service'], timeout=90)
        if prop('ActiveState') != 'inactive' or prop('Result') != 'success' or 'Shutdown complete: jobs and event handlers drained, delivery receipts persisted, database disconnected' not in journal(state['stopRequestedAt']):
            raise RuntimeError('Previous release did not drain cleanly')
        backup = data / 'prestart.dump'
        with backup.open('xb') as handle:
            backup.chmod(0o600)
            run(['sudo', '-n', '-u', 'postgres', 'pg_dump', '--format=custom', '--dbname=weathergoat'], stdout=handle, timeout=30)
        state['backup'] = str(backup)
        state['backupSha256'] = hashlib.sha256(backup.read_bytes()).hexdigest()
        install(config)
        state['startRequestedAt'] = time.time()
        run(['sudo', '-n', 'systemctl', 'start', 'wg.service'], timeout=30)
        deadline = time.monotonic() + 45
        while True:
            logs = journal(state['startRequestedAt'])
            if 'ERROR' in logs or 'FATAL' in logs or prop('NRestarts') != '0':
                raise RuntimeError('New release failed its health gate')
            if prop('ActiveState') == 'active' and 'Logged in to Discord' in logs:
                ready = next(line for line in logs.splitlines() if 'Logged in to Discord' in line)
                state['outageSeconds'] = datetime.datetime.fromisoformat(ready.split()[0]).timestamp() - state['stopRequestedAt']
                break
            if time.monotonic() > deadline:
                raise RuntimeError('New release did not connect to Discord')
            time.sleep(1)
        state['healthy'] = True
    except Exception:
        run(['sudo', '-n', 'systemctl', 'stop', 'wg.service'], timeout=90)
        install(saved)
        run(['sudo', '-n', 'systemctl', 'start', 'wg.service'], timeout=30)
        state['recoveredPreviousAt'] = time.time()
        raise
    finally:
        (data / 'deployment.json').write_text(json.dumps(state))
        temporary = config_dir / 'last-deployment.json.new'
        temporary.write_text(json.dumps(state))
        temporary.chmod(0o600)
        temporary.replace(config_dir / 'last-deployment.json')
    print(json.dumps(state), flush=True)


if __name__ == '__main__':
    main()
