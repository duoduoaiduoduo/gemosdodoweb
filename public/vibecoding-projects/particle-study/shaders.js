// All geometry is generated in WGSL. No textures, video frames, or recorded motion.
export const sharedWGSL = /* wgsl */ `
struct Uniforms {
  viewport: vec4f, // width, height, simulation seconds, particle count
  settings: vec4f, // turbulence, dispersion, point scale, camera zoom
  camera: vec4f,   // yaw, pitch, device pixel ratio, focus distance
  extra: vec4f, // reserved, inverse aperture-sample count, exposure, lifecycle delta
  lens: vec4f, // scene: aperture-world xy/pixel jitter zw; film: new-history weight x
  viewRight: vec4f, // world-to-view basis row and translation
  viewUp: vec4f,
  viewBack: vec4f,
  domainRight: vec4f, // xyz sphere chart right, w original base radius
  domainForward: vec4f, // xyz sphere chart forward, w chart metric scale
  domainNormal: vec4f, // xyz sphere chart normal, w flower density relative to reference
  worldRight: vec4f,
  worldForward: vec4f, // xyz chart forward, w backdrop: 0 sky, 1 white, 2 black
  worldUp: vec4f, // w radial height scale
  rideOrigin: vec4f, // xyz unfolding center, w continuous unfold
  riderContact: vec4f, // xyz board wheel contact, w visibility
};
struct Particle {
  position: vec4f, // xyz, physical radius
  color: vec4f,    // unlit linear albedo, relative bead area
  normal: vec4f,   // deformed surface normal, material roughness
  material: vec4f, // broad cavity occlusion, frost weight, shell layer, initialized
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash32(v: u32) -> u32 {
  var x = v;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  return (x >> 16u) ^ x;
}
fn random(v: u32) -> f32 {
  return f32(hash32(v) & 0x00ffffffu) / 16777216.0;
}
fn hash3(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z) * 2.0 - 1.0;
}
// Cubic value noise and its analytic gradient keep the particle crust coherent.
fn noiseGradient(p: vec3f) -> vec4f {
  let cell = floor(p);
  let f = fract(p);
  let v = f * f * (3.0 - 2.0 * f);
  let d = 6.0 * f * (1.0 - f);
  let a = hash3(cell);
  let b = hash3(cell + vec3f(1.0, 0.0, 0.0));
  let c = hash3(cell + vec3f(0.0, 1.0, 0.0));
  let e = hash3(cell + vec3f(1.0, 1.0, 0.0));
  let g = hash3(cell + vec3f(0.0, 0.0, 1.0));
  let h = hash3(cell + vec3f(1.0, 0.0, 1.0));
  let i = hash3(cell + vec3f(0.0, 1.0, 1.0));
  let j = hash3(cell + vec3f(1.0, 1.0, 1.0));
  let ab = mix(a, b, v.x);
  let ce = mix(c, e, v.x);
  let gh = mix(g, h, v.x);
  let ij = mix(i, j, v.x);
  let lower = mix(ab, ce, v.y);
  let upper = mix(gh, ij, v.y);
  let dx = mix(mix(b-a, e-c, v.y), mix(h-g, j-i, v.y), v.z) * d.x;
  let dy = mix(ce-ab, ij-gh, v.z) * d.y;
  let dz = (upper-lower) * d.z;
  return vec4f(mix(lower, upper, v.z), dx, dy, dz);
}
fn noise(p: vec3f) -> f32 { return noiseGradient(p).x; }
fn noiseVector(p: vec3f) -> vec3f {
  return vec3f(noise(p), noise(p+vec3f(19.3, 7.1, 2.7)), noise(p+vec3f(4.3, 23.8, 12.3)));
}
fn turnY(p: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
}
fn turnX(p: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(p.x, c*p.y - s*p.z, s*p.y + c*p.z);
}
fn macroToWorld(vector: vec3f) -> vec3f {
  let yaw = u.camera.x+(u.viewport.z-4.0)*0.105;
  let pitch = u.camera.y-0.08+sin(u.viewport.z*0.11)*0.08;
  return turnY(turnX(vector,-pitch),-yaw);
}
fn worldToMacro(vector: vec3f) -> vec3f {
  let yaw = u.camera.x+(u.viewport.z-4.0)*0.105;
  let pitch = u.camera.y-0.08+sin(u.viewport.z*0.11)*0.08;
  return turnX(turnY(vector,yaw),pitch);
}
// One world-space sun drives the plants, rider, shadows and visible sky.
fn referenceSunDirection() -> vec3f {
  let macroLight=macroToWorld(normalize(vec3f(-0.52,0.68,0.52)));
  let microLight=normalize(u.worldRight.xyz*0.72+u.worldUp.xyz*0.30+u.worldForward.xyz*0.62);
  return normalize(mix(macroLight,microLight,u.rideOrigin.w));
}
fn backgroundWorldRay(uv: vec2f) -> vec3f {
  let aspect=u.viewport.x/u.viewport.y;
  let focal=mix(1.93*min(1.0,aspect),1.90,u.extra.x);
  let screen=vec2f(uv.x*2.0-1.0,1.0-uv.y*2.0);
  return normalize(u.viewRight.xyz*(screen.x*aspect/focal)+u.viewUp.xyz*(screen.y/focal)-u.viewBack.xyz);
}
fn worldToView(position: vec3f) -> vec3f {
  return vec3f(dot(u.viewRight.xyz,position)+u.viewRight.w,
    dot(u.viewUp.xyz,position)+u.viewUp.w,dot(u.viewBack.xyz,position)+u.viewBack.w);
}
fn cameraWorld() -> vec3f {
  let distance = 3.58/max(0.65,u.settings.w);
  return -u.viewRight.xyz*u.viewRight.w-u.viewUp.xyz*u.viewUp.w
    +u.viewBack.xyz*(distance-u.viewBack.w);
}
fn cameraProjection(position: vec3f) -> vec4f {
  let viewPosition = worldToView(position);
  let distance = 3.58/max(0.65,u.settings.w);
  let depth = distance-viewPosition.z;
  let focusDepth = max(u.camera.w,0.012);
  let aspect = u.viewport.x/u.viewport.y;
  let focal = mix(1.93*min(1.0,aspect),1.90,u.extra.x);
  let offAxis = viewPosition.xy-u.lens.xy+u.lens.xy*depth/focusDepth;
  let jitter = u.lens.zw*2.0/u.viewport.xy;
  let nearPlane = mix(0.1,0.012,u.extra.x);
  return vec4f(offAxis*vec2f(focal/aspect,focal)+jitter*depth,
    10.0/(10.0-nearPlane)*depth-10.0*nearPlane/(10.0-nearPlane),depth);
}

// A single logarithmic chart opens the original moving sphere around the
// approached patch. Plant identities and simulation coordinates stay intact.
fn rideDirection(identity: u32) -> vec3f {
  let seed=identity*13u+71u;
  let y=2.0*random(seed)-1.0;
  let a=random(seed+1u)*6.28318530718;
  let r=sqrt(max(0.0,1.0-y*y));
  return vec3f(cos(a)*r,y,sin(a)*r);
}
fn unfoldPosition(original: vec3f, direction: vec3f) -> vec3f {
  let h=clamp(dot(direction,u.domainNormal.xyz),-0.9999,0.9999);
  let theta=acos(h);
  let coefficient=theta/max(sqrt(1.0-h*h),0.0001)*u.domainForward.w;
  let chart=vec2f(dot(direction,u.domainRight.xyz),dot(direction,u.domainForward.xyz))*coefficient;
  let displacement=original-direction*u.domainRight.w;
  let valleyX=0.68*sin(chart.y*0.48);
  let lateral=chart.x-valleyX;
  let shoulder=1.0-exp(-lateral*lateral*0.36);
  let hills=shoulder*(0.45+0.36*(0.5+0.5*sin(chart.y*0.65+chart.x*0.24)))+0.06*sin(chart.y*0.85);
  let mapped=u.rideOrigin.xyz+u.worldRight.xyz*chart.x+u.worldForward.xyz*chart.y
    +u.worldUp.xyz*((length(original)-u.domainRight.w)*u.worldUp.w+hills)
    +0.12*(u.worldRight.xyz*dot(displacement,u.domainRight.xyz)+u.worldForward.xyz*dot(displacement,u.domainForward.xyz));
  return mix(original,mapped,u.rideOrigin.w);
}
fn unfoldNormal(original: vec3f) -> vec3f {
  let mapped=normalize(u.worldUp.xyz+u.worldRight.xyz*dot(original,u.domainRight.xyz)*0.25
    +u.worldForward.xyz*dot(original,u.domainForward.xyz)*0.25);
  return normalize(mix(original,mapped,u.rideOrigin.w));
}
// Continuous inner crust of the very same sphere, evaluated with the same
// moving domains as the root simulation. It only becomes visible inside it.
fn crustSurface(direction: vec3f) -> vec3f {
  let t=u.viewport.z;
  let assembled=smoothstep(0.1,2.8,t);
  let drift=vec3f(0.12*sin(t*0.26),t*0.085,0.12*cos(t*0.19));
  let turbulence=clamp(u.settings.x,0.0,2.4);
  let coarse=noiseVector(direction*1.75+drift);
  let domain=direction*2.65+coarse*0.75+drift;
  let fold=noiseGradient(domain);
  let lace=noiseGradient(domain*2.21+vec3f(3.7,1.2,-2.9));
  let grain=noise(domain*5.27);
  let pleatA=direction.y*4.4+direction.x*2.6+coarse.x*2.0+t*0.095;
  let pleatB=direction.z*3.5+coarse.y*2.0;
  var radius=mix(0.76,0.975,smoothstep(0.20,0.65,u.rideOrigin.w))+turbulence*(fold.x*0.30+sin(pleatA)*sin(pleatB)*0.10+lace.x*0.078+grain*0.023);
  var p=direction*radius+coarse*(0.25*turbulence);
  p=turnY(p,turbulence*(0.47*p.y+0.24*fold.x));
  p.x+=turbulence*0.065*sin(p.y*5.1+p.z*3.3+t*0.2);
  p.y+=turbulence*0.055*sin(p.z*4.7-p.x*3.7-t*0.17);
  p.z+=turbulence*0.09*sin(p.x*4.0+p.y*2.3+t*0.16);
  p+=noiseVector(p*12.0+drift)*0.009;
  p.x=p.x*mix(0.52,1.0,assembled)+(1.0-assembled)*0.21*sin(p.y*4.3+0.6);
  p.z*=mix(0.50,1.0,assembled);
  p.y=p.y*mix(0.76,1.0,assembled)+(1.0-assembled)*0.19;
  p+=direction*u.settings.y*0.5+coarse*u.settings.y*0.5;
  p*=0.93;
  p.y*=1.065;
  return p;
}

fn srgbToLinear(color: vec3f) -> vec3f {
  return select(pow((color+0.055)/1.055,vec3f(2.4)),color/12.92,color<=vec3f(0.04045));
}
fn referenceBackground(uv: vec2f) -> vec3f {
  if(u.worldForward.w>1.5){return vec3f(0.0);}
  if(u.worldForward.w>0.5){return vec3f(1.0);}
  let sky = vec3f(0.6039,0.8078,0.9098);
  let haze = vec3f(0.9373,0.9804,0.9882);
  let blueAmount = (1.0-smoothstep(0.0,0.85,uv.y))*mix(0.40,1.0,smoothstep(0.0,1.0,uv.x));
  let macroSky = mix(haze,sky,blueAmount);
  let elevation=max(0.0,dot(backgroundWorldRay(uv),u.worldUp.xyz));
  let microSky=mix(vec3f(0.87,0.94,0.94),vec3f(0.33,0.71,0.91),pow(elevation,0.45));
  return mix(macroSky,microSky,u.rideOrigin.w);
}
fn referenceSunRadiance(uv: vec2f) -> vec3f {
  if(u.worldForward.w>0.5){return vec3f(0.0);}
  let alignment=dot(backgroundWorldRay(uv),referenceSunDirection());
  let angleSquared=max(0.0,2.0*(1.0-alignment));
  // The solar disk and atmospheric halo stay in linear HDR until the same
  // exposure as the photographed geometry. Their angular sizes are fixed.
  let disk=smoothstep(cos(0.0055),cos(0.0040),alignment);
  let halo=0.64*exp(-angleSquared/0.028)+0.15*exp(-angleSquared/0.12);
  return vec3f(1.0,0.86,0.63)*(disk*24.0+halo)*u.rideOrigin.w;
}
fn referenceParticle(position: vec3f, identity: u32) -> vec3f {
  let grass = vec3f(0.43,0.69,0.16);
  let teal = vec3f(0.10,0.46,0.37);
  let sunlight = vec3f(0.60,0.71,0.20);
  let meadowField = noise(position*2.8+vec3f(2.1,0.7,4.6));
  let green = mix(teal,grass,smoothstep(-0.55,0.55,position.y*0.45+meadowField*0.60));
  let sunny = smoothstep(-0.10,0.90,position.y*0.70+position.x*0.38+meadowField*0.28);
  let meadow = mix(green,sunlight,sunny*0.20);
  // Individual leaves vary gently; flower pigments belong to their actual petals.
  return meadow*mix(0.88,1.05,random(identity*23u+113u));
}
`;

