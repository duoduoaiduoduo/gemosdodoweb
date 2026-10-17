// Articulated meadow skater. Geometry is local: Y up, +Z forward.
// RGB values in the returned mesh are LINEAR, ready for the HDR lighting pass.
// The board's wheel bottoms remain at Y=0; world jump height belongs to the game.
export const SKATER_VERTEX_STRIDE = 40;

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = v => Math.hypot(...v);
const unit = v => mul(v, 1 / Math.max(1e-20, length(v)));
const between = (a, b, t) => add(a, mul(sub(b, a), t));
const color = hex => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map(c => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
};
const tint = (c, f) => c.map(v => v * f);
const C = {
  skin: color('#c98d60'), skinWarm: color('#ce946b'), ear: color('#b97451'),
  cream: color('#ede8db'), seam: color('#d8d1bd'), collar: color('#e4dece'),
  shorts: color('#797b58'), shortsDark: color('#6b6e4c'), seamOlive: color('#626847'),
  hair: color('#52392b'), hairLight: color('#70503a'), hairDark: color('#36271f'),
  sole: color('#d3ccb8'), shoe: color('#b4b3a4'), shoeDark: color('#8f938a'),
  sock: color('#e4e4d7'), lace: color('#e9e5d6'),
  wood: color('#bf9862'), woodSide: color('#cda871'), ply: color('#99764a'),
  grip: color('#aa8656'), wheel: color('#b3a88c'), hub: color('#7a7566'),
  metal: color('#a7aaa0'), darkMetal: color('#56594f'), eye: color('#33291e'),
};

function rotation(rx = 0, ry = 0, rz = 0) {
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
  return v => {
    const y = v[1] * cx - v[2] * sx, z = v[1] * sx + v[2] * cx;
    const x = v[0] * cy + z * sy, zz = -v[0] * sy + z * cy;
    return [x * cz - y * sz, x * sz + y * cz, zz];
  };
}
const identity = { p: p => p, n: n => n };
function translatedFrame(origin, rotate) {
  const x = rotate([1, 0, 0]), y = rotate([0, 1, 0]), z = rotate([0, 0, 1]);
  return { o: origin, m: [...x, ...y, ...z], p: p => add(origin, rotate(p)), n: rotate };
}

// Cached regular sphere samples avoid evaluating thousands of trig functions
// when only the skeletal pose changes.
const spheres = new Map();
function sphereTemplate(lon, lat) {
  const key = `${lon}:${lat}`;
  if (spheres.has(key)) return spheres.get(key);
  const v = [];
  const point = (i, j) => {
    const theta = i * PI / lat, phi = j * TAU / lon;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
  };
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
    if (i !== 0) v.push(a, d, b);
    if (i !== lat - 1) v.push(b, d, c);
  }
  spheres.set(key, v);
  return v;
}

