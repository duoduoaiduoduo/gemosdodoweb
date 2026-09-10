import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight, Heart} from 'lucide-react';
import {Cow, hosts} from './pasture/Cow';

export default function HomeCompanion({lang}: {lang:'zh'|'en'}) {
  const [loved,setLoved]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function pet(){setLoved(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setLoved(false),1800);}
  const zh=lang==='zh';
  return <section className="home-companion" data-loved={loved} aria-label={zh?'牧场来客':'A visitor from the pasture'}>
    <button className="home-companion-pet" onClick={pet} aria-label={zh?'摸摸云朵':'Pet Cloud'}><Cow data={{...hosts[0],eyeStyle:loved?'happy':'normal'}}/><Heart size={15} className="home-companion-heart" fill="currentColor"/></button>
    <div className="home-companion-copy"><p aria-live="polite">{loved?(zh?'它好像很喜欢你。':'You made a new friend.'):(zh?'给好奇心放个小假':'A little break for curiosity')}</p><Link to="/pasture">{zh?'去牛牛牧场坐坐':'Visit the pasture'}<ArrowUpRight size={16}/></Link><small>{zh?'摸摸左边的小牛，打个招呼。':'Tap the cow to say hello.'}</small></div>
  </section>;
}
