import { sharedWGSL } from './shaders.js?v=fire-v25c';
import { fractureWGSL } from './leaf-fracture.js?v=fire-v25c';

// A small persistent pool of incandescent fragments, rather than a looping
// particle texture. A fragment leaves an actual leaf, then keeps its own
// world-space trajectory and cooling history after that leaf moves away.
const CAPACITY = 1536;
const SPARK_SLOTS = 512;
const MAX_SPARKS = 96;
const MAX_ASH = 96;
const particleCommon = /* wgsl */ `
struct Ember {
  positionAge: vec4f,
  velocityLife: vec4f,
  thermal: vec4f, // reference size, temperature, kind/mass (>=2 ash), seed
  orientation: vec4f, // world-space fragment normal at release, tumble rate
};
struct EmberSettings { dt: f32, time: f32, spawning: f32, frame: f32 };
@group(0) @binding(6) var<uniform> emberSettings: EmberSettings;
`;

const computeWGSL = sharedWGSL + fractureWGSL + particleCommon + /* wgsl */ `
struct EmberCount { sparks: atomic<u32>, ash: atomic<u32> };
struct MeshVertex { position: vec4f, detail: vec4u };
@group(0) @binding(1) var<storage,read_write> embers: array<Ember>;
@group(0) @binding(2) var<storage,read> plants: array<Particle>;
@group(0) @binding(3) var<storage,read> fireState: array<vec4f>;
@group(0) @binding(4) var flowField: texture_3d<f32>;
@group(0) @binding(5) var flowSampler: sampler;
@group(0) @binding(7) var<storage,read_write> count: EmberCount;
@group(0) @binding(8) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(10) var<storage,read> fractures: array<LeafFracture>;
fn fireCell(direction: vec3f) -> u32 {
  let longitude=fract(atan2(direction.z,direction.x)/6.28318530718+1.0);
  let latitude=acos(clamp(direction.y,-1.0,1.0))/3.14159265359;
  return min(63u,u32(longitude*64.0))+min(31u,u32(latitude*32.0))*64u;
}
fn flowUV(position: vec3f) -> vec3f {
  let minimum=mix(vec3f(-1.85,-1.60,-1.85),vec3f(-2.5,-0.55,-2.5),u.rideOrigin.w);
  let extent=mix(vec3f(3.70,4.65,3.70),vec3f(5.0,4.2,5.0),u.rideOrigin.w);
  return (position-u.riderContact.xyz*u.rideOrigin.w-minimum)/extent;
}
fn airVelocity(position: vec3f) -> vec3f {
  let uv=flowUV(position);
  if(any(uv<vec3f(0.002))||any(uv>vec3f(0.998))){return vec3f(0.0);}
  return textureSampleLevel(flowField,flowSampler,uv,0.0).xyz;
}
fn eddy(position: vec3f,time: f32) -> vec3f {
  let a=noiseGradient(position*7.1+vec3f(time*0.19,-time*0.78,2.7)).yzw;
  let b=noiseGradient(position*11.7+vec3f(6.4,time*0.56,-time*0.23)).yzw;
  return cross(a,vec3f(0.13,0.92,0.37))*0.038+cross(b,vec3f(0.81,0.16,-0.41))*0.013;
}
@compute @workgroup_size(64)
fn advance(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x;
  if(index>=${CAPACITY}u){return;}
  var ember=embers[index];
  if(ember.velocityLife.w<=0.0||ember.positionAge.w>=ember.velocityLife.w){return;}
  let dt=emberSettings.dt;
  if(dt<=0.0){return;}
  let age=ember.positionAge.w+dt;
  if(age>=ember.velocityLife.w){ember.velocityLife.w=0.0;embers[index]=ember;return;}
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let position=ember.positionAge.xyz;
  let flow=airVelocity(position);
  let isAsh=ember.thermal.z>=2.0;
  let flake=select(ember.thermal.z,ember.thermal.z-2.0,isAsh);
  // Finite inertia retains the initial sideways release. Fine ash is entrained
  // quickly; the rare heavier glowing flake drifts and flutters before cooling.
  let response=1.0-exp(-dt*mix(mix(1.45,0.95,flake),mix(2.2,1.25,flake),select(0.0,1.0,isAsh)));
  let ambient=vec3f(0.026,0.0,0.014)+eddy(position,emberSettings.time);
  let warmLift=up*select(0.105*ember.thermal.y-0.025*flake,0.025*ember.thermal.y-0.035-0.055*flake,isAsh);
  let targetVelocity=flow*mix(0.92,0.68,flake)+ambient+warmLift;
  var velocity=mix(ember.velocityLife.xyz,targetVelocity,response);
  let flutter=sin(age*(13.0+ember.thermal.w*5.0)+ember.thermal.w*38.0);
  velocity+=cross(up,velocity+vec3f(0.031,0.0,0.018))*flutter*mix(flake,0.8+flake,select(0.0,1.0,isAsh))*dt*1.8;
  ember.positionAge=vec4f(position+velocity*dt,age);
  ember.velocityLife=vec4f(velocity,ember.velocityLife.w);
  ember.thermal.y*=exp(-dt*select(mix(0.21,0.17,flake),1.45,isAsh));
  embers[index]=ember;
  if(isAsh){atomicAdd(&count.ash,1u);}else{atomicAdd(&count.sparks,1u);}
}
@compute @workgroup_size(64)
fn detach(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x;
  if(index>=${SPARK_SLOTS}u||emberSettings.dt<=0.0||emberSettings.spawning<0.5){return;}
  if(embers[index].velocityLife.w>0.0&&embers[index].positionAge.w<embers[index].velocityLife.w){return;}
  let seed=hash32(index*941u+u32(emberSettings.frame)*787u+1777u);
  let rootCount=u32(u.viewport.w);
  if(rootCount<1u||random(seed)>emberSettings.dt*0.95){return;}
  let identity=min(rootCount-1u,u32(random(seed+1u)*f32(rootCount)));
  let plant=plants[identity];
  if(plant.position.w<0.00015||(plant.material.z>0.5&&u.rideOrigin.w<0.65)){return;}
  let state=fireState[fireCell(rideDirection(identity))];
  let burning=smoothstep(0.31,0.87,state.x)*smoothstep(0.012,0.095,state.y);
  let carbon=smoothstep(0.025,0.24,state.z)*(1.0-smoothstep(0.82,1.0,state.z));
  let surge=noise(plant.position.xyz*8.8+vec3f(3.4,-emberSettings.time*1.44,1.7));
  let propensity=burning*mix(0.40,1.0,carbon)*mix(0.34,1.40,smoothstep(-0.36,0.39,surge));
  if(random(seed+2u)>propensity||atomicLoad(&count.sparks)>=${MAX_SPARKS}u){return;}
  let blade=min(4u,u32(random(seed+3u)*5.0));
  let edge=select(0u,1u,random(seed+5u)>0.5);
  let base=identity*70u+blade*14u;
  // Geometry packs the independent burn progress of this very blade. Release
  // a glowing chip just behind its moving carbonisation front, interpolating
  // the already curled/shrunk mesh rather than rebuilding an approximate leaf.
  let progress=f32((u32(mesh[base].position.w)>>16u)&255u)/255.0;
  if(progress<0.025){return;}
  let front=clamp(1.0-(progress*1.36-0.078)/0.96,0.04,0.98);
  var t=clamp(front+mix(0.015,0.095,random(seed+4u)),0.04,0.995);
  // Release from the actual hot strip, including its hanging pose and first
  // second of free flight. Older cold pieces cannot create fresh embers.
  for(var retreat=0u;retreat<24u;retreat++){
    let chunk=(identity*5u+blade)*3u+leafFractureChunk(t);
    let candidate=fractures[chunk];
    if(candidate.anchorStage.w<1.5||(candidate.anchorStage.w<2.5&&candidate.centerAge.w<1.05)){break;}
    t=max(0.015,t-0.045);
  }
  let sourceChunk=(identity*5u+blade)*3u+leafFractureChunk(t);
  let source=fractures[sourceChunk];
  if(source.anchorStage.w>=2.5||(source.anchorStage.w>1.5&&source.centerAge.w>=1.05)){return;}
  let reservation=atomicAdd(&count.sparks,1u);
  if(reservation>=${MAX_SPARKS}u){return;}
  let rows=array<f32,7>(0.0,0.16,0.34,0.52,0.70,0.86,1.0);
  var row=0u;
  for(var segment=0u;segment<6u;segment++){
    if(t>=rows[segment]){row=segment;}
  }
  let lower=mesh[base+row*2u+edge].position.xyz;
  let upper=mesh[base+(row+1u)*2u+edge].position.xyz;
  let rawPosition=mix(lower,upper,(t-rows[row])/(rows[row+1u]-rows[row]));
  var position=rawPosition;
  var sourceVelocity=vec3f(0.0);
  var releaseNormal=normalize(plant.normal.xyz);
  if(source.anchorStage.w>=0.5){
    let first=base+leafFractureChunk(t)*4u;
    let a=(mesh[first].position.xyz+mesh[first+1u].position.xyz)*0.5;
    let b=(mesh[first+4u].position.xyz+mesh[first+5u].position.xyz)*0.5;
    let acrossVector=mesh[first+3u].position.xyz-mesh[first+2u].position.xyz;
    let sourceAcross=normalize(acrossVector+vec3f(0.000000001,0.0,0.0));
    let alongVector=b-a;
    let sourceAlong=normalize(alongVector-sourceAcross*dot(alongVector,sourceAcross)+vec3f(0.0,0.000000001,0.0));
    let posed=leafFractureTransform(source,rawPosition,releaseNormal,a,(a+b)*0.5,
      sourceAcross,sourceAlong,max(0.0000001,length(acrossVector)),max(0.0000001,length(alongVector)));
    position=posed.position;
    releaseNormal=posed.normal;
    if(source.anchorStage.w>1.5){sourceVelocity=source.velocityLife.xyz;}
  }
  position+=releaseNormal*0.006;
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let growth=normalize(up*0.80+plant.normal.xyz*0.34);
  let radial=mix(vec3f(1.0,0.0,0.0),u.worldRight.xyz,u.rideOrigin.w);
  let bend=normalize(radial-growth*dot(radial,growth)+vec3f(0.00001));
  let across=normalize(cross(growth,bend));
  let heading=random(seed+6u)*6.2831853;
  let sideways=bend*cos(heading)+across*sin(heading);
  // A short asymmetric release carries chips beyond the dense flame before
  // the gas takes over; they do not remain hidden in the orange volume.
  let kick=mix(0.20,0.43,pow(random(seed+7u),1.7));
  let velocity=airVelocity(position)*0.50+sourceVelocity*0.65+sideways*kick+up*mix(0.20,0.39,random(seed+8u))
    +releaseNormal*mix(0.15,0.26,random(seed+14u));
  let flake=select(0.0,1.0,random(seed+9u)>0.89);
  var ember: Ember;
  ember.positionAge=vec4f(position,0.0);
  ember.velocityLife=vec4f(velocity,mix(3.2,5.1,random(seed+10u))+flake*0.45);
  ember.thermal=vec4f(mix(0.98,1.75,pow(random(seed+11u),1.5))+flake*0.45,
    mix(0.98,1.22,random(seed+12u)),flake,random(seed+13u));
  ember.orientation=vec4f(releaseNormal,0.0);
  embers[index]=ember;
}
@compute @workgroup_size(64)
fn detachAsh(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x+${SPARK_SLOTS}u;
  if(index>=${CAPACITY}u||emberSettings.dt<=0.0||emberSettings.spawning<0.5){return;}
  if(embers[index].velocityLife.w>0.0&&embers[index].positionAge.w<embers[index].velocityLife.w){return;}
  if(atomicLoad(&count.ash)>=${MAX_ASH}u){return;}
  let seed=hash32(index*617u+u32(emberSettings.frame)*1583u+7231u);
  let chunkCount=u32(u.viewport.w)*15u;
  if(chunkCount<1u||random(seed)>emberSettings.dt*0.72){return;}
  var source: LeafFracture;
  var found=false;
  // Dust is secondary material from an already detached real leaf strip. The
  // strip has visibly hung, broken away and tumbled for several seconds before
  // its final powdering phase can release these few small cold fragments.
  for(var trial=0u;trial<4u;trial++){
    let identity=min(chunkCount-1u,u32(random(seed+trial*11u+1u)*f32(chunkCount)));
    let candidate=fractures[identity];
    if(candidate.anchorStage.w<1.5||candidate.anchorStage.w>2.5){continue;}
    if(candidate.motion.w<=0.03||candidate.centerAge.w>=candidate.velocityLife.w){continue;}
    let powder=clamp(candidate.motion.w,0.0,1.0);
    if(random(seed+trial*11u+2u)>powder){continue;}
    source=candidate;found=true;break;
  }
  if(!found){return;}
  let reservation=atomicAdd(&count.ash,1u);
  if(reservation>=${MAX_ASH}u){return;}
  let normal=normalize(cross(source.axisUWidth.xyz,source.axisVLength.xyz)+vec3f(0.00001));
  let widthOffset=(random(seed+47u)-0.5)*source.axisUWidth.w*0.78;
  let lengthOffset=(random(seed+48u)-0.5)*source.axisVLength.w*0.78;
  let position=source.centerAge.xyz+source.axisUWidth.xyz*widthOffset
    +source.axisVLength.xyz*lengthOffset+normal*0.0005;
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let direction=select(-1.0,1.0,random(seed+49u)>0.5);
  let mass=mix(0.08,0.55,random(seed+50u));
  let velocity=source.velocityLife.xyz+source.axisUWidth.xyz*direction*mix(0.015,0.055,random(seed+51u))
    +normal*mix(-0.015,0.025,random(seed+52u))+up*0.015;
  var fragment: Ember;
  fragment.positionAge=vec4f(position,0.0);
  fragment.velocityLife=vec4f(velocity,mix(2.0,4.0,random(seed+53u)));
  // The long strip carries the last visible red rim. Its late fine dust has
  // already cooled: neither a new flame nor glowing confetti is created here.
  fragment.thermal=vec4f(mix(0.42,0.88,random(seed+54u)),0.035,2.0+mass,random(seed+55u));
  fragment.orientation=vec4f(normal,mix(5.0,11.0,random(seed+56u))*direction);
  embers[index]=fragment;
}

`;