class Mesh {
  constructor(initial = null) {
    this.values = new Float32Array(75000 * 10);
    this.count = initial ? initial.length : 0;
    if (initial) this.values.set(initial);
  }
  vertex(p, n, c, material, frame = identity) {
    if (this.count + 10 > this.values.length) throw new RangeError('Skater mesh exceeds its vertex budget');
    const i = this.count, data = this.values, m = frame.m;
    if (m) {
      const o = frame.o;
      for (let k = 0; k < 3; k++) {
        data[i + k] = o[k] + m[k] * p[0] + m[k + 3] * p[1] + m[k + 6] * p[2];
        data[i + 3 + k] = m[k] * n[0] + m[k + 3] * n[1] + m[k + 6] * n[2];
      }
    } else {
      const pp = frame.p(p), nn = frame.n(n);
      data[i] = pp[0]; data[i + 1] = pp[1]; data[i + 2] = pp[2];
      data[i + 3] = nn[0]; data[i + 4] = nn[1]; data[i + 5] = nn[2];
    }
    data[i + 6] = c[0]; data[i + 7] = c[1]; data[i + 8] = c[2]; data[i + 9] = material;
    this.count += 10;
  }
  append(source, frame) {
    if (this.count + source.length > this.values.length) throw new RangeError('Skater mesh exceeds its vertex budget');
    const m = frame.m, o = frame.o, data = this.values;
    for (let i = 0; i < source.length; i += 10) {
      const j = this.count;
      for (let k = 0; k < 3; k++) {
        data[j + k] = o[k] + m[k] * source[i] + m[k + 3] * source[i + 1] + m[k + 6] * source[i + 2];
        data[j + 3 + k] = m[k] * source[i + 3] + m[k + 3] * source[i + 4] + m[k + 6] * source[i + 5];
      }
      data[j + 6] = source[i + 6]; data[j + 7] = source[i + 7]; data[j + 8] = source[i + 8]; data[j + 9] = source[i + 9];
      this.count += 10;
    }
  }
  finish() { return this.values.subarray(0, this.count); }
  triangle(a, b, c, normal, rgb, material, frame = identity) {
    this.vertex(a, normal, rgb, material, frame);
    this.vertex(b, normal, rgb, material, frame);
    this.vertex(c, normal, rgb, material, frame);
  }
  ellipsoid(center, radii, rgb, material = 0, frame = identity, lon = 12, lat = 7, rotate = null) {
    const r = rotate || (v => v);
    for (const v of sphereTemplate(lon, lat)) {
      const p = add(center, r([v[0] * radii[0], v[1] * radii[1], v[2] * radii[2]]));
      const n = r(unit([v[0] / radii[0], v[1] / radii[1], v[2] / radii[2]]));
      this.vertex(p, n, rgb, material, frame);
    }
  }
  // Smooth circular / elliptical tubing, with analytic taper in the normals.
  tube(points, radii, rgb, material = 0, segments = 10, frame = identity, flatten = 1, caps = true) {
    let previousU = null;
    const rings = points.map((p, i) => {
      const tangent = unit(sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]));
      const axisU = previousU ? unit(sub(previousU, mul(tangent, dot(previousU, tangent)))) :
        unit(cross(Math.abs(tangent[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0], tangent));
      previousU = axisU;
      const axisV = cross(tangent, axisU);
      const lo = Math.max(0, i - 1), hi = Math.min(points.length - 1, i + 1);
      const taper = (radii[lo] - radii[hi]) / Math.max(0.0001, length(sub(points[hi], points[lo])));
      return Array.from({ length: segments + 1 }, (_, j) => {
        const a = j * TAU / segments, co = Math.cos(a), si = Math.sin(a);
        const radial = add(mul(axisU, co), mul(axisV, si * flatten));
        const normal = unit(add(add(mul(axisU, co), mul(axisV, si / flatten)), mul(tangent, taper)));
        return { p: add(p, mul(radial, radii[i])), n: normal };
      });
    });
    const emit = v => this.vertex(v.p, v.n, rgb, material, frame);
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segments; j++) {
      const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
      emit(a); emit(d); emit(b); emit(b); emit(d); emit(c);
    }
    if (caps) for (const end of [0, points.length - 1]) {
      const normal = unit(sub(points[end], points[end === 0 ? 1 : end - 1]));
      for (let j = 0; j < segments; j++) {
        const a = rings[end][j].p, b = rings[end][j + 1].p;
        if (end === 0) this.triangle(points[end], b, a, normal, rgb, material, frame);
        else this.triangle(points[end], a, b, normal, rgb, material, frame);
      }
    }
  }
  cloth(rings, rgb, frame = identity, hem = false) {
    const segments = 48, rows = (rings.length - 1) * 3;
    const profile = u => {
      const v = clamp(u, 0, 1) * (rings.length - 1), i = Math.min(rings.length - 2, Math.floor(v)), t = v - i;
      const a = rings[Math.max(0, i - 1)], b = rings[i], c = rings[i + 1], d = rings[Math.min(rings.length - 1, i + 2)];
      return b.map((x, k) => 0.5 * (2 * x + (-a[k] + c[k]) * t +
        (2 * a[k] - 5 * x + 4 * c[k] - d[k]) * t * t + (-a[k] + 3 * x - 3 * c[k] + d[k]) * t * t * t));
    };
    const point = (u, phi) => {
      const r = profile(u);
      const fold = 1 + 0.009 * Math.sin(phi * 3 + u * 1.2) + 0.0035 * Math.cos(phi * 5 - u * 1.1);
      return [r[0] + Math.cos(phi) * r[3] * fold,
        r[1] + 0.0012 * Math.sin(phi * 3 + u * 0.7), r[2] + Math.sin(phi) * r[4] * fold];
    };
    const at = (u, phi) => {
      const p = point(u, phi);
      const du = sub(point(Math.min(1, u + 0.0001), phi), point(Math.max(0, u - 0.0001), phi));
      const dv = sub(point(u, phi + 0.0001), point(u, phi - 0.0001));
      return { p, n: unit(cross(du, dv)) };
    };
    const grid = Array.from({ length: rows + 1 }, (_, i) => Array.from({ length: segments + 1 }, (_, j) => at(i / rows, j * TAU / segments)));
    const emit = v => this.vertex(v.p, v.n, rgb, 0, frame);
    for (let i = 0; i < rows; i++) for (let j = 0; j < segments; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      emit(a); emit(b); emit(d); emit(b); emit(c); emit(d);
    }
    if (hem) for (let j = 0; j < segments; j++) {
      const a = grid[0][j].p, b = grid[0][j + 1].p;
      const inner = p => [mix(rings[0][0], p[0], 0.985), p[1] + 0.001, mix(rings[0][2], p[2], 0.985)];
      const c = inner(a), d = inner(b), n = unit(cross(sub(b, a), sub(c, a)));
      this.triangle(a, b, c, n, C.seam, 0, frame); this.triangle(b, d, c, n, C.seam, 0, frame);
    }
  }

}

