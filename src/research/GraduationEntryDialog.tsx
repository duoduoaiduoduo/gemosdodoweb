import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {createPortal} from 'react-dom';
import './graduation-entry.css';

export default function GraduationEntryDialog({lang,onClose,onVerified}:{lang:'zh'|'en';onClose:()=>void;onVerified:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const request=useRef<AbortController|null>(null);
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const t=(zh:string,en:string)=>lang==='zh'?zh:en;
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>{request.current?.abort();element?.close();};},[]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!password)return;
    setBusy(true);setError('');request.current=new AbortController();
    try{
      const response=await fetch('/api/graduation-entry/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password}),signal:request.current.signal});
      if(response.status===401){setError(t('口令不正确，请重新输入。','Incorrect passphrase. Please try again.'));setPassword('');return;}
      if(response.status===429){setError(t('尝试次数较多，请稍后再试。','Too many attempts. Please try again later.'));return;}
      if(!response.ok)throw Error();
      const data=await response.json();if(data.success!==true)throw Error();
      onVerified();
    }catch(e){if((e as Error).name!=='AbortError')setError(t('暂时无法验证，请稍后重试。','Unable to verify. Please try again.'));}
    finally{setBusy(false);}
  };
  return createPortal(<dialog ref={dialog} className="graduation-entry-dialog" aria-labelledby="graduation-entry-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><form onSubmit={submit}><h2 id="graduation-entry-title">{t('进入毕业设计','Open graduation research')}</h2><label htmlFor="graduation-entry-password">{t('请输入访问口令','Enter the passphrase')}</label><input id="graduation-entry-password" autoFocus type="password" autoComplete="off" maxLength={128} value={password} onChange={e=>{setPassword(e.target.value);setError('');}} aria-invalid={!!error} aria-describedby={error?'graduation-entry-error':undefined}/>{error&&<p id="graduation-entry-error" role="alert">{error}</p>}<div><button type="button" onClick={onClose}>{t('取消','Cancel')}</button><button type="submit" disabled={busy||!password}>{busy?t('验证中…','Verifying…'):t('进入','Enter')}</button></div></form></dialog>,document.body);
}
