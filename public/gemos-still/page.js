(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if ('IntersectionObserver' in window && !reduced) {
  document.documentElement.classList.add('js');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:0.08});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
 }
 const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 document.querySelector('#mobile-note').hidden=!mobile;
 document.querySelectorAll('[data-view][type="button"]').forEach(button=>button.addEventListener('click',()=>{
  const view=button.dataset.view;
  document.querySelector('.comparison').dataset.view=view;
  document.querySelectorAll('.comparison-switch button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 }));
 document.querySelector('#copy-mac-link').addEventListener('click',async()=>{
  const feedback=document.querySelector('.copy-feedback');
  try{await navigator.clipboard.writeText('https://gemosdodo.art/gemos-still/');feedback.textContent='链接已复制，发给自己，回到 Mac 再打开。';}
  catch{feedback.textContent='长按复制此链接：https://gemosdodo.art/gemos-still/';}
 });
})();
