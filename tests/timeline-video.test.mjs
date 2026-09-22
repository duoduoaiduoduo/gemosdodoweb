import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {runMediaProcess, createSerialMediaQueue} from '../server/media-process.js';
import {createTimelineVideoProcessor} from '../server/timeline-video.js';

test('subprocess work leaves the event loop responsive and returns its output', async () => {
  let ticks = 0;
  const timer = setInterval(() => {ticks++;}, 5);
  try {
    const result = await runMediaProcess(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("ready"), 90)']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'ready');
    assert.ok(ticks >= 5, `event loop ticked only ${ticks} times`);
  } finally { clearInterval(timer); }
});

test('timeout terminates a hung child, waits for close, then releases the serial slot', async () => {
  const queue = createSerialMediaQueue();
  const signals = [];
  let closed = false;
  const first = queue(() => runMediaProcess('fake-ffmpeg', [], {
    timeoutMs: 10, killGraceMs: 10,
    spawnProcess: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = (signal) => {
        signals.push(signal);
        if (signal === 'SIGKILL') setTimeout(() => {closed = true; child.emit('close', null);}, 10);
        return true;
      };
      return child;
    },
  }));
  const second = queue(async () => {assert.equal(closed, true); return 'next';});
  const result = await first;
  assert.equal(result.timedOut, true);
  assert.equal(result.status, null);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(await second, 'next');
});

test('missing commands and excessive output fail without unbounded buffering', async () => {
  const missing = await runMediaProcess('/nonexistent-gemos-test-command', []);
  assert.equal(missing.status, null);
  assert.equal(missing.error.code, 'ENOENT');
  const noisy = await runMediaProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096)); setTimeout(() => {}, 10000)'], {maxBuffer: 128});
  assert.equal(noisy.status, null);
  assert.equal(noisy.outputTooLarge, true);
  assert.ok(Buffer.byteLength(noisy.stdout) <= 128);
});

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gemos-video-test-'));
  const input = (id) => {
    const absPath = path.join(root, `${id}-original.webm`);
    fs.writeFileSync(absPath, 'original must stay intact');
    return {entryId: id, fileId: id, baseName: 'original', absPath, mime: 'video/webm', originalName: `${id}.webm`, size: 25};
  };
  return {root, input, close: () => fs.rmSync(root, {recursive: true, force: true})};
};

test('only one complete pipeline runs at once; queue overflow retains the original response', async () => {
  const files = fixture();
  let active = 0;
  let maximum = 0;
  const jobs = [];
  const ffmpegArgs = [];
  const processor = createTimelineVideoProcessor({maxPending: 1, runProcess: async (command, args, options) => {
    active++;
    maximum = Math.max(maximum, active);
    const filename = path.basename(args.at(-1));
    jobs.push(filename.split('-')[0]);
    await delay(5);
    active--;
    if (command === 'ffprobe') {
      assert.equal(options.timeoutMs, 30_000);
      return {status: 0, stdout: JSON.stringify({streams: [{height: filename.endsWith('.webm') ? 900 : 720, width: 1600, bit_rate: 2000000}]})};
    }
    assert.equal(options.timeoutMs, 15 * 60_000);
    ffmpegArgs.push(args);
    fs.writeFileSync(args.at(-1), 'mock derived video');
    return {status: 0};
  }});
  try {
    const a = files.input('a');
    const b = files.input('b');
    const c = files.input('c');
    const first = processor(a);
    const second = processor(b);
    const overflow = await processor(c);
    assert.equal(overflow.sources.length, 1);
    assert.equal(overflow.sources[0].isOriginal, true);
    assert.equal(overflow.defaultUrl, '/uploads/timeline/c/c-original.webm');
    const results = await Promise.all([first, second]);
    assert.equal(maximum, 1);
    assert.deepEqual(jobs, [...Array(5).fill('a'), ...Array(5).fill('b')]);
    for (const result of results) {
      assert.equal(result.sources.length, 3);
      assert.match(result.defaultUrl, /-720p\.mp4$/);
      assert.deepEqual(result.sources.map((source) => source.label), ['Original', '720p', '480p']);
      assert.equal(result.sources[0].size, 25);
    }
    for (const args of ffmpegArgs) {
      assert.equal(args[args.indexOf('-crf') + 1], '23');
      assert.equal(args[args.indexOf('-preset') + 1], 'veryfast');
      assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
      assert.equal(args[args.indexOf('-b:a') + 1], '128k');
      assert.equal(args[args.indexOf('-filter_threads') + 1], '1');
      assert.deepEqual(args.flatMap((arg, index) => arg === '-threads' ? [args[index + 1]] : []), ['1', '1']);
    }
    assert.equal(fs.readFileSync(a.absPath, 'utf8'), 'original must stay intact');
  } finally {files.close();}
});

test('probe failure preserves original; failed derived files are removed and other variants still work', async () => {
  const files = fixture();
  try {
    const input = files.input('failure');
    const noProbe = createTimelineVideoProcessor({runProcess: async () => ({status: null, timedOut: true})});
    assert.equal((await noProbe(input)).sources.length, 1);
    const processor = createTimelineVideoProcessor({runProcess: async (command, args) => {
      const target = args.at(-1);
      if (command === 'ffprobe') return {status: 0, stdout: JSON.stringify({streams: [{height: 900, width: 1600}]})};
      fs.writeFileSync(target, 'derived mock bytes');
      return target.includes('720p') ? {status: null, timedOut: true} : {status: 0};
    }});
    const result = await processor(input);
    assert.equal(result.sources.length, 2);
    assert.match(result.defaultUrl, /-480p\.mp4$/);
    assert.equal(fs.existsSync(path.join(files.root, 'failure-original-720p.mp4')), false);
    assert.equal(fs.existsSync(path.join(files.root, 'failure-original-480p.mp4')), true);
    assert.equal(fs.readFileSync(input.absPath, 'utf8'), 'original must stay intact');
  } finally {files.close();}
});

test('a rejected task releases the queue for subsequent work', async () => {
  const queue = createSerialMediaQueue();
  const failed = queue(async () => {throw new Error('test failure');});
  const next = queue(async () => 'recovered');
  await assert.rejects(failed, /test failure/);
  assert.equal(await next, 'recovered');
});
