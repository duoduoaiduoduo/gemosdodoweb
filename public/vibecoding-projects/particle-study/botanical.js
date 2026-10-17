// Indexed botanical surfaces. Indices remain local to each instanced plant.
export const GRASS_VERTEX_COUNT = 70;
export const FLOWER_VERTEX_COUNT = 183;

function gridIndices(output, base, rows, columns) {
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = base + row * columns + column;
      const b = a + 1, c = a + columns, d = c + 1;
      output.push(a, b, c, c, b, d);
    }
  }
}
const grass = [];
for (let blade = 0; blade < 5; blade++) gridIndices(grass, blade * 14, 7, 2);
export const GRASS_INDICES = new Uint16Array(grass);

const flowers = [];
// Three rings, four sides: two genuinely bent stem segments.
for (let ring = 0; ring < 2; ring++) {
  for (let side = 0; side < 4; side++) {
    const a = ring * 4 + side, b = ring * 4 + (side + 1) % 4;
    const c = a + 4, d = b + 4;
    flowers.push(a, b, c, c, b, d);
  }
}
// A petal's width runs from -1 to +1. Swap grid winding to face the cup upward.
for (let petal = 0; petal < 6; petal++) {
  const local = [];
  gridIndices(local, 12 + petal * 21, 7, 3);
  for (let i = 0; i < local.length; i += 3) flowers.push(local[i], local[i + 2], local[i + 1]);
}
const diskBase = 138;
for (let segment = 0; segment < 12; segment++) flowers.push(diskBase, diskBase + 1 + segment, diskBase + 1 + (segment + 1) % 12);
for (let grain = 0; grain < 6; grain++) {
  const base = 151 + grain * 4;
  for (const index of [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]) flowers.push(base + index);
}
for (let sepal = 0; sepal < 2; sepal++) {
  const base = 175 + sepal * 4;
  flowers.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
export const FLOWER_INDICES = new Uint16Array(flowers);

export const botanicalWGSL = /* wgsl */ `
struct BotanicalVertex {
  position: vec3f,
  normal: vec3f,
  uv: vec2f,
  color: vec3f,
  part: f32,
  visibility: f32,
  seed: f32,
};
struct BotanicalFrame {
  root: vec3f,
  growth: vec3f,
  bend: vec3f,
  across: vec3f,
  headCenter: vec3f,
  headUp: vec3f,
  headX: vec3f,
  headY: vec3f,
  stemP1: vec3f,
  stemP2: vec3f,
  wind: vec3f,
  windPulse: f32,
  flowerOpen: f32,
  radius: f32,
  height: f32,
  headRadius: f32,
  stemBend: f32,
  r0: f32,
  r1: f32,
  r2: f32,
  r3: f32,
};

fn botanicalNormal(vector: vec3f, fallback: vec3f) -> vec3f {
  let lengthSquared = dot(vector,vector);
  // Finite-difference tangents are deliberately tiny in world units. Preserve
  // their direction instead of flattening their cross product to the fallback.
  return select(fallback,vector*inverseSqrt(max(lengthSquared,1e-30)),lengthSquared>1e-28);
}
struct BotanicalLeafSurface {
  position: vec3f,
  normal: vec3f,
};

fn botanicalRotate(vector: vec3f) -> vec3f {
  return mix(vector,u.worldRight.xyz*vector.x+u.worldUp.xyz*vector.y+u.worldForward.xyz*vector.z,u.rideOrigin.w);
}
fn botanicalFrame(particle: Particle, instance: u32) -> BotanicalFrame {
  let identity = instance*37u+113u;
  var frame: BotanicalFrame;
  frame.r0 = random(identity); frame.r1 = random(identity+1u);
  frame.r2 = random(identity+2u); frame.r3 = random(identity+3u);
  frame.radius = max(particle.position.w,0.0);
  frame.root = particle.position.xyz;
  let worldUp = botanicalRotate(vec3f(0.0,1.0,0.0));
  frame.growth = botanicalNormal(worldUp*0.80+particle.normal.xyz*0.34,worldUp);
  let azimuth = frame.r0*6.28318530718;
  let radial = botanicalRotate(vec3f(cos(azimuth),0.0,sin(azimuth)));
  frame.bend = botanicalNormal(radial-frame.growth*dot(radial,frame.growth),vec3f(1.0,0.0,0.0));
  frame.across = botanicalNormal(cross(frame.growth,frame.bend),vec3f(0.0,0.0,1.0));
  frame.height = frame.radius*mix(10.4,15.6,frame.r1)*mix(1.0,1.18*0.62,u.rideOrigin.w);
  let contactDelta=frame.root-u.riderContact.xyz;
  let contactPlanar=contactDelta-worldUp*dot(contactDelta,worldUp);
  let contact=1.0-smoothstep(0.07,0.19,length(contactPlanar));
  let contactWeight=contact*u.riderContact.w*u.rideOrigin.w;
  frame.height*=mix(1.0,0.22,contactWeight);
  frame.bend=botanicalNormal(frame.bend+contactPlanar*contactWeight*5.0,frame.bend);
  // Wind is sampled in the object's world domain, then transformed with it.
  // Nearby tufts therefore share a breeze even while the camera is dragged.
  let worldRoot = frame.root;
  let region = noise(worldRoot*1.8+vec3f(2.8,1.3,4.7));
  let windAngle = 0.72+region*2.6+0.12*sin(u.viewport.z*0.30+region*3.0);
  let windWorld = botanicalRotate(vec3f(cos(windAngle),0.0,sin(windAngle)));
  frame.wind = botanicalNormal(windWorld-frame.growth*dot(windWorld,frame.growth),frame.bend);
  let windPhase = u.viewport.z*0.78+dot(worldRoot,vec3f(1.8,0.35,1.1));
  frame.windPulse = 0.055*sin(windPhase)+0.020*sin(windPhase*1.73+0.40);

  // Flower height, diameter and pose use independent stable identities.
  let pose = random(instance*83u+877u);
  let flowerSize = random(instance*137u+593u);
  let stemHeight = frame.height*mix(0.79,1.27,random(instance*61u+227u));
  let tilt = mix(0.10,1.80,pow(pose,0.88));
  let heading = random(instance*47u+367u)*6.28318530718;
  let flowerLean = frame.bend*cos(heading)+frame.across*sin(heading);
  frame.headUp = botanicalNormal(frame.growth*cos(tilt)+flowerLean*sin(tilt),frame.growth);
  // This axis stays perpendicular throughout upright, sideways and nodding poses.
  frame.headX = botanicalNormal(cross(frame.growth,flowerLean),frame.across);
  frame.headY = botanicalNormal(cross(frame.headUp,frame.headX),frame.bend);
  frame.headCenter = frame.root+frame.growth*(stemHeight*(0.88+0.10*cos(tilt)))
    +flowerLean*(stemHeight*(0.12+0.16*sin(tilt)));
  frame.stemP1 = frame.root+frame.growth*(stemHeight*0.40)+flowerLean*(stemHeight*0.02);
  frame.stemP2 = frame.headCenter-frame.headUp*(stemHeight*0.20);
  frame.stemBend = 0.0;
  frame.flowerOpen = mix(0.24,1.0,pow(random(instance*101u+433u),0.68));
  let diameterScale = 0.48+1.10*pow(flowerSize,2.2);
  frame.headRadius = frame.radius*mix(2.45,3.12,frame.r2)*diameterScale*mix(1.0,1.40,u.rideOrigin.w);
  return frame;
}

// Fine tufts mix gently arched leaves with drooping tips.
fn botanicalLeafSurface(frame: BotanicalFrame, instance: u32, blade: u32, t: f32, w: f32) -> BotanicalLeafSurface {
  let bladeSeed = random(instance*53u+blade*17u+709u);
  let widthSeed = random(instance*73u+blade*23u+811u);
  let angle = f32(blade)*2.39996323+frame.r2*0.65;
  let individual = frame.bend*cos(angle)+frame.across*sin(angle);
  let windWeight = 0.22+frame.windPulse*0.70;
  let lean = botanicalNormal(individual*0.90+frame.wind*windWeight,individual);
  let across = botanicalNormal(cross(frame.growth,lean),frame.across);
  let longLeaf = smoothstep(0.82,0.99,bladeSeed);
  let lengthRatio = mix(0.36+0.26*bladeSeed,0.95,longLeaf);
  let leafLength = frame.height*lengthRatio*1.15;
  let curvature = 0.30+0.60*bladeSeed+frame.windPulse;
  let droop = 0.16+0.46*widthSeed;
  let twistAmount = (frame.r3-0.5)*0.95+(widthSeed-0.5)*0.25;
  let twist = twistAmount*t+0.16*sin(t*3.14159265);
  let side = across*cos(twist)+lean*sin(twist);
  let baseWidth = frame.radius*mix(0.28,0.55,widthSeed)*mix(1.0,0.70,u.rideOrigin.w);
  let widthProfile = (0.50+0.50*sin(t*3.14159265))*pow(max(0.0,1.0-t),0.75);
  let width = baseWidth*widthProfile;
  let upAmount = t-droop*pow(t,4.0);
  let bendAmount = 0.10*t+curvature*t*t;
  let keel = -frame.radius*0.055*w*w*(1.0-0.65*t)*sin(t*2.4+0.30);
  var surface: BotanicalLeafSurface;
  surface.position = frame.root+individual*(frame.radius*(f32(blade)-2.0)*0.13)
    +frame.growth*(leafLength*upAmount)+lean*(leafLength*bendAmount)+side*(width*w)+frame.growth*keel;

  // Analytic tangents avoid evaluating five full leaf shapes per cached vertex.
  let q = clamp(t,0.012,0.988);
  let tq = twistAmount*q+0.16*sin(q*3.14159265);
  let sq = across*cos(tq)+lean*sin(tq);
  let ds = (-across*sin(tq)+lean*cos(tq))*(twistAmount+0.16*3.14159265*cos(q*3.14159265));
  let oneMinus = max(1.0-q,0.012);
  let envelope = 0.50+0.50*sin(q*3.14159265);
  let qw = baseWidth*envelope*pow(oneMinus,0.75);
  let dw = baseWidth*(0.50*3.14159265*cos(q*3.14159265)*pow(oneMinus,0.75)-envelope*0.75*pow(oneMinus,-0.25));
  let k = frame.radius*0.055;
  let dkdt = -k*w*w*(-0.65*sin(q*2.4+0.30)+(1.0-0.65*q)*2.4*cos(q*2.4+0.30));
  let dkdw = -k*2.0*w*(1.0-0.65*q)*sin(q*2.4+0.30);
  let tangent = frame.growth*(leafLength*(1.0-4.0*droop*pow(q,3.0)))
    +lean*(leafLength*(0.10+2.0*curvature*q))+ds*(qw*w)+sq*(dw*w)+frame.growth*dkdt;
  let transverse = sq*qw+frame.growth*dkdw;
  surface.normal = botanicalNormal(cross(transverse,tangent),frame.across);
  return surface;
}

fn botanicalStemCenter(frame: BotanicalFrame, t: f32) -> vec3f {
  let a = 1.0-t;
  return frame.root*(a*a*a)+frame.stemP1*(3.0*a*a*t)+frame.stemP2*(3.0*a*t*t)+frame.headCenter*(t*t*t);
}
fn botanicalStemTangent(frame: BotanicalFrame, t: f32) -> vec3f {
  let a = 1.0-t;
  return (frame.stemP1-frame.root)*(3.0*a*a)+(frame.stemP2-frame.stemP1)*(6.0*a*t)
    +(frame.headCenter-frame.stemP2)*(3.0*t*t);
}

// Smooth, asymmetric petal surfaces. A broad rounded cap replaces the old diamond.
fn botanicalPetalPoint(frame: BotanicalFrame, instance: u32, petal: u32, petalCount: u32, t: f32, w: f32) -> vec3f {
  let identity = instance*97u+petal*19u+331u;
  let p0 = random(identity); let p1 = random(identity+1u); let p2 = random(identity+2u);
  let angle = f32(petal)*6.28318530718/f32(petalCount)+frame.r0*1.1+(p0-0.5)*0.12;
  let along = frame.headX*cos(angle)+frame.headY*sin(angle);
  let across = -frame.headX*sin(angle)+frame.headY*cos(angle);
  let profile = pow(max(0.0,sin(t*3.14159265)),0.43)*smoothstep(0.0,0.23,t);
  let width = frame.headRadius*mix(0.31,0.395,p1)*profile;
  let length = frame.headRadius*mix(0.90,1.12,p0);
  let sideAsymmetry = 1.0+0.105*(p2-0.5)*w+0.035*sin(t*8.0+p0*5.0);
  let overlap = frame.headRadius*(p1-0.5)*0.055*w*sin(t*3.14159265);
  let openness = frame.flowerOpen;
  let radialSpread = mix(0.55,1.0,openness);
  let cup = (0.16+0.58*(1.0-openness))*t*t;
  let edgeCurl = mix(0.15,0.30,p2)*w*w*pow(max(0.0,sin(t*3.14159265)),0.70);
  let tipCurl = (p1-0.40)*0.38*pow(smoothstep(0.66,1.0,t),2.0);
  let softArch = 0.095*sin(t*3.14159265);
  return frame.headCenter+along*((length*(0.065+0.935*t)+overlap)*radialSpread)
    +across*(width*w*sideAsymmetry*mix(0.75,1.0,openness))+frame.headUp*(frame.headRadius*(cup+edgeCurl+tipCurl+softArch));
}

fn makeBotanicalVertex(particle: Particle, instance: u32, vertexIndex: u32, flower: bool) -> BotanicalVertex {
  let frame = botanicalFrame(particle,instance);
  var result: BotanicalVertex;
  result.position = frame.root;
  result.normal = frame.growth;
  result.uv = vec2f(0.0);
  result.color = particle.color.rgb;
  result.part = 0.0;
  result.visibility = particle.material.x;
  result.seed = frame.r2;

  if (!flower) {
    let blade = vertexIndex/14u;
    let point = vertexIndex%14u;
    let row = point/2u;
    let column = point%2u;
    let longitudinal = array<f32,7>(0.0,0.16,0.34,0.52,0.70,0.86,1.0);
    let t = longitudinal[row];
    let w = f32(column)*2.0-1.0;
    let surface = botanicalLeafSurface(frame,instance,blade,t,w);
    result.position = surface.position;
    result.normal = surface.normal;
    result.uv = vec2f(w,t);
    let bladeVariation = mix(0.88,1.10,random(instance*53u+blade*17u+709u));
    let rootTint = vec3f(0.53,0.66,0.46);
    let tipTint = vec3f(1.78,1.13,0.62);
    result.color *= mix(rootTint,tipTint,pow(t,0.72))*bladeVariation;
    result.visibility = mix(particle.material.x*0.86,particle.material.x,smoothstep(0.0,0.72,t));
    return result;
  }

  let petalCount = select(5u,6u,frame.r3>0.47);
  if (vertexIndex<12u) {
    result.part = 1.0;
    let ring = vertexIndex/4u;
    let side = vertexIndex%4u;
    let t = f32(ring)*0.5;
    let tangent = botanicalNormal(botanicalStemTangent(frame,t),frame.growth);
    let radialX = frame.headX;
    let radialY = botanicalNormal(cross(tangent,radialX),frame.across);
    let angle = f32(side)*1.57079632679;
    let radial = radialX*cos(angle)+radialY*sin(angle);
    let width = frame.radius*mix(0.16,0.092,t);
    result.position = botanicalStemCenter(frame,t)+radial*width;
    result.normal = radial;
    result.uv = vec2f(f32(side)/4.0,t);
    result.color *= vec3f(0.60,0.78,0.40);
    return result;
  }

  if (vertexIndex<138u) {
    result.part = 2.0;
    let local = vertexIndex-12u;
    let petal = local/21u;
    let point = local%21u;
    let longitudinal = array<f32,7>(0.0,0.16,0.40,0.64,0.82,0.95,1.0);
    let t = longitudinal[point/3u];
    let w = f32(point%3u)-1.0;
    result.position = botanicalPetalPoint(frame,instance,petal,petalCount,t,w);
    let nt = clamp(t,0.012,0.988);
    let tangent = botanicalPetalPoint(frame,instance,petal,petalCount,nt+0.003,w)-botanicalPetalPoint(frame,instance,petal,petalCount,nt-0.003,w);
    let transverse = botanicalPetalPoint(frame,instance,petal,petalCount,nt,w+0.003)-botanicalPetalPoint(frame,instance,petal,petalCount,nt,w-0.003);
    result.normal = botanicalNormal(cross(tangent,transverse),frame.headUp);
    result.uv = vec2f(w,t);
    let hue = random(instance*31u+91u);
    let pink = vec3f(0.97,0.53,0.76);
    let purple = vec3f(0.65,0.42,0.83);
    let orange = vec3f(0.99,0.68,0.27);
    let macroPigment = select(select(pink,purple,hue>0.48),orange,hue>0.79);
    // Pigment belongs to the persistent root domain. Nearby flowers form
    // uneven drifts without changing colour as the original body flows.
    let flowerField = clamp(0.5+noise(rideDirection(instance)*3.2+vec3f(2.7,6.3,1.8))
      +(hue-0.5)*0.16,0.0,1.0);
    let meadowPink=vec3f(0.98,0.48,0.70);
    let meadowPurple=vec3f(0.65,0.40,0.87);
    let meadowYellow=vec3f(1.0,0.79,0.22);
    let meadowWhite=vec3f(0.97,0.95,0.85);
    let clusteredPigment=select(select(select(meadowPink,meadowPurple,flowerField>0.48),meadowYellow,flowerField>0.76 && hue>0.60),meadowWhite,hue>0.97);
    let pigment=mix(macroPigment,clusteredPigment,u.rideOrigin.w);
    let rootTint = vec3f(0.73,0.57,0.54);
    let tipTint = vec3f(1.055,1.04,1.0);
    let petalVariation = mix(0.94,1.055,random(instance*97u+petal*19u+331u));
    result.color = srgbToLinear(pigment)*mix(rootTint,tipTint,smoothstep(0.0,0.85,t))*petalVariation;
    if (petal>=petalCount) { result.position = frame.headCenter; }
    return result;
  }

  if (vertexIndex<151u) {
    result.part = 3.0;
    let point = vertexIndex-138u;
    if (point==0u) {
      result.position = frame.headCenter+frame.headUp*(frame.headRadius*0.34);
      result.normal = frame.headUp;
      result.uv = vec2f(0.0);
    } else {
      let angle = f32(point-1u)*0.523598775598+frame.r0;
      let radial = frame.headX*cos(angle)+frame.headY*sin(angle);
      result.position = frame.headCenter+radial*(frame.headRadius*0.25)+frame.headUp*(frame.headRadius*0.105);
      result.normal = botanicalNormal(frame.headUp+radial*0.90,frame.headUp);
      result.uv = vec2f(cos(angle),sin(angle));
    }
    result.color = srgbToLinear(vec3f(0.96,0.66,0.10))*mix(0.83,1.02,frame.r2);
    return result;
  }

  if (vertexIndex<175u) {
    result.part = 3.0;
    let grain = (vertexIndex-151u)/4u;
    let corner = (vertexIndex-151u)%4u;
    let seed = random(instance*71u+grain*29u+419u);
    let angle = f32(grain)*2.39996323+frame.r0;
    let radial = frame.headX*cos(angle)+frame.headY*sin(angle);
    let center = frame.headCenter+radial*(frame.headRadius*mix(0.075,0.17,seed))+frame.headUp*(frame.headRadius*mix(0.29,0.355,seed));
    let size = frame.headRadius*mix(0.049,0.075,seed);
    var offset = frame.headUp*size;
    if (corner>0u) {
      let grainAngle = f32(corner-1u)*2.09439510239+seed*2.0;
      offset = (frame.headX*cos(grainAngle)+frame.headY*sin(grainAngle))*size-frame.headUp*(size*0.35);
    }
    result.position = center+offset;
    result.normal = botanicalNormal(offset,frame.headUp);
    result.uv = vec2f(seed,f32(corner)/3.0);
    result.color = srgbToLinear(mix(vec3f(1.0,0.74,0.10),vec3f(1.0,0.88,0.30),seed));
    result.seed = seed;
    return result;
  }

  result.part = 4.0;
  let sepal = (vertexIndex-175u)/4u;
  let corner = (vertexIndex-175u)%4u;
  let angle = f32(sepal)*3.14159265+frame.r0*2.0;
  let along = frame.headX*cos(angle)+frame.headY*sin(angle);
  let side = -frame.headX*sin(angle)+frame.headY*cos(angle);
  let shape = array<vec2f,4>(vec2f(0.0,0.0),vec2f(0.30,0.35),vec2f(0.0,0.70),vec2f(-0.30,0.35));
  let parameter = shape[corner];
  result.position = frame.headCenter+along*(frame.headRadius*parameter.y)+side*(frame.headRadius*parameter.x*0.42)
    -frame.headUp*(frame.headRadius*(0.08+0.10*sin(parameter.y*3.14159265)));
  result.normal = -frame.headUp;
  result.uv = vec2f(parameter.x,parameter.y);
  result.color *= vec3f(0.58,0.78,0.37);
  return result;
}
`;
