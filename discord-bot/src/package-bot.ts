import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const release = process.env.GITHUB_SHA;
const directory = process.argv[2];

if (!directory || !release || !/^[a-f\d]{40}$/.test(release)) {
  throw new Error('Set GITHUB_SHA and pass a directory for the bot package');
}

const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

await mkdir(directory, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  outfile: join(directory, 'index.js'),
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define: { __CARDHOUSE_BOT_RELEASE__: JSON.stringify(release) },
});
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify(
    {
      name: 'cardhouse-discord-bot',
      private: true,
      type: 'module',
      main: 'index.js',
      engines: { node: '>=22.12.0' },
      scripts: { build: 'node --check index.js', start: 'node index.js' },
      dependencies: manifest.dependencies,
    },
    null,
    2,
  ) + '\n',
);
