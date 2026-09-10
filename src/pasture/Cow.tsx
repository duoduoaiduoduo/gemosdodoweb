export type CowData = {
  id?: string; name?: string; message?: string; bodyColor?: string; spotColor?: string;
  hornColor?: string; noseColor?: string; hoofColor?: string; eyeColor?: string;
  legColor?: string; tailColor?: string; eyeStyle?: string; spotType?: string;
  bodyShape?: string; hornStyle?: string; tailStyle?: string;
};
const color = (value: string | undefined, fallback: string) => value && /^#[\da-f]{3,8}$/i.test(value) ? value : fallback;

export function Cow({data}: {data: CowData}) {
  const body = color(data.bodyColor, '#fffdf4');
  const spot = color(data.spotColor, '#455049');
  const hoof = color(data.hoofColor, '#48524b');
  return <svg viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <g className="pg-legs" strokeWidth="9" strokeLinecap="round">
      {[{x:47,y:68,foot:86,pair:'a',far:true},{x:82,y:65,foot:85,pair:'b',far:true},{x:36,y:68,foot:87,pair:'b',far:false},{x:70,y:68,foot:87,pair:'a',far:false}].map((leg) => <g key={leg.x} className={`pg-leg pg-leg-${leg.pair}`} style={{transformOrigin: `${leg.x}px ${leg.y}px`}} opacity={leg.far ? .75 : 1}>
        <path d={`M${leg.x} ${leg.y}V${leg.foot - 2}`} stroke={color(data.legColor, body)} />
        <path d={`M${leg.x} ${leg.foot - 3}V${leg.foot}`} stroke={hoof} />
      </g>)}
    </g>
    <g className="pg-torso">
    <g className="pg-tail"><path d="M27 49Q8 38 12 64" stroke={color(data.tailColor, body)} strokeWidth="5" strokeLinecap="round" /><path d="M12 60L8 68Q14 72 17 65Z" fill={spot} /></g>
    <rect x="22" y="34" width="66" height={data.bodyShape === 'chubby' ? 45 : 40} rx={data.bodyShape === 'boxy' ? 12 : 23} fill={body} />
    <path d="M26 60Q51 79 86 60V65Q78 83 42 74Q29 72 26 60" fill="#4c5845" opacity=".07" />
    {data.spotType !== 'none' && (data.spotType === 'heart' ? <path d="M42 49C31 38 29 58 49 65C67 51 57 39 49 48Z" fill={spot} /> : <><path d="M36 36Q54 30 53 45Q51 54 39 51Q27 48 36 36" fill={spot} /><path d="M62 56Q76 50 78 65Q72 77 59 71Z" fill={spot} /></>)}
    <g className="pg-head">
      <path d="M75 28Q66 21 64 32Q69 39 78 36M95 29Q109 22 108 34Q104 40 97 36" fill={body} />
      <path d="M76 29Q70 17 78 14M94 29Q101 18 95 14" stroke={color(data.hornColor, '#d6c6a3')} strokeWidth="5" strokeLinecap="round" />
      <rect x="73" y="23" width="31" height="36" rx="15" fill={body} />
      <ellipse cx="92" cy="52" rx="18" ry="11" fill={color(data.noseColor, '#e9b9ae')} />
      <g className="pg-open-eyes">{data.eyeStyle === 'happy' ? <path d="M80 39Q83 35 86 39M94 38Q97 34 100 38" stroke={color(data.eyeColor, '#283a30')} strokeWidth="2" strokeLinecap="round" /> : <g fill={color(data.eyeColor, '#283a30')}><ellipse cx="83" cy="39" rx="2" ry={data.eyeStyle === 'sleepy' ? 1 : 2.5} /><ellipse cx="97" cy="38" rx="2" ry={data.eyeStyle === 'sleepy' ? 1 : 2.5} /></g>}
      </g><path className="pg-sleep-eyes" d="M80 40Q83 42 86 40M94 39Q97 41 100 39" stroke={color(data.eyeColor, '#283a30')} strokeWidth="2" strokeLinecap="round" />
      <g fill="#7f635c" opacity=".55"><ellipse cx="88" cy="53" rx="1.5" ry="2" /><ellipse cx="100" cy="52" rx="1.5" ry="2" /></g>
    </g>
    </g>
  </svg>;
}

export const hosts: CowData[] = [
  {id: 'island-host-cloud', name: '云朵', message: '慢一点，也没关系。', spotType: 'classic', spotColor: '#697168'},
  {id: 'island-host-milk', name: '奶糖', message: '给你留了一小片草地。', bodyColor: '#eee3cc', spotType: 'heart', spotColor: '#b9a487', eyeStyle: 'happy'},
  {id: 'island-host-moss', name: '苔苔', message: '今天也有好好晒太阳。', bodyColor: '#faf7ed', spotType: 'classic', spotColor: '#c6b295'},
];
