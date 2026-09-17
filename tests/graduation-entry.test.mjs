import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import express from 'express';
import {createGraduationEntry} from '../server/graduation-entry.js';

test('homepage passphrase verification is case sensitive and rejects incorrect or missing input',async()=>{
 const salt='test-salt',password='Test-entry-passphrase';
 const app=express();app.use('/entry',createGraduationEntry({salt,digest:scryptSync(password,salt,32).toString('hex')}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const verify=p=>fetch(`http://127.0.0.1:${server.address().port}/entry/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});
 try{assert.equal((await verify('wrong')).status,401);assert.equal((await verify(password.toLowerCase())).status,401);assert.equal((await verify('')).status,401);const response=await verify(password);assert.equal(response.status,200);assert.deepEqual(await response.json(),{success:true});for(let i=0;i<10;i++)assert.equal((await verify('wrong')).status,401);assert.equal((await verify('wrong')).status,429);}finally{server.close();}
});
