#!/usr/bin/env node
// Only completed, inactive build snapshots are eligible. deploy.sh holds the
// shared deployment lock while calling this after recording a healthy release.
import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../.deploy-state/', import.meta.url));
const KEEP = 3;

function snapshotStamp(name) {
  const match = /^dist-previous-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([1-9]\d*)$/.exec(name);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, pid] = match;
  const stamp = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  const date = new Date(stamp);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== stamp) return null;
  return { timestamp: date.getTime(), pid: BigInt(pid) };
}

async function eligibleDirectory(root, name) {
  const location = path.join(root, name);
  try {
    const stat = await lstat(location);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    // A symlink named index.html does not establish this as a complete build.
    const index = await lstat(path.join(location, 'index.html'));
    if (!index.isFile() || index.isSymbolicLink()) return null;
    return stat;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

export async function pruneBuilds({ root = defaultRoot, dryRun = false } = {}) {
  const requestedRoot = path.resolve(root);
  const rootStat = await lstat(requestedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Build history root must be a real directory, not a symlink.');
  }
  const canonicalRoot = await realpath(requestedRoot);
  const candidates = [];
  for (const name of await readdir(canonicalRoot)) {
    const stamp = snapshotStamp(name);
    if (!stamp) continue;
    const stat = await eligibleDirectory(canonicalRoot, name);
    if (stat) candidates.push({ name, ...stamp, dev: stat.dev, ino: stat.ino });
  }
  candidates.sort((a, b) => b.timestamp - a.timestamp || (a.pid === b.pid ? 0 : a.pid > b.pid ? -1 : 1));
  const retained = candidates.slice(0, KEEP).map(entry => entry.name);
  const removed = [];
  const wouldRemove = candidates.slice(KEEP).map(entry => entry.name);
  if (!dryRun) {
    for (const entry of candidates.slice(KEEP)) {
      // Recheck immediately before removal. Never follow a replaced snapshot or
      // a replaced history root. Recursive rm unlinks nested symlinks themselves.
      const currentRoot = await lstat(canonicalRoot);
      const current = await eligibleDirectory(canonicalRoot, entry.name);
      if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || currentRoot.dev !== rootStat.dev || currentRoot.ino !== rootStat.ino ||
          !current || current.dev !== entry.dev || current.ino !== entry.ino) {
        throw new Error('Build history changed during cleanup; stopped without touching the changed entry.');
      }
      await rm(path.join(canonicalRoot, entry.name), { recursive: true, force: false });
      removed.push(entry.name);
    }
  }
  return { eligible: candidates.length, retained, removed, wouldRemove, dryRun };
}

async function main() {
  let root = defaultRoot;
  let dryRun = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--dry-run') dryRun = true;
    else if (args[index] === '--root' && args[index + 1] && !args[index + 1].startsWith('--')) root = args[++index];
    else if (args[index] === '--help') {
      console.log('Usage: node scripts/prune-builds.mjs [--root DIRECTORY] [--dry-run]\nKeeps the newest 3 completed dist-previous snapshots. Default root: project .deploy-state.');
      return;
    } else throw new Error('Usage: node scripts/prune-builds.mjs [--root DIRECTORY] [--dry-run]');
  }
  const result = await pruneBuilds({ root, dryRun });
  console.log(`Build history: ${result.eligible} eligible, ${result.retained.length} retained, ${dryRun ? result.wouldRemove.length + ' would remove (dry run)' : result.removed.length + ' removed'}.`);
  for (const name of dryRun ? result.wouldRemove : result.removed) console.log(`${dryRun ? 'Would remove' : 'Removed'} ${name}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Do not dump filesystem paths, configuration or contents in deploy logs.
    console.error(`Build history cleanup stopped: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}