export const computeWGSL = sharedWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index >= u32(u.viewport.w)) { return; }
  let previous = particles[index];
  let initialized = previous.material.w>0.5 && u.extra.w>=0.0;
  let dt = max(u.extra.w,0.0);
  // Continuous time responses bound each frame's change even when a procedural field moves fast.
  let lifeResponse = select(1.0,1.0-exp(-dt/0.20),initialized);
  let motionResponse = select(1.0,1.0-exp(-dt/0.08),initialized);
  let normalResponse = select(1.0,1.0-exp(-dt/0.14),initialized);
  let seed = index * 13u + 71u;
  let r0 = random(seed); let r1 = random(seed+1u);
  let r2 = random(seed+2u); let r3 = random(seed+3u);
  let r4 = random(seed+4u); let r5 = random(seed+5u);
  let r6 = random(seed+6u); let r7 = random(seed+7u);
  let vertical = 2.0*r0-1.0;
  let longitude = r1*6.28318530718;
  let horizontal = sqrt(max(0.0, 1.0-vertical*vertical));
  let direction = vec3f(cos(longitude)*horizontal, vertical, sin(longitude)*horizontal);
  let t = u.viewport.z;
  let assembled = smoothstep(0.1, 2.8, t);
  let openingPhase = sin((t-5.1)*0.72);
  let rupture = smoothstep(0.40, 0.99, openingPhase);
  let drift = vec3f(0.12*sin(t*0.26), t*0.085, 0.12*cos(t*0.19));
  let turbulence = clamp(u.settings.x, 0.0, 2.4);
  // Nested, thickened sheets expose dark material through holes in the crust.
  var radius = 1.0 + (r4-0.5)*0.045;
  var layer = 0.0;
  if (r2 > 0.69) { radius = 0.76 + (r4-0.5)*0.095; layer = 1.0; }
  if (r2 > 0.93) { radius = 0.43 + r4*0.22; layer = 2.0; }
  let coarse = noiseVector(direction*1.75 + drift);
  let warpedDomain = direction*2.65 + coarse*0.75 + drift;
  let fold = noiseGradient(warpedDomain);
  let lace = noiseGradient(warpedDomain*2.21 + vec3f(3.7, 1.2, -2.9));
  let grain = noise(warpedDomain*5.27);
  let pleatA = direction.y*4.4+direction.x*2.6+coarse.x*2.0+t*0.095;
  let pleatB = direction.z*3.5+coarse.y*2.0;
  let pleat = sin(pleatA)*sin(pleatB);
  radius += turbulence * (fold.x*0.30 + pleat*0.10 + lace.x*0.078 + grain*0.023);
  var p = direction*radius + coarse*(0.25*turbulence);
  // Tangential curls create overhangs and seams instead of a smooth noisy sphere.
  p = turnY(p, turbulence*(0.47*p.y + 0.24*fold.x));
  p.x += turbulence*0.065*sin(p.y*5.1 + p.z*3.3 + t*0.2);
  p.y += turbulence*0.055*sin(p.z*4.7 - p.x*3.7 - t*0.17);
  p.z += turbulence*0.09*sin(p.x*4.0 + p.y*2.3 + t*0.16);

  let pore = noise(direction*3.25 + coarse*0.9 + vec3f(-1.3, 4.6, 2.1)+drift);
  let poreDetail = noise(direction*9.8 + drift);
  let threshold = 0.22 - rupture*0.39*(0.45+0.55*smoothstep(-0.2, 0.8, p.y));
  var coverage = 1.0;
  if (layer < 0.5) {
    coverage = 1.0-smoothstep(threshold, threshold+0.095, pore+poreDetail*0.10);
  } else {
    coverage = 1.0-smoothstep(0.41-rupture*0.2, 0.59-rupture*0.2, pore);
  }
  // Exposed pore rims break into wisps; fine satellites remain close to the mass.
  let edge = 1.0-abs(coverage*2.0-1.0);
  let fragment = r3 > 0.975;
  if (fragment) {
    p += direction*(0.08 + r6*0.13) + coarse*0.10;
    coverage *= smoothstep(0.2, 0.65, noise(p*10.0+drift));
  }
  p += direction*(edge*0.025*r6);
  p += noiseVector(p*12.0 + drift)*0.009;

  // The narrow S introduction opens once, then folds and tears indefinitely.
  let expansion = mix(0.52, 1.0, assembled);
  p.x = p.x*expansion + (1.0-assembled)*0.21*sin(p.y*4.3+0.6);
  p.z *= mix(0.50, 1.0, assembled);
  p.y = p.y*mix(0.76, 1.0, assembled)+(1.0-assembled)*0.19;
  p += direction*u.settings.y*(0.1+0.8*r5) + coarse*u.settings.y*0.5;
  p *= 0.93;
  p.y *= 1.065;

  let pleatGradient = vec3f(cos(pleatA)*sin(pleatB)*2.6,cos(pleatA)*sin(pleatB)*4.4,sin(pleatA)*cos(pleatB)*3.5);
  var normal = normalize(direction - turbulence*(fold.yzw*0.72+lace.yzw*0.35+pleatGradient*0.13) + coarse*0.40);
  normal = turnY(normal, turbulence*(0.47*p.y+0.24*fold.x));
  normal = normalize(mix(previous.normal.xyz,normal,normalResponse));
  let light = normalize(vec3f(-0.3, 0.78, 0.66));
  let lambert = max(0.0, dot(normal, light));
  let cavity = smoothstep(-0.3, 0.55, fold.x*0.8+pore*0.4);
  let frostField = noise(direction*3.7+coarse*0.6+vec3f(5.1,1.7,2.2)+drift*0.65);
  let frost = smoothstep(-0.40, 0.35, frostField + 0.31*normal.y + 0.20*normal.z);
  let exposed = select(0.43, 1.0, layer < 0.5);
  let blue = smoothstep(-0.25, 0.38, noise(p*5.0+vec3f(12.7,3.5,7.2)));
  let coal = vec3f(0.045, 0.073, 0.092);
  let teal = vec3f(0.30, 0.55, 0.63);
  // Keep pigments unlit. One consistent studio rig shades the moving geometry later.
  let pigment = mix(coal, teal, (0.60+0.40*blue)*exposed);
  // A moving material boundary cannot teleport a bead or switch its albedo in one frame.
  let frostTarget = smoothstep(-0.055, 0.055, frost*(0.38+0.57*lambert)*exposed-r5);
  let frostMix = mix(previous.material.y,frostTarget,lifeResponse);
  let ice = mix(vec3f(0.88, 0.93, 0.95), vec3f(0.98, 0.99, 0.98), r6*0.62);
  let color = mix(srgbToLinear(pigment), srgbToLinear(ice), frostMix);
  // Independent sphere sizes reproduce tiny charcoal grains and larger silver beads.
  var size = mix(0.00225, 0.00445, pow(r7, 1.7));
  size *= 2.55;
  p += direction*mix(-0.012, 0.038, frostMix);
  if (fragment) { size *= 0.75; }
  if (r6 > 0.988) { size *= 1.15; }
  // Keep the original pore thresholds, but cross them by growing from and shrinking to zero.
  // The same continuous radius path works in either temporal direction; opacity stays solid.
  let cutoff = r3*0.70;
  let presence = smoothstep(cutoff-0.12, cutoff+0.12, coverage);
  let targetRadius = size*u.settings.z*sqrt(coverage)*presence;
  let growingRadius = mix(previous.position.w,targetRadius,lifeResponse);
  let beadRadius = select(growingRadius,0.0,growingRadius<0.0000001);
  let radiusScale = beadRadius/max(size*u.settings.z,0.000001);
  particles[index].position = vec4f(mix(previous.position.xyz,p,motionResponse),beadRadius);
  particles[index].color = vec4f(mix(previous.color.rgb,color,lifeResponse),radiusScale*radiusScale);
  particles[index].normal = vec4f(normal, mix(0.78+0.07*r6,0.48+0.12*r6,frostMix));
  particles[index].material = vec4f(mix(0.72,1.0,cavity)*mix(0.78,1.0,exposed),frostMix,layer,1.0);
}
`;

// Camera-space transforms run once per animation step, not once per aperture sample.
export const projectionWGSL = sharedWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage, read> worldParticles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> viewParticles: array<Particle>;

@compute @workgroup_size(256)
fn project(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index >= u32(u.viewport.w)) { return; }
  let particle = worldParticles[index];
  let yaw = u.camera.x+(u.viewport.z-4.0)*0.105;
  let pitch = u.camera.y-0.08+sin(u.viewport.z*0.11)*0.08;
  var viewParticle = particle;
  let direction=rideDirection(index);
  var mappedPosition=unfoldPosition(particle.position.xyz,direction);
  if(particle.material.z>0.5 && u.rideOrigin.w>0.45){
    // Reuse the original body's inner plants as the optical chart opens.
    // Their identities, radii and lifecycle stay in the same simulation.
    let outerOriginal=crustSurface(direction)+direction*0.035;
    let outerMapped=unfoldPosition(outerOriginal,direction);
    mappedPosition=mix(mappedPosition,outerMapped,smoothstep(0.45,0.92,u.rideOrigin.w));
  }
  viewParticle.position=vec4f(mappedPosition,particle.position.w);
  viewParticle.normal=vec4f(unfoldNormal(particle.normal.xyz),particle.normal.w);
  // The same simulated roots are lifted into the approaching lens's chart.
  let macroPosition = turnX(turnY(particle.position.xyz,yaw),pitch);
  // Keep the original macro palette exactly as the lens approaches the same mesh.
  let palette = srgbToLinear(referenceParticle(macroPosition,index));
  viewParticle.color = vec4f(palette*mix(0.88,1.04,particle.material.y),particle.color.a);
  viewParticles[index] = viewParticle;
}
`;

