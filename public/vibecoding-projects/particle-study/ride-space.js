// A continuous chart of the original particle domain. Match shaders.js.
import { surfacePosition } from './chaos-surface.js?v=flower-ratio-v17';
export const RIDE_HEIGHT_SCALE = 1.05;
export function meadowRelief(x, z) {
  const valleyX = .68 * Math.sin(z * .48);
  const lateral = x - valleyX;
  const shoulder = 1 - Math.exp(-lateral * lateral * .36);
  return shoulder * (.45 + .36 * (.5 + .5 * Math.sin(z * .65 + x * .24))) + .06 * Math.sin(z * .85);
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const mul = (a, s) => a.map(x => x * s);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const unit = (v, fallback = [0, 1, 0]) => { const n = Math.hypot(...v); return n > 1e-9 ? mul(v, 1/n) : [...fallback]; };
export const mix = (a, b, t) => add(a, mul(sub(b, a), t));
export const tangent = (v, n) => unit(sub(v, mul(n, dot(v, n))), unit(cross(n, [1, .01, 0])));
export const smoothstep = (a, b, x) => { const t = clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
export const response = (dt, seconds) => 1-Math.exp(-dt/seconds);
export const rotateAbout = (v, n, a) => add(add(mul(v, Math.cos(a)), mul(cross(n,v), Math.sin(a))), mul(n, dot(n,v)*(1-Math.cos(a))));

export function emptyRideSpace() {
  return { domainRight:[1,0,0], domainForward:[0,0,1], domainNormal:[0,1,0],
    worldRight:[1,0,0], worldForward:[0,0,1], worldUp:[0,1,0], origin:[0,0,0], baseRadius:.93, unfold:0 };
}

export function unfoldPosition(original, direction, space) {
  if (!space || space.unfold <= 0) return [...original];
  const h = clamp(dot(direction, space.domainNormal), -.9999, .9999);
  const coefficient = Math.acos(h) / Math.max(Math.sqrt(1-h*h), .0001) * 3;
  const x = dot(direction, space.domainRight) * coefficient;
  const z = dot(direction, space.domainForward) * coefficient;
  const residual = sub(original, mul(direction, space.baseRadius));
  let p = add(space.origin, add(mul(space.worldRight, x), mul(space.worldForward, z)));
  p = add(p, mul(space.worldUp, (Math.hypot(...original)-space.baseRadius)*RIDE_HEIGHT_SCALE + meadowRelief(x, z)));
  p = add(p, mul(add(mul(space.worldRight, dot(residual,space.domainRight)), mul(space.worldForward,dot(residual,space.domainForward))), .12));
  return mix(original, p, space.unfold);
}

export function sampleRideSurface(direction, time, params, space) {
  const d = unit(direction), raw = surfacePosition(d,time,params);
  const position = unfoldPosition(raw.position,d,space);
  const r = unit(cross(Math.abs(d[1])<.9 ? [0,1,0] : [1,0,0],d));
  const f = cross(d,r), epsilon = .012;
  const at = v => { const n=unit(v); return unfoldPosition(surfacePosition(n,time,params).position,n,space); };
  const along = sub(at(add(d,mul(r,epsilon))), at(add(d,mul(r,-epsilon))));
  const across = sub(at(add(d,mul(f,epsilon))), at(add(d,mul(f,-epsilon))));
  let normal = unit(cross(along,across));
  const outward = unit(mix(d,space.worldUp,space.unfold));
  if (dot(normal,outward)<0) normal=mul(normal,-1);
  return { position, normal, coverage:raw.coverage };
}

// The input/output position is the centre of the wheel-bottom plane, before
// the controller adds its small clearance and jump height. Solve the original
// moving surface beneath all four wheels rather than tilting toward one root.
export function fitBoardContact({
  direction, time, params = {}, space,
  position, forward, normal, normalWeight = 1, clearance = 0,
  halfWidth = .0399, halfLength = .0906,
}) {
  const d = unit(direction);
  const at = (a, b) => {
    const q = unit(add(d, add(mul(domainR, a), mul(domainF, b))));
    return unfoldPosition(surfacePosition(q, time, params).position, q, space);
  };
  const domainR = unit(cross(Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0], d));
  const domainF = cross(d, domainR);
  const anchor = at(0, 0), origin = position ? [...position] : [...anchor];
  const projectionUp = unit(mix(d, space.worldUp, space.unfold));
  const projectionRight = tangent(space.worldRight, projectionUp);
  const projectionForward = unit(cross(projectionRight, projectionUp));
  const components = v => [dot(v, projectionRight), dot(v, projectionForward)];
  const epsilon = .001;
  const a = components(mul(sub(at(epsilon, 0), at(-epsilon, 0)), .5 / epsilon));
  const b = components(mul(sub(at(0, epsilon), at(0, -epsilon)), .5 / epsilon));
  const determinant = a[0] * b[1] - a[1] * b[0];
  const invertible = Number.isFinite(determinant) && Math.abs(determinant) > .000001;
  const inverse = delta => invertible
    ? [(delta[0] * b[1] - delta[1] * b[0]) / determinant,
       (a[0] * delta[1] - a[1] * delta[0]) / determinant]
    : [0, 0];
  const offsets = [[-halfWidth, -halfLength], [halfWidth, -halfLength],
    [-halfWidth, halfLength], [halfWidth, halfLength]];
  let maxSolveError = 0;
  const underneath = wheel => {
    const initial = inverse(components(sub(wheel, anchor)));
    let x = clamp(initial[0], -.22, .22), z = clamp(initial[1], -.22, .22);
    // The unfolded chart has a nearly constant metric. Reusing this local
    // Jacobian costs far less than resampling both derivatives at every wheel.
    for (let i = 0; i < 3; i++) {
      const delta = inverse(components(sub(wheel, at(x, z))));
      x += clamp(delta[0], -.08, .08);
      z += clamp(delta[1], -.08, .08);
    }
    const point = at(x, z);
    maxSolveError = Math.max(maxSolveError, Math.hypot(...components(sub(wheel, point))));
    return point;
  };
  const sampleWheels = (n, f) => {
    const r = unit(cross(n, f));
    return offsets.map(([x, z]) => {
      const wheel = add(origin, add(mul(r, x), mul(f, z)));
      return { wheel, point: underneath(wheel) };
    });
  };
  const startNormal = normal ? unit(normal) : projectionUp;
  const startForward = tangent(forward || space.worldForward, startNormal);
  const initial = sampleWheels(startNormal, startForward);
  const across = sub(add(initial[1].point, initial[3].point), add(initial[0].point, initial[2].point));
  const along = sub(add(initial[2].point, initial[3].point), add(initial[0].point, initial[1].point));
  let fittedNormal = unit(cross(along, across), startNormal);
  if (dot(fittedNormal, projectionUp) < 0) fittedNormal = mul(fittedNormal, -1);
  const up = unit(mix(startNormal, fittedNormal, clamp(normalWeight, 0, 1)), fittedNormal);
  const fittedForward = tangent(startForward, up), right = unit(cross(up, fittedForward));
  const contacts = sampleWheels(up, fittedForward);
  const beforeGaps = contacts.map(({ wheel, point }) => dot(sub(wheel, point), projectionUp));
  const converged = invertible && maxSolveError < .002;
  // During the early spherical part of the approach this projection can be
  // multivalued. Leave the hidden rider's original pose alone until the local
  // patch has opened enough to admit a reliable four-wheel solve.
  if (!converged) {
    const gaps = initial.map(({ wheel, point }) => dot(sub(wheel, point), projectionUp));
    return { position: origin, normal: startNormal, forward: startForward,
      right: unit(cross(startNormal, startForward)), fittedNormal: startNormal,
      points: initial.map(({ point }) => point), gaps, lift: 0,
      maxPenetration: Math.max(0, -Math.min(...gaps)), maxSolveError, converged: false };
  }
  // Translation along the projection normal leaves all solved footprint
  // coordinates unchanged. The highest wheel support therefore guarantees no
  // wheel penetration even when the fitted orientation is being damped.
  const lift = clearance - Math.min(...beforeGaps);
  const contactPosition = add(origin, mul(projectionUp, lift));
  const gaps = beforeGaps.map(gap => gap + lift);
  return { position: contactPosition, normal: up, forward: fittedForward, right,
    fittedNormal, points: contacts.map(({ point }) => point), gaps, lift,
    maxPenetration: Math.max(0, -Math.min(...beforeGaps)), maxSolveError,
    converged };
}

// Find the same moving surface beneath a camera point. The open chart uses
// horizontal worldRight/worldForward coordinates; no second height field is
// introduced. Call only after the approached patch has substantially opened.
export function surfaceUnderPoint({ point, direction, time, params = {}, space }) {
  const d = unit(direction);
  const r = unit(cross(Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0], d));
  const f = cross(d, r);
  const at = (x, z) => {
    const q = unit(add(d, add(mul(r, x), mul(f, z))));
    return { direction: q, position: unfoldPosition(surfacePosition(q, time, params).position, q, space) };
  };
  const components = v => [dot(v, space.worldRight), dot(v, space.worldForward)];
  const anchor = at(0, 0), epsilon = .001;
  const a = components(mul(sub(at(epsilon, 0).position, at(-epsilon, 0).position), .5 / epsilon));
  const b = components(mul(sub(at(0, epsilon).position, at(0, -epsilon).position), .5 / epsilon));
  const determinant = a[0] * b[1] - a[1] * b[0];
  const invertible = Number.isFinite(determinant) && Math.abs(determinant) > .000001;
  const inverse = (delta, axisA = a, axisB = b, det = determinant) => Number.isFinite(det) && Math.abs(det) > .000001
    ? [(delta[0] * axisB[1] - delta[1] * axisB[0]) / det,
       (axisA[0] * delta[1] - axisA[1] * delta[0]) / det]
    : [0, 0];
  const initial = inverse(components(sub(point, anchor.position)));
  let x = clamp(initial[0], -1.5, 1.5), z = clamp(initial[1], -1.5, 1.5);
  for (let i = 0; i < 4; i++) {
    const axisA = components(mul(sub(at(x + epsilon, z).position, at(x - epsilon, z).position), .5 / epsilon));
    const axisB = components(mul(sub(at(x, z + epsilon).position, at(x, z - epsilon).position), .5 / epsilon));
    const det = axisA[0] * axisB[1] - axisA[1] * axisB[0];
    const delta = inverse(components(sub(point, at(x, z).position)), axisA, axisB, det);
    x += clamp(delta[0], -.35, .35);
    z += clamp(delta[1], -.35, .35);
  }
  const result = at(x, z);
  const maxSolveError = Math.hypot(...components(sub(point, result.position)));
  return { ...result, maxSolveError,
    converged: space.unfold > .60 && invertible && maxSolveError < .002 };
}