function skateboard(mesh) {
  const lengthHalf = 0.51, halfWidth = 0.137, rows = 24, columns = 6;
  const deckPoint = (i, j, side) => {
    const z = mix(-lengthHalf, lengthHalf, i / rows);
    const roundedEnd = Math.max(0, (Math.abs(z) - 0.325) / 0.185);
    const width = halfWidth * Math.sqrt(Math.max(0.002, 1 - roundedEnd * roundedEnd));
    const x = width * mix(-1, 1, j / columns);
    const tip = Math.abs(z / lengthHalf);
    const y = 0.115 + 0.038 * tip ** 6 + (x / halfWidth) ** 2 * 0.003 + side * 0.0065;
    const dy = 0.038 * 6 * Math.sign(z) * tip ** 5 / lengthHalf;
    return { p: [x, y, z], n: unit([-side * 2 * x * 0.003 / halfWidth ** 2, side, -side * dy]) };
  };
  for (const side of [1, -1]) for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const a = deckPoint(i, j, side), b = deckPoint(i + 1, j, side), c = deckPoint(i + 1, j + 1, side), d = deckPoint(i, j + 1, side);
    const rgb = side > 0 ? tint(C.wood, 0.97 + 0.025 * Math.sin(j * 3 + i * 0.7)) : C.woodSide;
    const emit = v => mesh.vertex(v.p, v.n, rgb, 2);
    if (side > 0) { emit(a); emit(b); emit(d); emit(b); emit(c); emit(d); }
    else { emit(a); emit(d); emit(b); emit(b); emit(d); emit(c); }
  }
  // Three exposed maple ply laminations make the board read as real thickness.
  for (const edge of [0, columns]) for (let i = 0; i < rows; i++) {
    const a = deckPoint(i, edge, 1).p, b = deckPoint(i + 1, edge, 1).p;
    for (let layer = 0; layer < 3; layer++) {
      const aa = add(a, [0, -layer * 0.00433, 0]), bb = add(b, [0, -layer * 0.00433, 0]);
      const cc = add(bb, [0, -0.00433, 0]), dd = add(aa, [0, -0.00433, 0]);
      const sign = edge === 0 ? -1 : 1, delta = sub(bb, aa);
      const normal = unit([sign * delta[2], 0, -sign * delta[0]]);
      const rgb = layer % 2 ? C.ply : C.woodSide;
      if (sign > 0) {
        mesh.triangle(aa, bb, dd, normal, rgb, 2);
        mesh.triangle(bb, cc, dd, normal, rgb, 2);
      } else {
        mesh.triangle(aa, dd, bb, normal, rgb, 2);
        mesh.triangle(bb, dd, cc, normal, rgb, 2);
      }
    }
  }
  for (const z of [-0.302, 0.302]) {
    mesh.ellipsoid([0, 0.091, z], [0.045, 0.014, 0.039], C.darkMetal, 3, identity, 10, 5);
    mesh.tube([[0, 0.088, z + 0.008], [0, 0.067, z]], [0.019, 0.024], C.metal, 3, 10);
    mesh.tube([[-0.145, 0.044, z], [0.145, 0.044, z]], [0.009, 0.009], C.metal, 3, 10);
    for (const x of [-0.133, 0.133]) {
      mesh.ellipsoid([x, 0.044, z], [0.025, 0.044, 0.044], C.wheel, 2, identity, 16, 8);
      const outward = Math.sign(x);
      mesh.ellipsoid([x + outward * 0.023, 0.044, z], [0.003, 0.021, 0.021], C.hub, 3, identity, 10, 5);
      mesh.ellipsoid([x + outward * 0.027, 0.044, z], [0.003, 0.008, 0.008], C.metal, 3, identity, 8, 5);
    }
    for (const x of [-0.032, 0.032]) for (const dz of [-0.025, 0.025]) {
      mesh.ellipsoid([x, 0.122, z + dz], [0.003, 0.0015, 0.003], C.darkMetal, 3, identity, 6, 4);
    }
  }
}