// Ninety real mesh vertices per plant: three articulated grass blades, or a stem,
// five/six cupped petals and a raised flower center. No sphere/billboard proxy.
const fullscreenWGSL = /* wgsl */ `
struct FullscreenOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn vertex(@builtin(vertex_index) id: u32) -> FullscreenOutput {
  let corners = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  var output: FullscreenOutput;
  output.position = vec4f(corners[id],0.0,1.0);
  output.uv = vec2f(corners[id].x*0.5+0.5,0.5-corners[id].y*0.5);
  return output;
}
`;

// Aperture views are accumulated before exposure or any display transform.
export const accumulateWGSL = sharedWGSL + fullscreenWGSL + /* wgsl */ `
@group(0) @binding(1) var scene: texture_2d<f32>;

@fragment fn fragment(input: FullscreenOutput) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(scene,0));
  let pixel = clamp(vec2i(input.uv*u.viewport.xy),vec2i(0),size-vec2i(1));
  return textureLoad(scene,pixel,0)*u.extra.y;
}
`;

// The history film stores the same premultiplied linear radiance and visibility.
export const historyWGSL = sharedWGSL + fullscreenWGSL + /* wgsl */ `
@group(0) @binding(1) var currentFilm: texture_2d<f32>;
@group(0) @binding(2) var previousFilm: texture_2d<f32>;

@fragment fn fragment(input: FullscreenOutput) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(currentFilm,0));
  let pixel = clamp(vec2i(input.uv*u.viewport.xy),vec2i(0),size-vec2i(1));
  let current = textureLoad(currentFilm,pixel,0);
  let previous = textureLoad(previousFilm,pixel,0);
  return mix(previous,current,clamp(u.lens.x,0.0,1.0));
}
`;

