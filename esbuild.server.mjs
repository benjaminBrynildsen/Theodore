import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/server.mjs',
  packages: 'external',
});

console.log('Server bundled to dist/server.mjs');
