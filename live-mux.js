import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createLiveDir() {
  if (process.env.LIVE_DIR) {
    fs.mkdirSync(process.env.LIVE_DIR, { recursive: true });
    return process.env.LIVE_DIR;
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tv-lv-live-'));
}

export const LIVE_DIR = createLiveDir();
export const LIVE_PLAYLIST = path.join(LIVE_DIR, 'index.m3u8');

let ffmpeg = null;
let currentSource = null;
let restarts = 0;
let muxError = null;

export function liveMuxStatus() {
  const running = Boolean(ffmpeg && ffmpeg.exitCode == null);
  return {
    running,
    ready: running && fs.existsSync(LIVE_PLAYLIST),
    source: currentSource,
    restarts,
    error: muxError,
  };
}

export async function pickUpstream(urls, fetchImpl = fetch) {
  for (const url of urls) {
    if (!url || !/^https?:\/\//i.test(url)) continue;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) return url;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function ensureDir() {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
}

function ffmpegCopyArgs(source) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '8',
    '-rw_timeout',
    '15000000',
    '-i',
    source,
    '-c',
    'copy',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_list_size',
    '8',
    '-hls_flags',
    'delete_segments+independent_segments',
    '-hls_allow_cache',
    '0',
    LIVE_PLAYLIST,
  ];
}

function ffmpegSyntheticArgs() {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=1280x720:rate=25',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=44100',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '50',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-shortest',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '8',
    '-hls_flags',
    'delete_segments+independent_segments',
    LIVE_PLAYLIST,
  ];
}

/** Attach spawn/exit handlers. Exported so tests can emit a missing-binary error. */
export function bindMuxProcess(child, { args, label }) {
  child.stderr?.on?.('data', () => {});
  child.on('error', (err) => {
    muxError = err?.code === 'ENOENT' ? 'ffmpeg_missing' : 'ffmpeg_error';
    if (process.env.NODE_ENV !== 'test') {
      console.error('[live-mux] ffmpeg failed to start:', err?.message || err);
    }
    if (ffmpeg === child) ffmpeg = null;
    currentSource = null;
  });
  child.on('exit', (code) => {
    if (ffmpeg === child) ffmpeg = null;
    if (muxError === 'ffmpeg_missing') return;
    restarts += 1;
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => {
      if (ffmpeg) return;
      if (label !== 'synthetic' && code !== 0) {
        spawnMux(ffmpegSyntheticArgs(), 'synthetic');
      } else {
        spawnMux(args, label);
      }
    }, 1200);
  });
}

function spawnMux(args, label) {
  ensureDir();
  currentSource = label;
  muxError = null;
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  ffmpeg = child;
  bindMuxProcess(child, { args, label });
}

export async function startLiveMux(candidateUrls = []) {
  if (process.env.NODE_ENV === 'test') return liveMuxStatus();
  ensureDir();
  const upstream = await pickUpstream(candidateUrls);
  if (upstream) {
    spawnMux(ffmpegCopyArgs(upstream), upstream);
  } else {
    spawnMux(ffmpegSyntheticArgs(), 'synthetic');
  }
  return liveMuxStatus();
}

export function stopLiveMux() {
  if (ffmpeg) {
    ffmpeg.removeAllListeners('exit');
    ffmpeg.removeAllListeners('error');
    try {
      ffmpeg.kill('SIGTERM');
    } catch {
      /* already gone */
    }
    ffmpeg = null;
  }
}

export function createFakeMuxChild() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.kill = () => {
    child.exitCode = 1;
    child.emit('exit', 1);
  };
  return child;
}

/** Test helper: attach a fake child as the current mux process. */
export function installMuxChildForTest(child, meta = { args: [], label: 'test' }) {
  ffmpeg = child;
  currentSource = meta.label;
  muxError = null;
  bindMuxProcess(child, meta);
  return child;
}