export const compositeWGSL = sharedWGSL + fullscreenWGSL + /* wgsl */ `
@group(0) @binding(1) var film: texture_2d<f32>;
@group(0) @binding(2) var gasFilm: texture_2d<f32>;

fn linearToSrgb(color: vec3f) -> vec3f {
  let value = max(color,vec3f(0.0));
  return select(1.055*pow(value,vec3f(1.0/2.4))-0.055,12.92*value,value<=vec3f(0.0031308));
}

@fragment fn fragment(input: FullscreenOutput) -> @location(0) vec4f {
  let uv=input.uv;
  let gasSize=vec2i(textureDimensions(gasFilm,0));
  let gasCoord=uv*vec2f(gasSize)-0.5;
  let gasPixel=vec2i(floor(gasCoord));
  let fraction=fract(gasCoord);
  let ga=textureLoad(gasFilm,clamp(gasPixel,vec2i(0),gasSize-1),0);
  let gb=textureLoad(gasFilm,clamp(gasPixel+vec2i(1,0),vec2i(0),gasSize-1),0);
  let gc=textureLoad(gasFilm,clamp(gasPixel+vec2i(0,1),vec2i(0),gasSize-1),0);
  let gd=textureLoad(gasFilm,clamp(gasPixel+vec2i(1,1),vec2i(0),gasSize-1),0);
  let gas=mix(mix(ga,gb,fraction.x),mix(gc,gd,fraction.x),fraction.y);
  let size = vec2i(textureDimensions(film,0));
  let pixel = clamp(vec2i(uv*u.viewport.xy),vec2i(0),size-vec2i(1));
  let sceneColor = textureLoad(film,pixel,0);
  let alpha = clamp(sceneColor.a,0.0,1.0);
  let backgroundSrgb = referenceBackground(uv);
  let backgroundLinear = srgbToLinear(backgroundSrgb);
  // Lift the measured background through the inverse shoulder first. A single
  // tone curve then follows optical integration and leaves its target RGB intact.
  let backgroundRadiance = backgroundLinear/(vec3f(1.0)-0.16*backgroundLinear)+referenceSunRadiance(uv);
  let combined = max(sceneColor.rgb,vec3f(0.0))*max(u.extra.z,0.01)
    +backgroundRadiance*(1.0-alpha);
  let radiance=combined*(1.0-clamp(gas.a,0.0,1.0))+max(gas.rgb,vec3f(0.0));
  let toned = radiance/(vec3f(1.0)+0.16*radiance);
  return vec4f(linearToSrgb(toned),1.0);
}
`;

