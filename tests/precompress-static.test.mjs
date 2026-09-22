import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {precompressStatic} from '../scripts/precompress-static.mjs';
test('precompresses eligible assets losslessly, skips media and symlinks',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gemos-gzip-'));
 try {
  const build=path.join(root,'build');fs.mkdirSync(build);
  const script='export const phrase="hello";\n'.repeat(500);
  fs.writeFileSync(path.join(build,'app.js'),script);fs.writeFileSync(path.join(build,'movie.mp4'),script);
  fs.writeFileSync(path.join(root,'outside.js'),script);fs.symlinkSync(path.join(root,'outside.js'),path.join(build,'linked.js'));
  const summary=precompressStatic(build);assert.equal(summary.files,1);assert(summary.gzipBytes<summary.originalBytes);
  assert.equal(gunzipSync(fs.readFileSync(path.join(build,'app.js.gz'))).toString(),script);
  assert.equal(fs.existsSync(path.join(build,'movie.mp4.gz')),false);assert.equal(fs.existsSync(path.join(build,'linked.js.gz')),false);
  fs.writeFileSync(path.join(build,'app.js'),'small changed source');
  precompressStatic(build);assert.equal(fs.existsSync(path.join(build,'app.js.gz')),false);
  fs.symlinkSync(path.join(root,'outside.js'),path.join(build,'bad.css.gz'));fs.writeFileSync(path.join(build,'bad.css'),script);
  assert.throws(()=>precompressStatic(build),/symlink/);assert.equal(fs.readFileSync(path.join(root,'outside.js'),'utf8'),script);
  fs.unlinkSync(path.join(build,'bad.css.gz'));
  fs.symlinkSync(path.join(root,'missing.css'),path.join(build,'bad.css.gz'));
  assert.throws(()=>precompressStatic(build),/symlink/);assert.equal(fs.existsSync(path.join(root,'missing.css')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
