import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const SEGMENTS = {
  a: '12,0 54,0 62,8 54,16 12,16 4,8',
  b: '56,18 64,10 72,18 72,58 64,66 56,58',
  c: '56,80 64,72 72,80 72,120 64,128 56,120',
  d: '12,122 54,122 62,130 54,138 12,138 4,130',
  e: '0,80 8,72 16,80 16,120 8,128 0,120',
  f: '0,18 8,10 16,18 16,58 8,66 0,58',
  g: '12,61 54,61 62,69 54,77 12,77 4,69',
};
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

/** The count is the only variable; no query parameters or user content enter the SVG. */
export function renderVisitorTerminal(count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid visitor count');
  const number = String(count).padStart(6, '0');
  const digitScale = Math.min(1, 6 / number.length);
  const digits = [...number].map((digit, i) => `<g transform="translate(${i * 90} 0)">
    <rect x="-6" y="-9" width="84" height="156" rx="5" fill="#FE885B" fill-opacity=".035" stroke="#FF9865" stroke-opacity=".12"/>
    ${Object.entries(SEGMENTS).map(([key, points]) => `<polygon points="${points}" ${DIGITS[Number(digit)].includes(key) ? 'fill="url(#digit)" filter="url(#digitGlow)"' : 'fill="#432332" fill-opacity=".55"'}/>`).join('')}
  </g>`).join('');
  const stars = Array.from({length: 25}, (_, i) => `<circle cx="${42 + (i * 173) % 1105}" cy="${44 + (i * 67) % 255}" r="${i % 4 === 0 ? 1.8 : 1}" fill="${i % 3 ? '#54DDF6' : '#FFA377'}" opacity=".4" class="star s${i % 3}"/>`).join('');
  const spokes = Array.from({length: 36}, (_, i) => `<path d="M0 -116v${i % 3 === 0 ? 12 : 5}" transform="rotate(${i * 10})" stroke="#77E6FF" stroke-opacity="${i % 3 === 0 ? '.6' : '.25'}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360" role="img" aria-labelledby="title desc">
  <title id="title">GemosDodo visitor terminal — visit ${count}</title>
  <desc id="desc">你是第 ${count} 位进入小宇宙的旅人。Animated neon radar, orange visitor number, flowing signals and scanner. Cumulative image loads, including repeat visits.</desc>
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#080D20"/><stop offset=".55" stop-color="#101329"/><stop offset="1" stop-color="#201026"/></linearGradient>
    <linearGradient id="border"><stop stop-color="#62DFFF" stop-opacity=".6"/><stop offset=".45" stop-color="#7466DD" stop-opacity=".3"/><stop offset="1" stop-color="#FF875F" stop-opacity=".7"/></linearGradient>
    <linearGradient id="digit" x2="0" y2="1"><stop stop-color="#FFE4B4"/><stop offset=".42" stop-color="#FFBA70"/><stop offset="1" stop-color="#FF6659"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#3BCFFA" stop-opacity=".2"/><stop offset="1" stop-color="#3BCFFA" stop-opacity="0"/></radialGradient>
    <radialGradient id="warm"><stop stop-color="#FF6E5E" stop-opacity=".14"/><stop offset="1" stop-color="#FF6E5E" stop-opacity="0"/></radialGradient>
    <linearGradient id="beam" x1="0" x2="1"><stop stop-color="#50DFF8" stop-opacity="0"/><stop offset="1" stop-color="#50DFF8" stop-opacity=".4"/></linearGradient>
    <linearGradient id="scan" x2="1"><stop stop-color="#FFE5B5" stop-opacity="0"/><stop offset=".5" stop-color="#FFE5B5" stop-opacity=".12"/><stop offset="1" stop-color="#FFE5B5" stop-opacity="0"/></linearGradient>
    <filter id="digitGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#7586C0" stroke-opacity=".065"/></pattern>
    <clipPath id="panel"><rect x="1" y="1" width="1198" height="358" rx="20"/></clipPath>
  </defs>
  <style>
    text{font-family:'Courier New',monospace}
    @keyframes rotate{to{transform:rotate(360deg)}}
    @keyframes counterrotate{to{transform:rotate(-360deg)}}
    @keyframes expand{0%{transform:scale(.28);opacity:.75}100%{transform:scale(1);opacity:0}}
    @keyframes flow{to{stroke-dashoffset:-72}}
    @keyframes cross{0%{transform:translateX(-130px)}100%{transform:translateX(1100px)}}
    @keyframes pulse{50%{opacity:.35}}
    @keyframes float{50%{transform:translateY(-6px)}}
    .radar{animation:rotate 6s linear infinite}.ring{animation:counterrotate 22s linear infinite}
    .ripple{animation:expand 3.6s ease-out infinite}.ripple2{animation-delay:-1.8s}
    .signal{animation:flow 2.4s linear infinite}.scan{animation:cross 7s linear infinite}
    .star{animation:pulse 3s ease-in-out infinite}.s1{animation-delay:-1s}.s2{animation-delay:-2s}
    .core{animation:float 4s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){.radar,.ring,.ripple,.signal,.scan,.star,.core{animation:none}.scan{opacity:0}.ripple{opacity:.15}}
  </style>
  <g clip-path="url(#panel)">
    <rect width="1200" height="360" fill="url(#bg)"/>
    <rect width="1200" height="360" fill="url(#grid)"/>
    <ellipse cx="265" cy="190" rx="285" ry="245" fill="url(#halo)"/>
    <ellipse cx="900" cy="188" rx="410" ry="205" fill="url(#warm)"/>
    ${stars}
    <path d="M22 58H1178M22 311H1178" stroke="#687DAA" stroke-opacity=".2"/>
    <text x="32" y="35" fill="#96ACC8" font-size="12" letter-spacing="3">GEMOS // VISITOR TERMINAL</text>
    <circle cx="1019" cy="31" r="3" fill="#6FF1C8" class="star" filter="url(#glow)"/>
    <text x="1032" y="35" fill="#89D5C9" font-size="11" letter-spacing="2">SIGNAL RECEIVED</text>
    <g transform="translate(254 186)">
      <circle r="116" fill="none" stroke="#56E3FF" stroke-opacity=".14"/>
      ${spokes}
      <circle r="94" fill="none" stroke="#81E3FF" stroke-opacity=".18"/>
      <circle r="63" fill="none" stroke="#81E3FF" stroke-opacity=".13"/>
      <path d="M-104 0H104M0 -104V104" stroke="#81E3FF" stroke-opacity=".12"/>
      <g class="ring"><circle r="103" stroke="#60E4FF" stroke-width="2" fill="none" stroke-dasharray="50 30 6 38" opacity=".6"/><circle cx="103" r="4" fill="#BCF5FF" filter="url(#glow)"/></g>
      <g class="radar"><path d="M0 0L-49 -82A96 96 0 0 1 96 0Z" fill="url(#beam)"/><path d="M0 0H96" stroke="#ACF8FF" stroke-width="1.5" filter="url(#glow)"/></g>
      <circle r="92" fill="none" stroke="#60E4FF" stroke-width="1.5" class="ripple"/>
      <circle r="92" fill="none" stroke="#60E4FF" stroke-width="1.5" class="ripple ripple2"/>
      <circle cx="-65" cy="-46" r="3" fill="#FF9A73" class="star" filter="url(#glow)"/>
      <circle cx="54" cy="40" r="4" fill="#70EFFF" class="star s1" filter="url(#glow)"/>
      <g class="core">
        <path d="M0 -31L27 -16V16L0 32L-27 16V-16Z" fill="#152941" fill-opacity=".85" stroke="#B7F1FF" stroke-width="1.4"/>
        <path d="M-27 -16L0 0L27 -16M0 0V32" fill="none" stroke="#B7F1FF" stroke-width="1.4"/>
        <path d="M-19 6Q-10 -7 0 6Q10 -7 19 6V15L0 26L-19 15Z" fill="#FAA981" fill-opacity=".8" filter="url(#glow)"/>
      </g>
    </g>
    <path d="M376 186H434L455 165H481" fill="none" stroke="#70EFFF" stroke-opacity=".25"/>
    <path d="M376 186H434L455 165H481" fill="none" stroke="#98F2FF" stroke-dasharray="4 32" class="signal"/>
    <text x="504" y="94" fill="#FAC6A4" font-size="15" letter-spacing="4">YOU ARE VISITOR</text>
    <g transform="translate(504 120) scale(${digitScale})">${digits}</g>
    <text x="504" y="287" fill="#C8D1E5" font-family="Arial,sans-serif" font-size="17" letter-spacing="1">第 ${count} 位进入小宇宙的旅人。欢迎接入。</text>
    <rect x="0" y="63" width="90" height="246" fill="url(#scan)" class="scan"/>
    <path d="M20 79V66H43M1180 79V66H1157M20 290V303H43M1180 290V303H1157" fill="none" stroke="#8298BD" stroke-opacity=".55"/>
    <text x="32" y="339" fill="#8497B6" font-size="11" letter-spacing="2">EST. 2026.09.30 / STAY CURIOUS</text>
    <text x="815" y="339" fill="#A6AFC5" font-size="11" letter-spacing="2">DESIGN × CODE × LITTLE WORLDS</text>
  </g>
  <rect x=".75" y=".75" width="1198.5" height="358.5" rx="20" fill="none" stroke="url(#border)" stroke-width="1.5"/>
</svg>`;
}

/** Serialised atomic writes preserve counts across parallel image loads and restarts. */
export function createGithubProfileCounter(statePath) {
  const router = express.Router();
  let queue = Promise.resolve();
  const updateCount = (increment) => {
    const job = queue.then(async () => {
      let count = 0;
      try {
        const saved = JSON.parse(await readFile(statePath, 'utf8'));
        if (!Number.isSafeInteger(saved.count) || saved.count < 0) throw new Error('Invalid saved visitor count');
        count = saved.count;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (increment) {
        if (count === Number.MAX_SAFE_INTEGER) throw new Error('Visitor count exhausted');
        count += 1;
        await mkdir(path.dirname(statePath), {recursive: true});
        const temporary = `${statePath}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify({count, startedAt: '2026-09-30'})}\n`, 'utf8');
        await rename(temporary, statePath);
      }
      return count;
    });
    queue = job.catch(() => {});
    return job;
  };
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('X-Content-Type-Options', 'nosniff');
    try {
      const count = await updateCount(req.method !== 'HEAD');
      res.type('image/svg+xml').send(renderVisitorTerminal(count));
    } catch (error) {
      console.error('[GITHUB_PROFILE_COUNTER]', error.message);
      res.status(503).type('text/plain').send('Visitor counter temporarily unavailable');
    }
  });
  return router;
}
