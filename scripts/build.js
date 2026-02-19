import { cp, mkdir, rm } from 'node:fs/promises';

const distDir = 'dist';

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const entries = ['index.html', 'styles.css', 'src', 'assets', 'README.md', 'DESIGN_NOTES.md'];

for (const entry of entries) {
  await cp(entry, `${distDir}/${entry}`, { recursive: true });
}

console.log('Build complete: dist/');
