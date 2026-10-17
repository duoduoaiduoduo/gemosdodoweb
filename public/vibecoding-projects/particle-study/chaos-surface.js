// CPU contact sampler for the SAME folded shell used by shaders.js/computeWGSL.
// There is no terrain or second world here: direction is the original particle
// domain, and time is the unmodified flower-and-grass simulation clock.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a); return n > 1e-9 ? mul(a, 1 / n) : [0, 1, 0]; };
const f = Math.fround;
const fract = x => x - Math.floor(x);
const hashCache = new Map();

// Integer lattice hashing explicitly rounds to shader precision. Retaining the
// f32 operations here matters: the final fract magnifies double/f32 differences.
function hash3(x, y, z) {
  const key = `${x},${y},${z}`;
  const cached = hashCache.get(key);
  if (cached !== undefined) return cached;
  let qx = f(fract(f(x * f(0.1031)))), qy = f(fract(f(y * f(0.1031)))), qz = f(fract(f(z * f(0.1031))));
  const d = f(f(f(qx * f(qy + f(33.33))) + f(qy * f(qz + f(33.33)))) + f(qz * f(qx + f(33.33))));
  qx = f(qx + d); qy = f(qy + d); qz = f(qz + d);
  const value = fract(f(f(qx + qy) * qz)) * 2 - 1;
  if (hashCache.size > 50000) hashCache.clear();
  hashCache.set(key, value);
  return value;
}

function noiseGradient(p) {
  const cell = p.map(Math.floor), q = p.map(fract);
  const v = q.map(x => x * x * (3 - 2 * x)), d = q.map(x => 6 * x * (1 - x));
  const [x, y, z] = cell;
  const a = hash3(x, y, z), b = hash3(x + 1, y, z), c = hash3(x, y + 1, z), e = hash3(x + 1, y + 1, z);
  const g = hash3(x, y, z + 1), h = hash3(x + 1, y, z + 1), i = hash3(x, y + 1, z + 1), j = hash3(x + 1, y + 1, z + 1);
  const ab = mix(a, b, v[0]), ce = mix(c, e, v[0]), gh = mix(g, h, v[0]), ij = mix(i, j, v[0]);
  const lower = mix(ab, ce, v[1]), upper = mix(gh, ij, v[1]);
  return [mix(lower, upper, v[2]), mix(mix(b - a, e - c, v[1]), mix(h - g, j - i, v[1]), v[2]) * d[0], mix(ce - ab, ij - gh, v[2]) * d[1], (upper - lower) * d[2]];
}
const noise = p => noiseGradient(p)[0];
const noiseVector = p => [noise(p), noise(add(p, [19.3, 7.1, 2.7])), noise(add(p, [4.3, 23.8, 12.3]))];
const turnY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };

function shellPoint(direction, time, params) {
  const t = Number.isFinite(time) ? time : 0;
  const turbulence = clamp(Number.isFinite(params.turbulence) ? params.turbulence : 1, 0, 2.4);
  const dispersion = Number.isFinite(params.dispersion) ? params.dispersion : 0;
  const shellLayer = params.shellLayer === 1 ? 1 : params.shellLayer === 2 ? 2 : 0;
  const assembled = smoothstep(0.1, 2.8, t), openingPhase = Math.sin((t - 5.1) * 0.72);
  const rupture = smoothstep(0.40, 0.99, openingPhase);
  const drift = [0.12 * Math.sin(t * 0.26), t * 0.085, 0.12 * Math.cos(t * 0.19)];
  const coarse = noiseVector(add(mul(direction, 1.75), drift));
  const warpedDomain = add(add(mul(direction, 2.65), mul(coarse, 0.75)), drift);
  const fold = noiseGradient(warpedDomain), lace = noiseGradient(add(mul(warpedDomain, 2.21), [3.7, 1.2, -2.9]));
  const grain = noise(mul(warpedDomain, 5.27));
  const pleatA = direction[1] * 4.4 + direction[0] * 2.6 + coarse[0] * 2 + t * 0.095;
  const pleatB = direction[2] * 3.5 + coarse[1] * 2;
  const shellRadius = shellLayer === 0 ? 1 : shellLayer === 1 ? 0.76 : 0.54;
  const radius = shellRadius + turbulence * (fold[0] * 0.30 + Math.sin(pleatA) * Math.sin(pleatB) * 0.10 + lace[0] * 0.078 + grain * 0.023);
  let p = add(mul(direction, radius), mul(coarse, 0.25 * turbulence));
  p = turnY(p, turbulence * (0.47 * p[1] + 0.24 * fold[0]));
  p[0] += turbulence * 0.065 * Math.sin(p[1] * 5.1 + p[2] * 3.3 + t * 0.2);
  p[1] += turbulence * 0.055 * Math.sin(p[2] * 4.7 - p[0] * 3.7 - t * 0.17);
  p[2] += turbulence * 0.09 * Math.sin(p[0] * 4.0 + p[1] * 2.3 + t * 0.16);
  const pore = noise(add(add(add(mul(direction, 3.25), mul(coarse, 0.9)), [-1.3, 4.6, 2.1]), drift));
  const poreDetail = noise(add(mul(direction, 9.8), drift));
  const threshold = 0.22 - rupture * 0.39 * (0.45 + 0.55 * smoothstep(-0.2, 0.8, p[1]));
  const coverage = shellLayer === 0
    ? 1 - smoothstep(threshold, threshold + 0.095, pore + poreDetail * 0.1)
    : 1 - smoothstep(0.41 - rupture * 0.2, 0.59 - rupture * 0.2, pore);
  const edge = 1 - Math.abs(coverage * 2 - 1);
  // r4/r5/r6=.5, the representative outer shell, without sparse satellites.
  p = add(p, mul(direction, edge * 0.0125));
  p = add(p, mul(noiseVector(add(mul(p, 12), drift)), 0.009));
  p[0] = p[0] * mix(0.52, 1, assembled) + (1 - assembled) * 0.21 * Math.sin(p[1] * 4.3 + 0.6);
  p[2] *= mix(0.50, 1, assembled);
  p[1] = p[1] * mix(0.76, 1, assembled) + (1 - assembled) * 0.19;
  p = add(p, add(mul(direction, dispersion * 0.5), mul(coarse, dispersion * 0.5)));
  p = mul(p, 0.93); p[1] *= 1.065;
  p = add(p, mul(direction, 0.012));
  return { position: p, coverage };
}

export function surfacePosition(direction, time, params = {}) {
  return shellPoint(unit(direction), time, params);
}

export function surfacePoint(direction, time, params = {}) {
  const d = unit(direction);
  const sample = shellPoint(d, time, params);
  // A small footprint averages micrograin under the four wheels while retaining
  // the original folded surface, rather than inventing a smooth sphere to ride.
  const tangent = unit(cross(Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], d));
  const bitangent = cross(d, tangent), epsilon = 0.014;
  const along = sub(shellPoint(unit(add(d, mul(tangent, epsilon))), time, params).position, shellPoint(unit(add(d, mul(tangent, -epsilon))), time, params).position);
  const across = sub(shellPoint(unit(add(d, mul(bitangent, epsilon))), time, params).position, shellPoint(unit(add(d, mul(bitangent, -epsilon))), time, params).position);
  let normal = unit(cross(along, across));
  if (dot(normal, d) < 0) normal = mul(normal, -1);
  return { ...sample, normal };
}