function shoe(mesh, center, yaw) {
  const frame = translatedFrame(center, rotation(0, yaw, 0));
  // Rounded outsole, raised foxing, separate toe cap, tongue, heel and laces.
  mesh.ellipsoid([0, 0.012, 0.004], [0.055, 0.020, 0.113], C.sole, 2, frame, 14, 6);
  mesh.ellipsoid([0, 0.036, -0.008], [0.049, 0.043, 0.096], C.shoe, 2, frame, 14, 7);
  mesh.ellipsoid([0, 0.037, 0.066], [0.049, 0.025, 0.047], C.sole, 2, frame, 12, 6);
  mesh.ellipsoid([0, 0.059, -0.045], [0.039, 0.025, 0.039], C.shoeDark, 2, frame, 10, 5);
  mesh.ellipsoid([0, 0.062, 0.002], [0.026, 0.012, 0.057], C.shoeDark, 2, frame, 10, 5);
  for (let i = 0; i < 4; i++) {
    const z = -0.018 + i * 0.017;
    mesh.tube([[-0.027, 0.070, z - 0.005], [0, 0.076, z], [0.027, 0.070, z + 0.005]], [0.0025, 0.0025, 0.0025], C.lace, 2, 5, frame);
  }
  mesh.tube([[-0.044, 0.023, -0.063], [-0.050, 0.024, 0.003], [-0.043, 0.021, 0.075]], [0.002, 0.002, 0.002], C.lace, 2, 5, frame);
  mesh.tube([[0.044, 0.023, -0.063], [0.050, 0.024, 0.003], [0.043, 0.021, 0.075]], [0.002, 0.002, 0.002], C.lace, 2, 5, frame);
}

function hand(mesh, center, handedness, armDirection) {
  const down = unit(armDirection), across = unit(cross([0, 0, 1], down));
  const out = unit(cross(down, across));
  const frame = { p: v => add(center, add(add(mul(across, v[0]), mul(down, -v[1])), mul(out, v[2]))), n: v => add(add(mul(across, v[0]), mul(down, -v[1])), mul(out, v[2])) };
  mesh.ellipsoid([0, -0.015, 0], [0.031, 0.038, 0.019], C.skinWarm, 0, frame, 10, 6);
  for (let finger = 0; finger < 4; finger++) {
    const x = (finger - 1.5) * 0.014, len = [0.037, 0.043, 0.040, 0.031][finger];
    const p0 = [x, -0.039, 0.003], p1 = [x + x * 0.12, -0.039 - len * 0.64, 0.008], p2 = [x + x * 0.17, -0.039 - len, 0.020];
    mesh.tube([p0, p1, p2], [0.0073, 0.0068, 0.0045], C.skinWarm, 0, 6, frame);
    mesh.ellipsoid(p2, [0.0048, 0.006, 0.0048], C.skinWarm, 0, frame, 6, 4);
  }
  const s = handedness;
  mesh.tube([[s * 0.024, -0.014, 0.004], [s * 0.044, -0.027, 0.014], [s * 0.046, -0.045, 0.023]], [0.010, 0.009, 0.0055], C.skinWarm, 0, 7, frame);
}

