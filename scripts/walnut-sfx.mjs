import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { error as reportError } from 'node:console';
import { exit, argv } from 'node:process';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { SFX_CLIPS, SFX_SAMPLE_RATE } from '../client/src/sfx-cues.ts';

const asset = fileURLToPath(
  new URL('../client/public/assets/sfx/walnut-club.wav', import.meta.url),
);
const sampleBytes = 2;

function readPcm(path) {
  const wav = readFileSync(path);
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE' ||
    wav.readUInt32LE(4) !== wav.length - 8
  )
    throw new Error(`${path} is missing a valid RIFF/WAVE header`);

  let format;
  let pcm;
  for (let start = 12; start + 8 <= wav.length;) {
    const tag = wav.toString('ascii', start, start + 4);
    const length = wav.readUInt32LE(start + 4);
    const offset = start + 8;
    const end = offset + length;
    if (end > wav.length) throw new Error(`${path} contains a truncated chunk`);
    if (tag === 'fmt ') format = wav.subarray(offset, end);
    if (tag === 'data') pcm = wav.subarray(offset, end);
    start = end + (length % 2);
  }

  if (
    !format ||
    format.length < 16 ||
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(2) !== 1 ||
    format.readUInt32LE(4) !== SFX_SAMPLE_RATE ||
    format.readUInt16LE(12) !== sampleBytes ||
    format.readUInt16LE(14) !== 16 ||
    !pcm?.length ||
    pcm.length % sampleBytes !== 0
  )
    throw new Error(`${path} must contain 44.1 kHz mono 16-bit PCM`);

  return pcm;
}

function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(SFX_SAMPLE_RATE, 24);
  header.writeUInt32LE(SFX_SAMPLE_RATE * sampleBytes, 28);
  header.writeUInt16LE(sampleBytes, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function unpack(output) {
  const pcm = readPcm(asset);
  const files = [];
  let cursor = 0;
  for (const [cue, takes] of Object.entries(SFX_CLIPS)) {
    takes.forEach(([start, frames], index) => {
      if (start !== cursor || !Number.isSafeInteger(frames) || frames < 1)
        throw new Error(`Invalid or out-of-order frames for ${cue}`);
      cursor += frames;
      const suffix =
        takes.length === 1 ? '' : `_${String(index + 1).padStart(2, '0')}`;
      files.push([
        cue + suffix + '.wav',
        pcm.subarray(start * sampleBytes, cursor * sampleBytes),
      ]);
    });
  }
  if (cursor * sampleBytes !== pcm.length)
    throw new Error('The cue index and the shipped WAV have different lengths');

  mkdirSync(output);
  for (const [name, take] of files)
    writeFileSync(join(output, name), pcmToWav(take));
}

function pack(input, output) {
  const grouped = new Map();
  for (const name of readdirSync(input).sort()) {
    if (!name.endsWith('.wav')) continue;
    const match = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*?)(?:_(\d+))?\.wav$/.exec(
      name,
    );
    if (!match || (match[2] && !/^\d{2}$/.test(match[2])))
      throw new Error(`Use <cue>.wav or <cue>_01.wav for ${name}`);
    const [, cue, suffix] = match;
    const takes = grouped.get(cue) ?? [];
    takes.push({ number: suffix === undefined ? null : Number(suffix), name });
    grouped.set(cue, takes);
  }
  if (!grouped.size) throw new Error(`No WAV clips in ${input}`);

  const clips = [];
  const index = [
    '// Start frame and frame count in assets/sfx/walnut-club.wav.',
    'export const SFX_SAMPLE_RATE = 44_100;',
    'export const SFX_CLIPS = {',
  ];
  let offset = 0;
  for (const cue of [...grouped.keys()].sort()) {
    const takes = grouped.get(cue);
    if (
      (takes.length === 1 && takes[0].number !== null) ||
      (takes.length > 1 && takes.some((take, i) => take.number !== i + 1))
    )
      throw new Error(
        `Use contiguous takes from _01 for ${cue} or one unnumbered file`,
      );
    const spans = takes.map(({ name }) => {
      const clip = readPcm(join(input, name));
      const frames = clip.length / sampleBytes;
      const span = `[${offset}, ${frames}]`;
      offset += frames;
      clips.push(clip);
      return span;
    });
    if (spans.length === 1) index.push(`  ${cue}: [${spans[0]}],`);
    else
      index.push(`  ${cue}: [`, ...spans.map((span) => `    ${span},`), '  ],');
  }
  index.push(
    '} as const;',
    '',
    'export type SfxCue = keyof typeof SFX_CLIPS;',
    '',
  );

  mkdirSync(output);
  writeFileSync(
    join(output, 'walnut-club.wav'),
    pcmToWav(Buffer.concat(clips)),
  );
  writeFileSync(join(output, 'sfx-cues.ts'), index.join('\n'));
}

const [command, input, output, ...extra] = argv.slice(2);
try {
  if (command === 'unpack' && input && !output) unpack(input);
  else if (command === 'pack' && input && output && !extra.length)
    pack(input, output);
  else
    throw new Error(
      'Usage: walnut-sfx.mjs unpack <new-output-dir> | pack <clip-dir> <new-output-dir>',
    );
} catch (error) {
  reportError(error.message);
  exit(1);
}
