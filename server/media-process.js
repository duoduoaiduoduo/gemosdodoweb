import {spawn} from 'node:child_process';

// Wait for close (including after termination) before releasing the pipeline slot.
export const runMediaProcess = (command, args, {
  timeoutMs = 30_000,
  maxBuffer = 1024 * 1024,
  killGraceMs = 2_000,
  spawnProcess = spawn,
} = {}) => new Promise((resolve) => {
  let child;
  let timer;
  let killTimer;
  let settled = false;
  let stopping = false;
  let timedOut = false;
  let outputTooLarge = false;
  let outputBytes = 0;
  const stdout = [];
  const stderr = [];
  const finish = (status, error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(killTimer);
    resolve({status, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), timedOut, outputTooLarge, error});
  };
  const stop = () => {
    if (stopping || settled) return;
    stopping = true;
    child.kill('SIGTERM');
    if (!settled) killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
  };
  const collect = (chunks, chunk) => {
    if (stopping || settled) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    outputBytes += bytes.length;
    if (outputBytes > maxBuffer) {
      outputTooLarge = true;
      stop();
      return;
    }
    chunks.push(bytes);
  };
  try {
    child = spawnProcess(command, args, {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.once('error', (error) => finish(null, error));
    child.once('close', (code) => finish(timedOut || outputTooLarge ? null : code));
    timer = setTimeout(() => {timedOut = true; stop();}, timeoutMs);
  } catch (error) {
    finish(null, error);
  }
});

// A short bounded queue prevents simultaneous uploads from saturating the CPU.
export const createSerialMediaQueue = ({maxPending = 2} = {}) => {
  let count = 0;
  let tail = Promise.resolve();
  return (task) => {
    if (count >= maxPending + 1) return Promise.reject(Object.assign(new Error('Video processing queue is full'), {code: 'MEDIA_QUEUE_FULL'}));
    count++;
    const result = tail.then(task).finally(() => {count--;});
    tail = result.catch(() => {});
    return result;
  };
};
