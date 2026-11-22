// Joins the compiled API (dist/) and the packages it uses into one file for Vercel:
// dist/bundle/bootstrap.js. Run by `npm run bundle` after `npm run build`.
//
// Why: Vercel starts functions with Node's require(esm) support switched off. sanitize-html
// loads htmlparser2 (an ES module) with require, so the unbundled API fails to start there
// with ERR_REQUIRE_ESM. In one bundled file that require no longer exists.
//
// Kept outside the bundle, loaded from node_modules as normal:
//   sharp   has a native image library that cannot be bundled.
//   pdfkit  reads its font files from its own folder at run time.
//   pg-native is an optional add-on of pg that this project does not use.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/bootstrap.js'],
  outfile: 'dist/bundle/bootstrap.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['sharp', 'pdfkit', 'pg-native'],
  // Bundled CommonJS packages call require() for Node's own modules; give them one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
console.log('Bundled the API into dist/bundle/bootstrap.js');
