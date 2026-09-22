import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pruneBuilds } from '../scripts/prune-builds.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'gemos-build-retention-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function build(root, name) {
  await mkdir(path.join(root, name));
  await writeFile(path.join(root, name, 'index.html'), 'completed build');
  return name;
}
const snapshot = (day, pid = 100) => `dist-previous-202609${String(day).padStart(2, '0')}-120000-${pid}`;

test('keeps exactly the newest three completed builds by timestamp, not directory enumeration', async t => {
  const root = await fixture(t);
  for (const day of [18, 22, 20, 19, 21]) await build(root, snapshot(day));
  const result = await pruneBuilds({ root });
  assert.deepEqual(result.retained, [snapshot(22), snapshot(21), snapshot(20)]);
  assert.deepEqual(result.removed, [snapshot(19), snapshot(18)]);
  assert.deepEqual((await readdir(root)).sort(), [...result.retained].sort());
});

test('protects live builds, incomplete builds, data, migration, uploads, configuration and malformed names', async t => {
  const root = await fixture(t);
  const protectedNames = ['dist', 'dist-stage-20260901-120000-10', 'data-20260901-120000-10', 'migration-20260901',
    'uploads', 'uploads.bak', 'dist-previous-20260230-120000-100', 'dist-previous-20260901-250000-100',
    'dist-previous-20260901-120000-100-extra', 'dist-previous-20260901-120000-000', '.env'];
  for (const name of protectedNames) await build(root, name);
  await mkdir(path.join(root, snapshot(1))); // A staging/partial directory is never a completed build.
  await writeFile(path.join(root, snapshot(2)), 'a file, not a directory');
  await mkdir(path.join(root, snapshot(3), 'index.html'), { recursive: true });
  for (const day of [10, 11, 12, 13]) await build(root, snapshot(day));
  const result = await pruneBuilds({ root });
  assert.deepEqual(result.removed, [snapshot(10)]);
  for (const name of protectedNames) assert.equal(await readFile(path.join(root, name, 'index.html'), 'utf8'), 'completed build');
  assert.ok((await lstat(path.join(root, snapshot(1)))).isDirectory());
  assert.equal(await readFile(path.join(root, snapshot(2)), 'utf8'), 'a file, not a directory');
  assert.ok((await lstat(path.join(root, snapshot(3), 'index.html'))).isDirectory());
});

test('never follows root, snapshot, index or nested symlinks', async t => {
  const root = await fixture(t);
  const state = path.join(root, 'state');
  const outside = path.join(root, 'outside');
  await mkdir(state);
  await mkdir(outside);
  await writeFile(path.join(outside, 'index.html'), 'must survive');
  await symlink(outside, path.join(state, snapshot(1)), 'dir');
  await mkdir(path.join(state, snapshot(2)));
  await symlink(path.join(outside, 'index.html'), path.join(state, snapshot(2), 'index.html'));
  for (const day of [10, 11, 12, 13]) await build(state, snapshot(day));
  await symlink(outside, path.join(state, snapshot(10), 'assets'), 'dir');
  const result = await pruneBuilds({ root: state });
  assert.deepEqual(result.removed, [snapshot(10)]);
  assert.equal(await readFile(path.join(outside, 'index.html'), 'utf8'), 'must survive');
  assert.ok((await lstat(path.join(state, snapshot(1)))).isSymbolicLink());
  assert.ok((await lstat(path.join(state, snapshot(2), 'index.html'))).isSymbolicLink());
  const alias = path.join(root, 'alias');
  await symlink(state, alias, 'dir');
  await assert.rejects(pruneBuilds({ root: alias }), /real directory/);
});

test('dry run lists only eligible removals and does not mutate disk, including via CLI', async t => {
  const root = await fixture(t);
  for (const day of [18, 19, 20, 21, 22]) await build(root, snapshot(day));
  const before = await readdir(root);
  const result = await pruneBuilds({ root, dryRun: true });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.wouldRemove, [snapshot(19), snapshot(18)]);
  assert.deepEqual(await readdir(root), before);
  const script = fileURLToPath(new URL('../scripts/prune-builds.mjs', import.meta.url));
  const cli = spawnSync(process.execPath, [script, '--root', root, '--dry-run'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /2 would remove \(dry run\)/);
  assert.deepEqual(await readdir(root), before);
});

test('fewer than three valid snapshots are retained and same-second snapshots order by numeric PID', async t => {
  const root = await fixture(t);
  for (const pid of [9, 10]) await build(root, snapshot(22, pid));
  const result = await pruneBuilds({ root });
  assert.deepEqual(result.retained, [snapshot(22, 10), snapshot(22, 9)]);
  assert.deepEqual(result.removed, []);
});
