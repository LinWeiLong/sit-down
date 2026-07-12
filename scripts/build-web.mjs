import { cp, mkdir, rm } from 'node:fs/promises';

const files = [
  'index.html',
  'sw.js',
  'src',
  'vendor'
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const file of files) {
  await cp(file, `dist/${file}`, { recursive: true });
}

console.log('Web assets copied to dist/.');