const renderWGSL = sharedWGSL + particleCommon + /* wgsl */ `
@group(0) @binding(1) var<storage,read> embers: array<Ember>;
struct EmberVertex {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) thermal: vec4f,
  @location(2) life: vec2f,
  @location(3) normal: vec3f,
  @location(4) world: vec3f,
};
@vertex fn emberVertex(@builtin(vertex_index) vertex: u32,@builtin(instance_index) index: u32) -> EmberVertex {
  let corners=array<vec2f,6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
  let ember=embers[index];
  var result: EmberVertex;
  result.position=vec4f(2.0,2.0,2.0,1.0);
  result.local=corners[vertex]*3.4;
  result.thermal=ember.thermal;
  result.life=vec2f(ember.positionAge.w,max(0.001,ember.velocityLife.w));
  result.normal=vec3f(0.0,1.0,0.0);
  result.world=ember.positionAge.xyz;
  if(ember.velocityLife.w<=0.0||ember.positionAge.w>=ember.velocityLife.w){return result;}
  let clip=cameraProjection(ember.positionAge.xyz);
  if(clip.w<=0.015){return result;}
  if(ember.thermal.z>=2.0){
    // Actual world-oriented, tumbling thin flakes. Their projected width and
    // illumination change as each fragment turns edge-on to the lens and sun.
    let seed=ember.thermal.w;
    let axis=normalize(vec3f(cos(seed*22.0+1.0),0.25+sin(seed*13.0),sin(seed*31.0+2.0)));
    let initial=normalize(ember.orientation.xyz);
    let angle=ember.positionAge.w*ember.orientation.w;
    let normal=initial*cos(angle)+cross(axis,initial)*sin(angle)+axis*dot(axis,initial)*(1.0-cos(angle));
    let across=normalize(cross(normal,axis)+vec3f(0.00001));
    let along=normalize(cross(normal,across));
    let aspect=u.viewport.x/u.viewport.y;
    let focal=mix(1.93*min(1.0,aspect),1.90,u.extra.x);
    let worldSize=ember.thermal.x*2.0*3.58*u.camera.z/(focal*u.viewport.y);
    let q=corners[vertex];
    let shape=vec2f(q.x*(0.82+q.y*0.10),q.y*(0.76+q.x*0.12));
    let offset=across*shape.x+along*shape.y*mix(1.0,1.65,seed);
    result.position=cameraProjection(ember.positionAge.xyz+offset*worldSize);
    result.local=q;
    result.normal=normal;
    return result;
  }
  let tail=cameraProjection(ember.positionAge.xyz-ember.velocityLife.xyz/180.0);
  let screenMotion=(clip.xy/clip.w-tail.xy/max(tail.w,0.015))*u.viewport.xy*0.5;
  let motionLength=length(screenMotion);
  let along=select(vec2f(0.0,1.0),screenMotion/max(0.001,motionLength),motionLength>0.001);
  let across=vec2f(-along.y,along.x);
  let turn=0.87+0.13*sin(ember.positionAge.w*(10.0+ember.thermal.w*5.0)+ember.thermal.w*32.0);
  let pixelRadius=ember.thermal.x*clamp(3.58/clip.w,0.35,5.0)*u.camera.z*turn;
  let stretch=1.0+min(1.35,motionLength/max(pixelRadius,0.15));
  let local=result.local;
  let offset=(across*local.x+along*local.y*stretch)*pixelRadius;
  result.position=clip+vec4f(offset*vec2f(2.0,2.0)/u.viewport.xy*clip.w,0.0,0.0);
  return result;
}
@fragment fn emberFragment(input: EmberVertex) -> @location(0) vec4f {
  let age=input.life.x;
  let fraction=age/input.life.y;
  let temperature=input.thermal.y;
  let q=input.local;
  let seed=input.thermal.w;
  let split=abs(q.x*0.77+q.y*0.38)-0.93;
  let torn=abs(q.x)*(0.87+q.y*0.09)+0.055*sin(q.y*12.0+seed*31.0)-0.89;
  let signedEdge=max(max(torn,abs(q.y)-0.91),split);
  let ashFootprint=max(0.035,fwidth(signedEdge));
  let distance=length(input.local);
  let footprint=max(0.075,fwidth(distance));
  if(input.thermal.z>=2.0){
    let coverage=1.0-smoothstep(-ashFootprint,ashFootprint,signedEdge);
    let fade=smoothstep(0.0,0.045,age)*(1.0-smoothstep(0.76,1.0,fraction));
    let normal=normalize(input.normal);
    let sun=referenceSunDirection();
    let diffuse=0.36+0.79*abs(dot(normal,sun));
    let view=normalize(cameraWorld()-input.world);
    let silver=pow(abs(dot(normal,normalize(sun+view))),9.0)*0.075;
    let gray=mix(0.018,0.070,smoothstep(0.62,0.97,seed));
    let body=vec3f(gray*0.93,gray,gray*1.05)*diffuse+vec3f(silver);
    let rim=1.0-smoothstep(0.025,0.19,-signedEdge);
    let incandescence=smoothstep(0.22,0.70,temperature)*rim;
    let glow=vec3f(2.4,0.12,0.002)*incandescence;
    let alpha=coverage*fade*0.92;
    return vec4f((body+glow)*alpha,alpha);
  }
  // A compact white-hot centre sits inside a saturated orange chip, with a
  // thin carbon rim. The rim survives against white; radiance and a restrained
  // halo keep the same tiny fragment legible against black and bright flames.
  let whiteBackdrop=select(0.0,1.0,u.worldForward.w>0.5&&u.worldForward.w<1.5);
  let chipAngle=atan2(q.y,q.x);
  let chipDistance=distance*(1.0+0.09*sin(chipAngle*3.0+seed*18.0));
  let edge=1.0-smoothstep(1.02-footprint,1.26+footprint,chipDistance);
  let shell=1.0-smoothstep(mix(0.66,0.53,whiteBackdrop)-footprint,
    mix(0.94,0.83,whiteBackdrop)+footprint,chipDistance);
  let core=1.0-smoothstep(mix(0.23,0.14,whiteBackdrop)-footprint*0.45,
    mix(0.51,0.35,whiteBackdrop)+footprint*0.45,chipDistance);
  let halo=exp(-distance*distance*1.55)*mix(0.12,0.024,whiteBackdrop);
  let fade=smoothstep(0.0,0.025,age)*(1.0-smoothstep(0.78,1.0,fraction));
  let red=vec3f(2.60,0.055,0.001);
  let orange=vec3f(5.60,0.60,0.012);
  let gold=vec3f(10.0,4.2,0.65);
  var color=mix(red,orange,smoothstep(0.18,0.63,temperature));
  color=mix(color,gold,smoothstep(0.75,1.14,temperature));
  // White backing reveals the hot material's orange carbon body; keeping a
  // smaller hot centre and less green radiance stops it washing into pink.
  let whiteCore=mix(vec3f(2.0,0.045,0.001),vec3f(6.5,1.05,0.045),smoothstep(0.25,1.14,temperature));
  color=mix(color,whiteCore,whiteBackdrop);
  let flutter=mix(0.85,1.0,0.5+0.5*sin(age*23.0+seed*41.0));
  let intensity=fade*flutter*smoothstep(0.11,0.31,temperature);
  let shellHeat=smoothstep(0.22,0.83,temperature);
  let luminousShell=mix(vec3f(2.5,0.07,0.001),vec3f(5.2,0.43,0.008),shellHeat);
  let materialShell=mix(vec3f(0.36,0.009,0.0005),vec3f(1.7,0.105,0.0018),shellHeat);
  let shellColor=mix(luminousShell,materialShell,whiteBackdrop);
  let carbonColor=mix(vec3f(0.19,0.017,0.0015),vec3f(0.052,0.0045,0.0008),whiteBackdrop);
  let carbon=carbonColor*max(0.0,edge-shell)*fade;
  let emission=(color*core*2.4+shellColor*max(0.0,shell-core)*1.7
    +vec3f(4.2,0.32,0.004)*halo)*intensity+carbon;
  let opacity=(edge*mix(0.96,1.0,whiteBackdrop)+halo*0.12)*fade;
  return vec4f(emission,opacity);
}
`;

