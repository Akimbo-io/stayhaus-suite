import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

const watch = process.argv.includes('--watch');

const opts = {
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2020',
  format: 'iife',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(opts);
}

copyFileSync('src/ui.html', 'dist/ui.html');
console.log('Built dist/code.js and dist/ui.html');
