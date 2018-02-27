const crypto = require('crypto');

const random = require('lodash/random');
const Redis = require('redis');
const bluebird = require('bluebird');
const columnify = require('columnify');

require('draftlog').into(console);

const COMMAND = process.env.COMMAND || 'sadd';
const PREFIX = process.env.PREFIX || `test:${random(0, 100)}:${COMMAND}`;
const TOTAL_ENTRY = parseInt(process.env.TOTAL_ENTRY, 10) || 100;
const MAX_ELEMENTS = parseInt(process.env.MAX_ELEMENTS, 10) || 10;
const MIN_ELEMENTS = parseInt(process.env.MIN_ELEMENTS, 10) || 1;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 100;
const PROGRESS = process.env.PROGRESS || true;
const VERBOSE = process.env.VERBOSE || false;
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = process.env.REDIS_PORT || '6379';

if (BATCH_SIZE > TOTAL_ENTRY) throw new Error('BATCH_SIZE should be < TOTAL_ENTRY');
if (MAX_ELEMENTS < MIN_ELEMENTS || MIN_ELEMENTS < 1) {
  throw new Error('wrong value for MAX_ELEMENTS or MIN_ELEMENTS');
}

const config = {
  REDIS_HOST,
  REDIS_PORT,
  COMMAND,
  PREFIX,
  TOTAL_ENTRY,
  MAX_ELEMENTS,
  MIN_ELEMENTS,
  BATCH_SIZE,
  PROGRESS,
  VERBOSE,
};
console.log();
console.log('--------- CONFIG ---------');
console.log();
console.log(columnify(config));
console.log();
console.log('--------- CONFIG ---------');
console.log();

bluebird.promisifyAll(Redis.RedisClient.prototype);
bluebird.promisifyAll(Redis.Multi.prototype);

const redis = Redis.createClient({
  host: REDIS_HOST,
  port: REDIS_PORT,
  prefix: `${PREFIX}:`,
});

function hhmmss(secs) {
  const pad = num => `0${num}`.slice(-2);
  let minutes = Math.floor(secs / 60);
  const s = secs % 60;
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(s)}`;
}

function uuid() {
  return ([1e10] + 1e20).replace(
    /[018]/g,
    a => (a ^ ((crypto.randomBytes(1)[0] * 16) >> (a / 4))).toString(16)[0], //eslint-disable-line
  );
}

const barLine = console.draft('Starting batch...');

function getProgress(batchNumber, size = BATCH_SIZE, total = TOTAL_ENTRY) {
  return Math.round(size * batchNumber / total * 100);
}

function ProgressBar(batchNumber) {
  const progress = getProgress(batchNumber);
  const units = Math.round(progress / 2);
  return barLine(
    `[${'='.repeat(units)}${' '.repeat(50 - units)}] ${progress}%  -  Batch# ${batchNumber}`,
  );
}

function randomSize(command = COMMAND, minEl = MIN_ELEMENTS, maxEl = MAX_ELEMENTS) {
  const cmd = command.toUpperCase();
  if (cmd === 'HSET') {
    return 2;
  } else if (cmd === 'MSET' || cmd === 'SET' || cmd === 'LPUSH') {
    return 1;
  } else if (cmd === 'HMSET') {
    return random(1, Math.floor(maxEl / 2)) * 2;
  }
  return random(minEl, maxEl);
}

function generateEntry(command = COMMAND) {
  const arr = new Array(2 + randomSize());
  const { length } = arr;
  arr[0] = command;
  arr[1] = uuid();

  for (let j = 2; j < length; j += 1) {
    arr[j] = random(1000000, 9999999);
  }
  return arr;
}

function generateBatch(size = BATCH_SIZE, verbose = VERBOSE) {
  const batch = new Array(size);
  for (let i = 0; i < size; i += 1) {
    batch[i] = generateEntry();
  }
  if (verbose) console.log(batch[0]);
  return batch;
}

async function injectData(progress = PROGRESS) {
  const arrayBatch = [];
  let batchNumber;
  for (batchNumber = 0; getProgress(batchNumber) < 100; batchNumber += 1) {
    if (progress) ProgressBar(batchNumber);
    arrayBatch.push(redis.batch(generateBatch()).execAsync());
  }
  if (progress) ProgressBar(batchNumber);
  return Promise.all(arrayBatch);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const base = 1024;
  const d = decimals || 2;
  const size = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const exp = Math.floor(Math.log(bytes) / Math.log(base));
  return `${parseFloat((bytes / base ** exp).toFixed(d))} ${size[exp]} `;
}

async function printMemoryUsage() {
  const res = await redis.infoAsync();
  const lines = res
    .toString()
    .split('\r\n')
    .sort();
  const obj = lines.reduce((acc, line) => {
    const parts = line.split(':');
    return parts[1] ? { ...acc, ...{ [parts[0]]: parts[1] } } : acc;
  }, {});
  return obj.used_memory;
}

async function main() {
  const before = await printMemoryUsage();
  const time = process.hrtime();
  await injectData();
  console.log('');
  console.log(`Execution time: ${hhmmss(process.hrtime(time)[0])}  (h:m:s)`);
  const after = await printMemoryUsage();
  console.log('');
  console.log('MEMORY *BEFORE* INJECTING DATA: ', formatBytes(before));
  console.log('MEMORY *AFTER*  INJECTING DATA: ', formatBytes(after));
  console.log('DIFFERENCE                    : ', formatBytes(after - before));
  return redis.quit();
}

main()
  .then(() => {
    console.log('Closing connection...');
  })
  .catch(err => {
    console.log('err', err);
  });