function buildHead(mesh) {
  mesh.ellipsoid([0, -0.002, 0.005], [0.113, 0.142, 0.110], C.skinWarm, 0, identity, 20, 13);
  mesh.ellipsoid([0, -0.077, 0.024], [0.079, 0.057, 0.080], C.skinWarm, 0, identity, 16, 8);
  for (const side of [-1, 1]) {
    mesh.ellipsoid([side * 0.112, -0.024, -0.003], [0.021, 0.033, 0.020], C.skin, 0, identity, 12, 7);
    mesh.ellipsoid([side * 0.128, -0.023, 0.006], [0.004, 0.017, 0.010], C.ear, 0, identity, 8, 5);
    mesh.ellipsoid([side * 0.044, 0.008, 0.108], [0.014, 0.006, 0.004], C.eye, 0, identity, 8, 5);
    mesh.tube([[side * 0.024, 0.031, 0.104], [side * 0.044, 0.036, 0.108], [side * 0.060, 0.031, 0.101]], [0.002, 0.003, 0.0015], C.hair, 1, 5);
  }
  mesh.ellipsoid([0, -0.020, 0.113], [0.014, 0.018, 0.020], C.skin, 0, identity, 12, 7);
  mesh.tube([[-0.021, -0.061, 0.102], [0, -0.065, 0.108], [0.021, -0.061, 0.102]], [0.0015, 0.002, 0.0015], C.ear, 0, 6);

  // The scalp and overlapping flattened clumps share one swept-back flow.
  const scalpPoint = (n, lift = 0) => [n[0] * (0.136 + lift), 0.027 + n[1] * (0.149 + lift), -0.012 + n[2] * (0.131 + lift)];
  const scalp = (theta, phi) => {
    const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
    const lift = 0.0015 * Math.sin(phi * 5 + theta * 2) + 0.0008 * Math.sin(phi * 9 - theta * 3);
    return scalpPoint(n, lift);
  };
  const scalpVertex = (row, col) => {
    const phi = col * TAU / 38, back = 0.5 - 0.5 * Math.sin(phi);
    const theta = 0.001 + row / 18 * (1.43 + back);
    const p = scalp(theta, phi);
    const n = unit(cross(sub(scalp(theta, phi + 0.0001), scalp(theta, phi - 0.0001)), sub(scalp(theta + 0.0001, phi), scalp(theta - 0.0001, phi))));
    return { p, n };
  };
  const capGrid = Array.from({ length: 19 }, (_, i) => Array.from({ length: 39 }, (_, j) => scalpVertex(i, j)));
  for (let i = 0; i < 18; i++) for (let j = 0; j < 38; j++) {
    const a = capGrid[i][j], b = capGrid[i + 1][j], c = capGrid[i + 1][j + 1], d = capGrid[i][j + 1];
    for (const v of [a, d, b, b, d, c]) mesh.vertex(v.p, v.n, tint(C.hair, 0.89), 1);
  }
  for (let i = 0; i < 82; i++) {
    const phi = i * 2.3999632297;
    const thetaMax = 1.43 + 0.5 - 0.5 * Math.sin(phi);
    const theta = 0.12 + (thetaMax - 0.22) * Math.sqrt((i + 0.5) / 82);
    const root = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
    const flow = [0.12 + 0.16 * Math.sin(i * 2.13), 0.24 + 0.08 * Math.sin(i * 3.73), -1];
    const projected = unit(sub(flow, mul(root, dot(flow, root))));
    const direction = unit(add(projected, mul(cross(root, projected), 0.32 * Math.sin(i * 2.37))));
    const arc = 0.53 + 0.13 * (0.5 + 0.5 * Math.sin(i * 1.71));
    const width = 0.016 + 0.004 * (0.5 + 0.5 * Math.sin(i * 2.61));
    const liftTip = Math.max(0, root[1]) * (0.5 + 0.5 * Math.sin(i * 3.1));
    const centerAt = t => {
      const a = arc * t;
      const n = unit(add(mul(root, Math.cos(a)), mul(direction, Math.sin(a))));
      const lift = 0.001 + 0.0075 * Math.sin(PI * t) + (0.008 + 0.024 * liftTip) * t ** 3;
      return { p: scalpPoint(n, lift), n: unit([n[0] / 0.136, n[1] / 0.149, n[2] / 0.131]) };
    };
    const point = (t, angle) => {
      const c = centerAt(t);
      const tangent = unit(sub(centerAt(Math.min(1, t + 0.0001)).p, centerAt(Math.max(0, t - 0.0001)).p));
      const side = unit(cross(c.n, tangent));
      const taper = Math.max(0.015, 1 - 0.985 * t ** 1.08);
      const w = width * (0.78 + 0.28 * Math.sin(PI * t)) * taper;
      const h = (0.0032 + 0.0006 * Math.sin(i)) * taper;
      const ridge = 1 + 0.08 * Math.cos(angle * 3 + t * 0.4);
      return add(c.p, add(mul(side, Math.cos(angle) * w), mul(c.n, Math.sin(angle) * h * ridge)));
    };
    const at = (t, angle) => {
      const du = sub(point(Math.min(1, t + 0.0001), angle), point(Math.max(0, t - 0.0001), angle));
      const dv = sub(point(t, angle + 0.0001), point(t, angle - 0.0001));
      return { p: point(t, angle), n: unit(cross(dv, du)) };
    };
    const grid = Array.from({ length: 7 }, (_, row) => Array.from({ length: 9 }, (_, col) => at(row / 6, col * TAU / 8)));
    const rgb = tint(C.hair, 0.92 + 0.14 * (0.5 + 0.5 * Math.sin(i * 1.37)));
    for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
      const a = grid[row][col], b = grid[row + 1][col], c = grid[row + 1][col + 1], d = grid[row][col + 1];
      for (const v of [a, d, b, b, d, c]) mesh.vertex(v.p, v.n, rgb, 1);
    }
    const end = centerAt(1).p;
    const tangent = unit(sub(end, centerAt(0.99).p));
    for (let col = 0; col < 8; col++) mesh.triangle(end, grid[6][col].p, grid[6][col + 1].p, tangent, rgb, 1);
  }
  // A few fine wisps soften only the silhouette; they remain close to the clumps.
  for (let i = 0; i < 8; i++) {
    const phi = i * 2.3999632297, theta = 0.32 + (i % 4) * 0.21;
    const root = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
    const flow = unit(sub([0.13, 0.2, -1], mul(root, dot([0.13, 0.2, -1], root))));
    const points = [], radii = [];
    for (let j = 0; j < 5; j++) {
      const t = j / 4, a = 0.57 * t, n = unit(add(mul(root, Math.cos(a)), mul(flow, Math.sin(a))));
      points.push(scalpPoint(n, 0.006 + 0.008 * Math.sin(t * PI * 0.8))); radii.push(0.0008 * (1 - t * 0.9));
    }
    mesh.tube(points, radii, C.hairLight, 1, 4);
  }

}