// Retained for clients that want a standalone background pass.
export const backgroundWGSL = sharedWGSL + fullscreenWGSL + /* wgsl */ `
@fragment fn fragment(input: FullscreenOutput) -> @location(0) vec4f {
  return vec4f(referenceBackground(input.uv),1.0);
}
`;

// Keep all subpixel depths: half-float NDC quantization creates visible depth
// terraces at macro distances, while one nearest depth over-occludes thin grass.
export const depthResolveWGSL = /* wgsl */ `
@group(0) @binding(0) var sceneDepth: texture_depth_multisampled_2d;
@group(0) @binding(1) var layers: texture_storage_2d<rgba32float,write>;
@compute @workgroup_size(8,8)
fn resolveDepth(@builtin(global_invocation_id) id:vec3u) {
  let size=textureDimensions(sceneDepth);
  if(any(id.xy>=size)){return;}
  let pixel=vec2i(id.xy);
  let a=textureLoad(sceneDepth,pixel,0);
  let b=textureLoad(sceneDepth,pixel,1);
  let c=textureLoad(sceneDepth,pixel,2);
  let d=textureLoad(sceneDepth,pixel,3);
  let lowAB=min(a,b);let highAB=max(a,b);
  let lowCD=min(c,d);let highCD=max(c,d);
  let middleA=max(lowAB,lowCD);let middleB=min(highAB,highCD);
  textureStore(layers,pixel,vec4f(min(lowAB,lowCD),min(middleA,middleB),max(middleA,middleB),max(highAB,highCD)));
}
`;

