#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

export function precompressStatic(directory) {
  const root=path.resolve(directory);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw Error('Expected a real build directory');
  const summary={files:0,originalBytes:0,gzipBytes:0};
  function walk(folder){
    for(const item of fs.readdirSync(folder,{withFileTypes:true})){
      if(item.isSymbolicLink()) continue;
      const target=path.join(folder,item.name);
      if(item.isDirectory()){walk(target);continue;}
      if(!item.isFile()||! /\.(?:js|mjs|css|json|svg|wasm)$/i.test(item.name))continue;
      const stat=fs.statSync(target);
      const gzipPath=target+'.gz';
      // Never follow a pre-existing symlink while preparing a deployment.
      try {
        if(fs.lstatSync(gzipPath).isSymbolicLink())throw Error('Refusing a symlink gzip target');
      } catch(error) {
        if(error.code !== 'ENOENT')throw error;
      }
      // A rerun must not leave an old gzip copy when the source stops qualifying.
      if(stat.size<1024||stat.size>32*1024*1024){fs.rmSync(gzipPath,{force:true});continue;}
      const output=gzipSync(fs.readFileSync(target),{level:6});
      if(output.length>=stat.size){fs.rmSync(gzipPath,{force:true});continue;}
      fs.writeFileSync(gzipPath,output);
      fs.utimesSync(gzipPath,stat.atime,stat.mtime);
      summary.files++;summary.originalBytes+=stat.size;summary.gzipBytes+=output.length;
    }
  }
  walk(root);return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node scripts/precompress-static.mjs BUILD_DIRECTORY');
  console.log('Static gzip preparation:',JSON.stringify(precompressStatic(process.argv[2])));
}