const FRONT_FOOT = [-0.025, 0.130, 0.225];
const REAR_FOOT = [0.024, 0.130, -0.229];
let boardMesh = null, shoeMesh = null, headMesh = null;

export function getSkateboardMesh() {
  if (!boardMesh) { const mesh = new Mesh(); skateboard(mesh); boardMesh = mesh.finish().slice(); }
  return boardMesh;
}

// Keys describe one complete rear-foot push, including a supported return.
const PUSH_KEYS = [
  [0.00, ...REAR_FOOT, 0.00], [0.12, 0.125, 0.184, -0.197, -0.14],
  [0.28, 0.238, 0.022, 0.015, 0.04], [0.51, 0.225, 0.017, -0.383, 0.16],
  [0.65, 0.193, 0.126, -0.460, 0.35], [0.82, 0.092, 0.254, -0.297, -0.22],
  [1.00, ...REAR_FOOT, 0.00],
];
function pushFoot(phase) {
  let i = 0;
  while (i < PUSH_KEYS.length - 2 && phase > PUSH_KEYS[i + 1][0]) i++;
  const a = PUSH_KEYS[i], b = PUSH_KEYS[i + 1];
  const span = b[0] - a[0], t = clamp((phase - a[0]) / span, 0, 1);
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
  return [1, 2, 3, 4].map(k => {
    const before = PUSH_KEYS[Math.max(0, i - 1)], after = PUSH_KEYS[Math.min(PUSH_KEYS.length - 1, i + 2)];
    const ma = i === 0 ? 0 : (b[k] - before[k]) / (b[0] - before[0]);
    const mb = i + 1 === PUSH_KEYS.length - 1 ? 0 : (after[k] - a[k]) / (after[0] - a[0]);
    return h00 * a[k] + h10 * ma * span + h01 * b[k] + h11 * mb * span;
  });
}
function kneePosition(hip, ankle, forward) {
  const delta = sub(ankle, hip), distance = length(delta), axis = unit(delta);
  const upper = 0.305, lower = 0.305;
  const d = Math.min(distance, upper + lower - 0.001);
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const bend = unit(sub(forward, mul(axis, dot(forward, axis))));
  const radius = Math.sqrt(Math.max(0, upper * upper - along * along));
  return add(add(hip, mul(axis, along)), mul(bend, radius));
}

