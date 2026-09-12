"""Deployment control-flow checks. All system commands use an isolated fake server."""
import json, os, pathlib, shutil, subprocess, tempfile, unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
NODE = shutil.which('node') or '/Users/duoqian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
class DeployTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='gemos-deploy-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        for name in ['deploy.sh', 'autodeploy.sh']:
            shutil.copy(ROOT/name, self.root/name)
        (self.root/'server.js').write_text('')
        assets = self.root/'public/vibecoding-projects/still-memory-box'
        (assets/'browser-inference').mkdir(parents=True)
        for name in ['index.html', 'browser-inference/ui.js', 'tide.js']:
            (assets/name).write_text('fixture')
        (self.root/'dist').mkdir()
        (self.root/'dist/index.html').write_text('old build')
        (self.root/'head').write_text('old')
        (self.root/'uploads').mkdir()
        (self.root/'uploads/keep').write_text('user data')
        (self.root/'vibecoding-projects.runtime.json').write_text('[{"id":"keep"}]')
        self.bin = self.root/'bin'; self.bin.mkdir()
        commands = {
          'flock': 'exit "${LOCK_RESULT:-0}"',
          'timeout': 'shift 3; exec "$@"',
          'git': '''case "$*" in
            *fetch*) echo fetch >> calls; exit "${FETCH_RESULT:-0}";;
            'rev-parse origin/main') echo new;;
            'rev-parse HEAD') cat head;;
            'branch --show-current') echo main;;
            'diff --quiet'|'diff --cached --quiet') exit 0;;
            'ls-tree -r --name-only new') echo .env.example;;
            'merge --ff-only new') echo new > head;;
            *) exit 99;; esac''',
          'npm': '''echo "$*" >> calls
            if [[ "$1" == ci ]]; then exit 0; fi
            [[ ! -e fail-build ]] || exit 42
            stage="${@: -1}"
            mkdir -p "$stage"
            cp -R public/. "$stage/"
            echo newbuild > "$stage/index.html"''',
          'pm2': '''if [[ "$1" == jlist ]]; then
            printf '[{"name":"gemosdodoweb-site","pm2_env":{"pm_cwd":"%s","pm_exec_path":"%s/server.js"}}]' "$PWD" "$PWD"
            else echo restart >> calls; fi''',
          'curl': '''cp dist/deployment.json "${@: -1}"''',
          'df': 'echo "disk 9000000 1000 ${FREE_KB:-8000000} 1% /"',
        }
        for name, body in commands.items():
            path=self.bin/name; path.write_text('#!/bin/bash\n'+body+'\n'); path.chmod(0o755)
        (self.bin/'node').symlink_to(NODE)
        self.env={**os.environ,'PATH':str(self.bin)+':/usr/bin:/bin'}
    def run_deploy(self, **env):
        return subprocess.run(['bash','deploy.sh','--if-needed'],cwd=self.root,env={**self.env,**env},capture_output=True,text=True)
    def test_failed_build_retried_even_after_head_advanced(self):
        (self.root/'fail-build').touch()
        first=self.run_deploy()
        self.assertEqual(first.returncode,42,first.stdout+first.stderr)
        self.assertEqual((self.root/'head').read_text().strip(),'new')
        self.assertEqual((self.root/'dist/index.html').read_text(),'old build')
        self.assertFalse((self.root/'.deploy-state/deployed-commit').exists())
        (self.root/'fail-build').unlink()
        second=self.run_deploy()
        self.assertEqual(second.returncode,0,second.stdout+second.stderr)
        self.assertEqual((self.root/'.deploy-state/deployed-commit').read_text().strip(),'new')
        before=(self.root/'calls').read_text().count('restart')
        self.assertEqual(self.run_deploy().returncode,0)
        self.assertEqual((self.root/'calls').read_text().count('restart'),before)
        self.assertEqual((self.root/'uploads/keep').read_text(),'user data')
        self.assertEqual((self.root/'vibecoding-projects.runtime.json').read_text(),'[{"id":"keep"}]')
    def test_fetch_failure_does_not_publish(self):
        self.assertEqual(self.run_deploy(FETCH_RESULT='128').returncode,128)
        self.assertEqual((self.root/'head').read_text(),'old')
    def test_lock_contention_and_legacy_lock_are_safe(self):
        self.assertEqual(self.run_deploy(LOCK_RESULT='1').returncode,75)
        (self.root/'.autodeploy.lock').mkdir()
        self.assertEqual(self.run_deploy().returncode,1)
        self.assertTrue((self.root/'.autodeploy.lock').is_dir())
    def test_low_disk_does_not_touch_live_dist(self):
        self.assertEqual(self.run_deploy(FREE_KB='100').returncode,1)
        self.assertEqual((self.root/'dist/index.html').read_text(),'old build')
    def test_daemon_reports_failure(self):
        result=subprocess.run(['bash','autodeploy.sh'],cwd=self.root,env={**self.env,'AUTODEPLOY_ONCE':'1','FETCH_RESULT':'128'},capture_output=True,text=True)
        self.assertEqual(result.returncode,128)
        self.assertIn('retrying',result.stdout)
if __name__=='__main__': unittest.main()
