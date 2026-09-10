export function Tree({variant = 0}: {variant?: number}) {
  return <svg viewBox="0 0 120 150" aria-hidden="true"><ellipse cx="60" cy="139" rx="37" ry="7" fill="#365939" opacity=".12" /><path d="M60 130V70M60 106L40 84M60 92L77 70" stroke="#a49d80" strokeWidth="7" strokeLinecap="round" /><ellipse cx="59" cy="64" rx={variant ? 36 : 46} ry={variant ? 59 : 49} fill="var(--pg-tree)" /><ellipse cx="45" cy="50" rx="25" ry="35" fill="#fff" opacity=".10" /><path d="M60 110V66" stroke="#819773" strokeWidth="3" strokeLinecap="round" opacity=".35" /></svg>;
}

export function Blossom({variant = 0}: {variant?: number}) {
  return <svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 36V15M15 30Q4 27 7 23Q15 22 15 30M15 28Q25 22 25 19Q15 19 15 28" stroke="#6c9570" strokeWidth="2" fill="#7ca27b" /><g fill={['#fff7df', '#ead1ce', '#d5d9ea'][variant % 3]}><ellipse cx="15" cy="8" rx="4" ry="7" /><ellipse cx="15" cy="20" rx="4" ry="7" /><ellipse cx="9" cy="14" rx="7" ry="4" /><ellipse cx="21" cy="14" rx="7" ry="4" /></g><circle cx="15" cy="14" r="4" fill="#d8b763" /></svg>;
}