export function buildSkaterMesh({ time = 0, lean = 0, jump = 0, speed = 0, slope = 0, push = 0 } = {}) {
  time = Number.isFinite(time) ? time : 0;
  lean = clamp(Number.isFinite(lean) ? lean : 0, -1, 1);
  jump = clamp(Number.isFinite(jump) ? jump : 0, 0, 1);
  speed = clamp(Number.isFinite(speed) ? speed : 0, 0, 30);
  slope = clamp(Number.isFinite(slope) ? slope : 0, -0.7, 0.7);
  push = clamp(Number.isFinite(push) ? push : 0, 0, 1);
  if (!boardMesh) {
    const fixed = new Mesh(); skateboard(fixed); boardMesh = fixed.finish().slice();
    const footwear = new Mesh(); shoe(footwear, [0, 0, 0], 0); shoeMesh = footwear.finish().slice();
    const portrait = new Mesh(); buildHead(portrait); headMesh = portrait.finish().slice();
  }
  const mesh = new Mesh(boardMesh);
  const cruising = speed * speed / (speed * speed + 8);
  const pushWeight = Math.sin(PI * push) ** 2;
  const sway = Math.sin(time * 1.7) * 0.007 * cruising;
  const road = Math.sin(time * (3.1 + speed * 0.09)) * Math.min(0.0045, speed * 0.0006);
  const hip = [lean * 0.055 - pushWeight * 0.021 + sway,
    0.719 - cruising * 0.047 - jump * 0.105 - pushWeight * 0.110 + road,
    -0.018 + cruising * 0.010 + pushWeight * 0.016];
  const bodyRoll = -lean * 0.18 - sway * 0.9;
  const hipFrame = translatedFrame(hip, rotation(0.065 + pushWeight * 0.04, 0.91 - pushWeight * 0.07, bodyRoll * 0.7));
  const bodyPitch = 0.165 + cruising * 0.095 + pushWeight * 0.055 + jump * 0.09 - slope * 0.04;
  const body = translatedFrame(hip, rotation(bodyPitch, 0.27 + pushWeight * 0.075 + lean * 0.06, bodyRoll));
  const rear = pushFoot(push);
  const co = Math.cos(rear[3]), si = Math.sin(rear[3]);
  const soleMinimum = 0.012 * co - 0.004 * si - Math.hypot(0.020 * co, 0.113 * si);
  rear[1] = Math.max(rear[1], 0.0015 - soleMinimum);
  const rearPosition = rear.slice(0, 3);
  const frontFrame = translatedFrame(FRONT_FOOT, rotation(0, 1.03, 0));
  const rearFrame = translatedFrame(rearPosition, rotation(rear[3], 1.17 - pushWeight * 0.13, 0));
  mesh.append(shoeMesh, frontFrame); mesh.append(shoeMesh, rearFrame);

  for (const [side, foot] of [[-1, frontFrame], [1, rearFrame]]) {
    const hipJoint = hipFrame.p([side * 0.088, -0.018, 0]);
    const ankle = foot.p([0, 0.081, -0.042]);
    const knee = kneePosition(hipJoint, ankle, foot.n([0, 0, 1]));
    const skinStart = between(hipJoint, knee, 0.58);
    mesh.tube([skinStart, between(hipJoint, knee, 0.84), knee,
      between(knee, ankle, 0.20), between(knee, ankle, 0.49), between(knee, ankle, 0.77), ankle],
      [0.052, 0.051, 0.049, 0.047, 0.042, 0.033, 0.027], C.skinWarm, 0, 16);
    const sockTop = between(ankle, knee, 0.28);
    mesh.tube([ankle, between(ankle, sockTop, 0.42), between(ankle, sockTop, 0.9), sockTop],
      [0.029, 0.030, 0.033, 0.032], C.sock, 0, 14);
    mesh.tube([between(ankle, sockTop, 0.9), sockTop], [0.033, 0.033], C.lace, 0, 14);
    const shortEnd = between(hipJoint, knee, 0.83);
    const shortPath = [hipJoint, ...[0.08, 0.17, 0.29, 0.40, 0.53, 0.65, 0.75].map(t => between(hipJoint, knee, t)), shortEnd];
    mesh.tube(shortPath, [0.108, 0.109, 0.109, 0.108, 0.104, 0.099, 0.093, 0.085, 0.080], C.shorts, 0, 24, identity, 0.95);
    mesh.tube([between(hipJoint, knee, 0.79), shortEnd], [0.081, 0.080], C.shortsDark, 0, 24, identity, 0.95);
    const outward = hipFrame.n([side * 0.075, -0.006, -0.029]);
    const pocketA = add(between(hipJoint, knee, 0.19), outward);
    const pocketB = add(between(hipJoint, knee, 0.39), outward);
    mesh.tube([add(pocketA, hipFrame.n([0, 0.016, 0])), pocketA, pocketB], [0.0014, 0.0016, 0.0014], C.seamOlive, 0, 5);
  }
  mesh.cloth([
    [0, -0.080, 0, 0.136, 0.102], [0, -0.045, 0, 0.163, 0.113],
    [0, 0.010, 0, 0.165, 0.117], [0, 0.065, 0, 0.149, 0.108],
  ], C.shorts, hipFrame);
  for (const side of [-1, 1]) {
    mesh.tube([[side * 0.119, 0.032, -0.088], [side * 0.085, 0.024, -0.115], [side * 0.042, 0.027, -0.108]],
      [0.0015, 0.0015, 0.0015], C.seamOlive, 0, 5, hipFrame);
  }

  const hemWave = Math.sin(time * 2.8) * 0.004 * cruising;
  mesh.cloth([
    [0, 0.036, -0.008, 0.193, 0.139], [0, 0.048, -0.008, 0.197, 0.140],
    [0, 0.075, -0.007, 0.194, 0.136], [0, 0.130, -0.006, 0.182, 0.126],
    [0, 0.198, 0, 0.182, 0.122], [0, 0.265, 0.002, 0.198, 0.119],
    [0, 0.314, 0.003, 0.207, 0.113], [0, 0.347, 0.005, 0.181, 0.102],
    [0, 0.374, 0.006, 0.112, 0.080], [0, 0.385, 0.006, 0.065, 0.058],
  ].map((ring, i) => [ring[0], ring[1] + (1 - i / 9) * hemWave, ring[2], ring[3], ring[4]]), C.cream, body, true);
  mesh.tube([[0, 0.370, 0.006], [0, 0.455, 0.012]], [0.051, 0.046], C.skinWarm, 0, 16, body);
  for (let j = 0; j < 22; j++) {
    const a = j * TAU / 22, b = (j + 1) * TAU / 22;
    mesh.tube([[Math.cos(a) * 0.065, 0.384, Math.sin(a) * 0.058 + 0.006], [Math.cos(b) * 0.065, 0.384, Math.sin(b) * 0.058 + 0.006]],
      [0.0038, 0.0038], C.collar, 0, 5, body);
  }
  for (const side of [-1, 1]) {
    const balance = side * lean;
    const natural = Math.sin(time * 1.75 + side * 0.7) * 0.008 * cruising;
    const counter = side * pushWeight;
    const shoulder = [side * 0.120, 0.270, 0.003];
    const sleeveEnd = [side * (0.273 + pushWeight * 0.005), 0.250 + balance * 0.024 + counter * 0.008, -0.007];
    const elbow = [side * (0.337 + cruising * 0.010 + jump * 0.024), 0.166 + balance * 0.072 + counter * 0.019, -0.035 + natural - counter * 0.023];
    const wrist = [side * (0.392 + jump * 0.028), 0.057 + balance * 0.112 + jump * 0.055 + counter * 0.040,
      -0.047 - cruising * 0.023 - natural - counter * 0.047];
    mesh.tube([shoulder, between(shoulder, sleeveEnd, 0.40), between(shoulder, sleeveEnd, 0.78), sleeveEnd],
      [0.090, 0.091, 0.086, 0.075], C.cream, 0, 18, body, 0.96, false);
    mesh.tube([between(shoulder, sleeveEnd, 0.94), sleeveEnd], [0.077, 0.076], C.seam, 0, 18, body, 0.96);
    mesh.tube([between(shoulder, sleeveEnd, 0.84), sleeveEnd, between(sleeveEnd, elbow, 0.55), elbow,
      between(elbow, wrist, 0.30), between(elbow, wrist, 0.72), wrist],
      [0.043, 0.043, 0.041, 0.036, 0.034, 0.027, 0.022], C.skinWarm, 0, 16, body);
    hand(mesh, body.p(wrist), side, body.n(sub(wrist, elbow)));
  }
  const headTurn = rotation(-0.10 - pushWeight * 0.025, 0.025 * Math.sin(time * 0.55) - lean * 0.035, lean * 0.045);
  mesh.append(headMesh, translatedFrame(body.p([0, 0.527, 0.015]), v => body.n(headTurn(v))));
  return mesh.finish();
}
