import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const paths=source.slice(source.indexOf('const dataFile ='),source.indexOf('const proposalAnnotationsFile ='));
const functions=source.slice(source.indexOf('const writeVibecodingProjects ='),source.indexOf('const readData ='));
test('runtime edits never rewrite the tracked seed; existing and empty libraries are preserved',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gemos-runtime-test-'));
  try {
    const seed=path.join(dir,'vibecoding-projects.json');
    const runtime=path.join(dir,'vibecoding-projects.runtime.json');
    const initial=JSON.stringify([{id:'seed',entryUrl:'/index.html?v=idle'}]);
    fs.writeFileSync(seed,initial);
    const context=vm.createContext({fs,path,__dirname:dir,normalizeVibecodingProjectsCollection:projects=>({projects,changed:false})});
    vm.runInContext(paths+functions+';globalThis.read=readVibecodingProjects;globalThis.write=writeVibecodingProjects;',context);
    assert.equal(context.read()[0].id,'seed');
    assert.equal(fs.readFileSync(seed,'utf8'),initial);
    context.write([{id:'production-only'}]);
    assert.equal(context.read()[0].id,'production-only');
    assert.equal(fs.readFileSync(seed,'utf8'),initial);
    context.write([]);
    assert.equal(context.read().length,0);
    assert.equal(JSON.parse(fs.readFileSync(runtime,'utf8')).length,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
