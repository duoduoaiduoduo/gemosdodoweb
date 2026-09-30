import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {createGithubProfileCounter, renderVisitorTerminal} from '../server/github-profile-counter.js';

async function serve(statePath) {
  const app = express();
  app.use('/counter.svg', createGithubProfileCounter(statePath));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return {url: `http://127.0.0.1:${server.address().port}/counter.svg`, close: () => new Promise(resolve => server.close(resolve))};
}

test('parallel loads receive different persisted counts, HEAD does not count, and restarts resume', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gemos-profile-test-'));
  const statePath = path.join(dir, 'visits.json');
  let service = await serve(statePath);
  try {
    assert.equal((await fetch(service.url, {method: 'HEAD'})).status, 200);
    await assert.rejects(readFile(statePath), {code: 'ENOENT'});
    const responses = await Promise.all(Array.from({length: 20}, () => fetch(service.url)));
    const counts = await Promise.all(responses.map(async response => {
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      return Number((await response.text()).match(/visitor terminal — visit (\d+)/)[1]);
    }));
    assert.deepEqual(counts.sort((a, b) => a - b), Array.from({length: 20}, (_, i) => i + 1));
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).count, 20);
    await fetch(service.url, {method: 'HEAD'});
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).count, 20);
    await service.close();
    service = await serve(statePath);
    assert.match(await (await fetch(service.url)).text(), /visitor terminal — visit 21/);
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).count, 21);
  } finally {
    await service.close();
    await rm(dir, {recursive: true, force: true});
  }
});

test('corrupt saved data is preserved and a failed request does not poison the queue', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gemos-profile-test-'));
  const statePath = path.join(dir, 'visits.json');
  await writeFile(statePath, 'corrupt');
  const service = await serve(statePath);
  try {
    assert.equal((await fetch(service.url)).status, 503);
    assert.equal(await readFile(statePath, 'utf8'), 'corrupt');
    await writeFile(statePath, JSON.stringify({count: 42}));
    assert.match(await (await fetch(service.url)).text(), /visitor terminal — visit 43/);
    assert.throws(() => renderVisitorTerminal(-1));
    assert.throws(() => renderVisitorTerminal('<script>'));
  } finally {
    await service.close();
    await rm(dir, {recursive: true, force: true});
  }
});