// Display-space edge resolve complements geometric MSAA: the thin volume
// reaction sheet has no triangles for the hardware coverage mask to filter.
// Low-contrast pixels leave after five taps; only a detected edge is searched.
export const fxaaWGSL = fullscreenWGSL + /* wgsl */ `
@group(0) @binding(0) var display: texture_2d<f32>;
@group(0) @binding(1) var subpixelSampler: sampler;
fn edgeLuma(rgb:vec3f)->f32{return dot(rgb,vec3f(0.299,0.587,0.114));}
fn displayPixel(pixel:vec2i,size:vec2i)->vec3f{
  return textureLoad(display,clamp(pixel,vec2i(0),size-vec2i(1)),0).rgb;
}
@fragment fn fragment(input:FullscreenOutput)->@location(0) vec4f{
  let size=vec2i(textureDimensions(display,0));
  let inverseSize=1.0/vec2f(size);
  let pixel=clamp(vec2i(input.position.xy),vec2i(0),size-vec2i(1));
  let center=displayPixel(pixel,size);
  let north=displayPixel(pixel+vec2i(0,-1),size);
  let south=displayPixel(pixel+vec2i(0,1),size);
  let west=displayPixel(pixel+vec2i(-1,0),size);
  let east=displayPixel(pixel+vec2i(1,0),size);
  let lm=edgeLuma(center);let ln=edgeLuma(north);let ls=edgeLuma(south);
  let lw=edgeLuma(west);let le=edgeLuma(east);
  let cardinalMin=min(lm,min(min(ln,ls),min(lw,le)));
  let cardinalMax=max(lm,max(max(ln,ls),max(lw,le)));
  let cardinalRange=cardinalMax-cardinalMin;
  if(cardinalRange<max(0.0312,cardinalMax*0.125)){
    return vec4f(center,1.0);
  }
  let nw=displayPixel(pixel+vec2i(-1,-1),size);
  let ne=displayPixel(pixel+vec2i(1,-1),size);
  let sw=displayPixel(pixel+vec2i(-1,1),size);
  let se=displayPixel(pixel+vec2i(1,1),size);
  let lnw=edgeLuma(nw);let lne=edgeLuma(ne);
  let lsw=edgeLuma(sw);let lse=edgeLuma(se);
  let low=min(cardinalMin,min(min(lnw,lne),min(lsw,lse)));
  let high=max(cardinalMax,max(max(lnw,lne),max(lsw,lse)));
  var direction=vec2f(-((lnw+lne)-(lsw+lse)),(lnw+lsw)-(lne+lse));
  let reduce=max((lnw+lne+lsw+lse)*(0.25*0.125),1.0/128.0);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2f(-6.0),vec2f(6.0))*inverseSize;
  let uv=(vec2f(pixel)+0.5)*inverseSize;
  let inner=(textureSampleLevel(display,subpixelSampler,uv-direction/6.0,0.0).rgb
    +textureSampleLevel(display,subpixelSampler,uv+direction/6.0,0.0).rgb)*0.5;
  let outer=inner*0.5+(textureSampleLevel(display,subpixelSampler,uv-direction*0.5,0.0).rgb
    +textureSampleLevel(display,subpixelSampler,uv+direction*0.5,0.0).rgb)*0.25;
  let outerLuma=edgeLuma(outer);
  let alongEdge=select(outer,inner,outerLuma<low||outerLuma>high);
  // A lone one-pixel pinhole has no edge direction. Its subpixel contrast
  // receives a bounded correction; broader gradients and resolved detail do not.
  let neighborhood=(2.0*(ln+ls+lw+le)+lnw+lne+lsw+lse)/12.0;
  var subpixel=clamp(abs(neighborhood-lm)/max(high-low,0.00001),0.0,1.0);
  subpixel=subpixel*subpixel*(3.0-2.0*subpixel);
  subpixel=subpixel*subpixel*0.45;
  let result=mix(alongEdge,(north+south+west+east)*0.25,subpixel);
  return vec4f(result,1.0);
}
`;
