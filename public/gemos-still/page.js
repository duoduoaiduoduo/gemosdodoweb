(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if ('IntersectionObserver' in window && !reduced) {
  document.documentElement.classList.add('js');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:0.08});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
 }
 const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 document.querySelector('#mobile-note').hidden=!mobile;
})();
