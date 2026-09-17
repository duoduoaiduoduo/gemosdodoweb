import express from 'express';
import {scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
// This checks homepage navigation only. Report links and APIs intentionally
// remain accessible without a passphrase, as requested by the site owner.
export function createGraduationEntry({salt,digest}){
  const router=express.Router();const attempts=new Map();
  router.use(express.json({limit:'2kb'}));
  router.post('/verify',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!salt||!digest)return res.status(503).json({success:false});
    const now=Date.now();for(const [key,value] of attempts){if(value.expires<=now)attempts.delete(key);}
    const key=req.ip||'unknown';const record=attempts.get(key)||{count:0,expires:now+60000};
    if(record.count>=10)return res.status(429).json({success:false});
    record.count++;attempts.set(key,record);
    if(typeof req.body?.password!=='string'||!req.body.password||req.body.password.length>128)return res.status(401).json({success:false});
    try{const actual=await derive(req.body.password,salt,32);const expected=Buffer.from(digest,'hex');const valid=expected.length===actual.length&&timingSafeEqual(expected,actual);if(valid){attempts.delete(key);return res.json({success:true});}return res.status(401).json({success:false});}
    catch{return res.status(503).json({success:false});}
  });
  return router;
}
