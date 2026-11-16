import sys
import json
import types
import unittest
import tempfile
import importlib.util
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

if sys.platform == 'win32':
    sys.modules.setdefault('fcntl', types.ModuleType('fcntl'))

spec = importlib.util.spec_from_file_location('updater', Path(__file__).with_name('update.py'))
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

OLD_HASH, NEW_HASH = next(iter(updater.CONTRACT_FORMAT_UPGRADES))


def result(value):
    return json.dumps({'kind': 'result', 'envelope': {'ok': True, 'result': value}})


class DeploymentTests(unittest.TestCase):
    def exercise(self, failure=None):
        with tempfile.TemporaryDirectory(prefix='weathergoat-deploy-test-') as directory:
            home = Path(directory).resolve()
            live = home / 'previous'
            live.mkdir()
            (live / '.env').write_text('DATABASE_URL=postgresql://localhost/unused')
            (live / 'features.yaml').write_text('unchanged')
            (live / 'src/database/contract').mkdir(parents=True)
            (live / 'src/database/contract/contract.json').write_text(json.dumps({
                'storage': {'storageHash': OLD_HASH}
            }))
            config_dir = home / 'config'
            config_dir.mkdir()
            credentials = config_dir / 'deploy.json'
            drop = home / 'service.conf'
            previous_config = '[Service]\nWorkingDirectory=' + str(live) + '\n'
            drop.write_text(previous_config)
            credentials.write_text(json.dumps({
                'MIGRATION_DATABASE_URL': 'postgresql://127.0.0.1/weathergoat'
            }))
            state = {'active': 'active', 'directory': str(live), 'marker': OLD_HASH}
            calls = []

            def path(value):
                if str(value) == '/etc/systemd/system/wg.service.d/20-database-migration.conf':
                    return drop

                return Path(value)

            def prop(name):
                return {
                    'WorkingDirectory': state['directory'],
                    'ActiveState': state['active'],
                    'Result': 'success',
                    'NRestarts': '0'
                }[name]

            def run(args, **kwargs):
                calls.append(('run', args, kwargs.get('cwd')))
                if args[:2] == ['git', 'clone']:
                    root = Path(args[-1])
                    (root / 'src/database/contract').mkdir(parents=True)
                    (root / 'src/database/contract/contract.json').write_text(json.dumps({
                        'storage': {'storageHash': 'b' * 64 if failure == 'unreviewed' else NEW_HASH}
                    }))
                elif 'pg_dump' in args:
                    kwargs['stdout'].write(b'test backup')
                elif 'stop' in args:
                    state['active'] = 'inactive'
                elif 'start' in args:
                    state['active'] = 'active'
                elif args[:3] == ['sudo', '-n', 'install']:
                    Path(args[-1]).write_bytes(Path(args[-2]).read_bytes())
                elif 'mv' in args:
                    Path(args[-1]).write_bytes(Path(args[-2]).read_bytes())
                    state['directory'] = next(line.split('=', 1)[1] for line in drop.read_text().splitlines()
                                              if line.startswith('WorkingDirectory='))
                elif args[-1] == '.data/preflight.ts' and failure == 'schema':
                    raise RuntimeError('Schema differs')

            def output(args, **kwargs):
                calls.append(('output', args, kwargs.get('cwd')))
                if 'psql' in args:
                    return state['marker']
                if 'migrate' in args:
                    if failure == 'unreviewed':
                        self.assertNotIn('--from', args)
                        raise RuntimeError('Unknown marker in migration graph')
                    pending = failure == 'pending' and '--from' not in args
                    return result({'ok': True, 'migrations': ['unexpected'] if pending else []})
                if 'sign' in args:
                    restoring = kwargs['cwd'] == live
                    state['marker'] = OLD_HASH if restoring else NEW_HASH
                    if failure == 'sign' and not restoring:
                        raise RuntimeError('Signing failed after the marker changed')

                    return result({'ok': True})

                raise AssertionError(args)

            def journal(_since):
                if state['active'] == 'inactive':
                    return 'Shutdown complete: jobs and event handlers drained, delivery receipts persisted, database disconnected'
                if failure == 'health' and state['directory'] != str(live):
                    return 'ERROR startup failed'

                return '2026-11-16T20:00:00+00:00 Logged in to Discord'

            with patch.object(updater, 'Path', path), patch.object(updater, 'prop', prop), \
                 patch.object(updater, 'run', run), patch.object(updater, 'output', output), \
                 patch.object(updater, 'journal', journal), \
                 patch('builtins.print'), \
                 patch.object(updater.shutil, 'disk_usage', return_value=SimpleNamespace(free=10 * 1024**3)):
                if failure:
                    with self.assertRaises(RuntimeError):
                        updater.deploy(home / 'controller', 'a' * 40, set(), home, config_dir, credentials)
                else:
                    updater.deploy(home / 'controller', 'a' * 40, set(), home, config_dir, credentials)

            sign_calls = [call for call in calls if 'sign' in call[1]]
            if failure in ('schema', 'unreviewed'):
                self.assertFalse(sign_calls)
                self.assertFalse(any('stop' in call[1] for call in calls))
            else:
                backup_index = next(i for i, call in enumerate(calls) if 'pg_dump' in call[1])
                sign_index = next(i for i, call in enumerate(calls) if 'sign' in call[1])
                self.assertLess(backup_index, sign_index)
                saved = json.loads((config_dir / 'last-deployment.json').read_text())
                if failure:
                    self.assertEqual(len(sign_calls), 2)
                    self.assertEqual(sign_calls[-1][2], live)
                    self.assertTrue(saved['contractRestored'])
                    self.assertNotIn('healthy', saved)
                else:
                    self.assertEqual(len(sign_calls), 1)
                    self.assertTrue(saved['healthy'])
                    self.assertTrue(saved['contractRefreshed'])

            self.assertEqual(state['active'], 'active')
            self.assertEqual(state['marker'], OLD_HASH if failure else NEW_HASH)
            if failure:
                self.assertEqual(drop.read_text(), previous_config)
                self.assertEqual(state['directory'], str(live))

    def test_refreshes_only_after_backup(self):
        self.exercise()

    def test_schema_mismatch_leaves_live_service_untouched(self):
        self.exercise('schema')

    def test_unreviewed_contract_change_cannot_refresh_signature(self):
        self.exercise('unreviewed')

    def test_uncertain_signing_restores_previous_signature(self):
        self.exercise('sign')

    def test_pending_migration_after_signing_restores_previous_release(self):
        self.exercise('pending')

    def test_failed_health_check_restores_previous_signature(self):
        self.exercise('health')

    def test_missing_or_failed_prisma_result_is_rejected(self):
        for text in ['', result({'ok': False}), result({})]:
            with self.subTest(text=text), self.assertRaises(RuntimeError):
                updater.prisma_result(text)


if __name__ == '__main__':
    unittest.main()