export async function createEmberParticles(device, {
  uniforms, sampleUniforms, plants, fireState, meshVertices, fractureState,
  format = 'rgba16float', depthFormat = 'depth32float', sampleCount = 4,
} = {}) {
  const particles = device.createBuffer({label:'Persistent leaf ember pool',size:CAPACITY*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const settings = device.createBuffer({label:'Ember time and generation',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const counter = device.createBuffer({label:'Live incandescent fragment limit',size:8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const fallbackFlow = device.createTexture({label:'Still air fallback for embers',size:[1,1,1],dimension:'3d',format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING});
  const sampler = device.createSampler({label:'Trilinear ember advection',minFilter:'linear',magFilter:'linear',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge',addressModeW:'clamp-to-edge'});
  const computeLayout = device.createBindGroupLayout({entries:[
    {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
    {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:4,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},
    {binding:5,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}},
    {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
    {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
    {binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:10,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
  ]});
  const renderLayout = device.createBindGroupLayout({entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:256}},
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
    {binding:6,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  ]});
  const computeModule=device.createShaderModule({label:'Detached hot leaf fragment dynamics',code:computeWGSL});
  const renderModule=device.createShaderModule({label:'Incandescent chip cores, orange shells and carbon rims',code:renderWGSL});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[computeLayout]});
  const [advancePipeline,detachPipeline,ashPipeline,renderPipeline]=await Promise.all([
    device.createComputePipelineAsync({label:'Advect and cool live embers',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'advance'}}),
    device.createComputePipelineAsync({label:'Release glowing chips from hot posed leaf strips',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'detach'}}),
    device.createComputePipelineAsync({label:'Late powder released by detached leaf strips',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'detachAsh'}}),
    device.createRenderPipelineAsync({label:'MSAA aperture-resolved glowing fragments',layout:device.createPipelineLayout({bindGroupLayouts:[renderLayout]}),
      vertex:{module:renderModule,entryPoint:'emberVertex'},
      fragment:{module:renderModule,entryPoint:'emberFragment',targets:[{format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},
      primitive:{topology:'triangle-list',cullMode:'none'},
      depthStencil:{format:depthFormat,depthWriteEnabled:false,depthCompare:'less'},
      multisample:{count:sampleCount},
    }),
  ]);
  const renderGroup=device.createBindGroup({layout:renderLayout,entries:[
    {binding:0,resource:{buffer:sampleUniforms,offset:0,size:256}},
    {binding:1,resource:{buffer:particles}},
    {binding:6,resource:{buffer:settings}},
  ]});
  const computeGroups=new WeakMap();
  function computeGroup(texture){
    let group=computeGroups.get(texture);
    if(!group){
      group=device.createBindGroup({layout:computeLayout,entries:[
        {binding:0,resource:{buffer:uniforms}},
        {binding:1,resource:{buffer:particles}},
        {binding:2,resource:{buffer:plants}},
        {binding:3,resource:{buffer:fireState}},
        {binding:4,resource:texture.createView()},
        {binding:5,resource:sampler},
        {binding:6,resource:{buffer:settings}},
        {binding:7,resource:{buffer:counter}},
        {binding:8,resource:{buffer:meshVertices}},
        {binding:10,resource:{buffer:fractureState}},
      ]});
      computeGroups.set(texture,group);
    }
    return group;
  }
  let time=0, frame=0, remaining=0, first=true, destroyed=false;
  let statsReadback=null, statsPending=false;
  return {
    get active(){return remaining>0;},
    encode(encoder,{dt=0,count=0,active=false,regrowing=false,clear=false,flowTexture}={}){
      if(destroyed){return;}
      const reset=clear||first;
      const step=reset?0:Math.min(0.05,Math.max(0,dt));
      time=reset?0:time+step;
      frame=reset?0:frame+(step>0?1:0);
      remaining=reset?0:active&&!regrowing?6.5:Math.max(0,remaining-step);
      if(reset){encoder.clearBuffer(particles);first=false;}
      device.queue.writeBuffer(settings,0,new Float32Array([step,time,active&&!regrowing&&count>0?1:0,frame]));
      if(reset||step<=0||remaining<=0){return;}
      encoder.clearBuffer(counter);
      const texture=(typeof flowTexture==='function'?flowTexture():flowTexture)||fallbackFlow;
      const pass=encoder.beginComputePass({label:'Detach, advect and cool sparse incandescent leaf fragments'});
      pass.setBindGroup(0,computeGroup(texture));
      pass.setPipeline(advancePipeline);pass.dispatchWorkgroups(CAPACITY/64);
      pass.setPipeline(detachPipeline);pass.dispatchWorkgroups(SPARK_SLOTS/64);
      pass.setPipeline(ashPipeline);pass.dispatchWorkgroups((CAPACITY-SPARK_SLOTS)/64);
      pass.end();
    },
    draw(pass,{sampleIndex=0}={}){
      if(destroyed||remaining<=0){return;}
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0,renderGroup,[sampleIndex*256]);
      pass.draw(6,CAPACITY);
    },
    async readStats(){
      if(destroyed||statsPending){return null;}
      statsPending=true;
      let buffer;
      try{
        buffer=statsReadback ||= device.createBuffer({label:'Asynchronous ember diagnostics',size:CAPACITY*64,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
        const encoder=device.createCommandEncoder({label:'Read persistent ember population'});
        encoder.copyBufferToBuffer(particles,0,buffer,0,CAPACITY*64);
        device.queue.submit([encoder.finish()]);
        await buffer.mapAsync(GPUMapMode.READ,0,CAPACITY*64);
        if(destroyed){return null;}
        const values=new Float32Array(buffer.getMappedRange(0,CAPACITY*64));
        let alive=0, hot=0, temperature=0, maxTemperature=0, sparks=0, ash=0;
        for(let i=0;i<CAPACITY;i++){
          const at=i*16, age=values[at+3], life=values[at+7];
          if(life<=0||age>=life){continue;}
          alive++;if(values[at+10]>=2){ash++;}else{sparks++;}
          const heat=values[at+9];temperature+=heat;maxTemperature=Math.max(maxTemperature,heat);
          if(heat>0.72){hot++;}
        }
        return {alive,hot,sparks,ash,dust:ash,temperatureAverage:temperature/Math.max(1,alive),maxTemperature};
      }catch{return null;}
      finally{if(buffer?.mapState==='mapped'){buffer.unmap();}statsPending=false;}
    },
    destroy(){
      if(destroyed){return;}
      destroyed=true;statsReadback?.destroy();statsReadback=null;
      particles.destroy();settings.destroy();counter.destroy();fallbackFlow.destroy();
    },
  };
}
