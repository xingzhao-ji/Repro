import { build } from 'esbuild';
import { mkdir, access, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('package-lock.json', 'dist/package-lock.json');
await build({ entryPoints: ['src/cli.ts', 'src/index.ts'], outdir: 'dist', bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', sourcemap: true });
try { await access('web/main.tsx'); } catch { process.exit(0); }
await build({ entryPoints: ['web/main.tsx'], outfile: 'dist/web.js', bundle: true, platform: 'browser', target: 'es2022', format: 'esm', sourcemap: true });
