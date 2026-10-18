import { sharedWGSL } from './shaders.js?v=fire-v23b';
import { leafAshWGSL } from './leaf-ash.js?v=fire-v23b';

// A small persistent pool of incandescent fragments, rather than a looping
// particle texture. A fragment leaves an actual leaf, then keeps its own
// world-space trajectory and cooling history after that leaf moves away.
const CAPACITY = 1536;
const SPARK_SLOTS = 512;
const MAX_SPARKS = 48;
const MAX_ASH = 128;
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

const computeWGSL = sharedWGSL + leafAshWGSL + particleCommon + /* wgsl */ `
struct EmberCount { sparks: atomic<u32>, ash: atomic<u32> };
struct MeshVertex { position: vec4f, detail: vec4u };
@group(0) @binding(1) var<storage,read_write> embers: array<Ember>;
@group(0) @binding(2) var<storage,read> plants: array<Particle>;
@group(0) @binding(3) var<storage,read> fireState: array<vec4f>;
@group(0) @binding(4) var flowField: texture_3d<f32>;
@group(0) @binding(5) var flowSampler: sampler;
@group(0) @binding(7) var<storage,read_write> count: EmberCount;
@group(0) @binding(8) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(9) var<storage,read> leafAshState: array<vec4f>;
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
fn meshLeafPosition(base: u32,t: f32,w: f32) -> vec3f {
  let rows=array<f32,7>(0.0,0.16,0.34,0.52,0.70,0.86,1.0);
  var row=0u;
  for(var segment=0u;segment<6u;segment++){
    if(t>=rows[segment]){row=segment;}
  }
  let across=clamp(w*0.5+0.5,0.0,1.0);
  let lower=mix(mesh[base+row*2u].position.xyz,mesh[base+row*2u+1u].position.xyz,across);
  let upper=mix(mesh[base+(row+1u)*2u].position.xyz,mesh[base+(row+1u)*2u+1u].position.xyz,across);
  return mix(lower,upper,(t-rows[row])/(rows[row+1u]-rows[row]));
}
fn meshNormal(packed: u32) -> vec3f {
  let encoded=unpack2x16snorm(packed);
  var n=vec3f(encoded,1.0-abs(encoded.x)-abs(encoded.y));
  let t=clamp(-n.z,0.0,1.0);
  n=vec3f(n.xy+select(vec2f(t),vec2f(-t),n.xy>=vec2f(0.0)),n.z);
  return normalize(n);
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
  let response=1.0-exp(-dt*mix(mix(3.4,1.8,flake),mix(2.2,1.25,flake),select(0.0,1.0,isAsh)));
  let ambient=vec3f(0.026,0.0,0.014)+eddy(position,emberSettings.time);
  let warmLift=up*select(0.055*ember.thermal.y-0.025*flake,0.025*ember.thermal.y-0.035-0.055*flake,isAsh);
  let targetVelocity=flow*mix(0.92,0.68,flake)+ambient+warmLift;
  var velocity=mix(ember.velocityLife.xyz,targetVelocity,response);
  let flutter=sin(age*(13.0+ember.thermal.w*5.0)+ember.thermal.w*38.0);
  velocity+=cross(up,velocity+vec3f(0.031,0.0,0.018))*flutter*mix(flake,0.8+flake,select(0.0,1.0,isAsh))*dt*1.8;
  ember.positionAge=vec4f(position+velocity*dt,age);
  ember.velocityLife=vec4f(velocity,ember.velocityLife.w);
  ember.thermal.y*=exp(-dt*select(mix(0.40,0.32,flake),1.45,isAsh));
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
  if(rootCount<1u||random(seed)>emberSettings.dt*0.56){return;}
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
  let packedMaterial=unpack2x16float(mesh[base].detail.w).y;
  let sourceSeed=fract(packedMaterial)*10.0;
  let part=floor(packedMaterial);
  let erosion=leafAshState[identity*5u+blade].x;
  let w=f32(edge)*2.0-1.0;
  for(var retreat=0u;retreat<16u;retreat++){
    if(leafAshSigned(erosion,t,w,sourceSeed,part)>0.008){break;}
    t=max(0.015,t-0.045);
  }
  if(leafAshSigned(erosion,t,w,sourceSeed,part)<=0.0){return;}
  let reservation=atomicAdd(&count.sparks,1u);
  if(reservation>=${MAX_SPARKS}u){return;}
  let rows=array<f32,7>(0.0,0.16,0.34,0.52,0.70,0.86,1.0);
  var row=0u;
  for(var segment=0u;segment<6u;segment++){
    if(t>=rows[segment]){row=segment;}
  }
  let lower=mesh[base+row*2u+edge].position.xyz;
  let upper=mesh[base+(row+1u)*2u+edge].position.xyz;
  let position=mix(lower,upper,(t-rows[row])/(rows[row+1u]-rows[row]))+normalize(plant.normal.xyz)*0.004;
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let growth=normalize(up*0.80+plant.normal.xyz*0.34);
  let radial=mix(vec3f(1.0,0.0,0.0),u.worldRight.xyz,u.rideOrigin.w);
  let bend=normalize(radial-growth*dot(radial,growth)+vec3f(0.00001));
  let across=normalize(cross(growth,bend));
  let heading=random(seed+6u)*6.2831853;
  let sideways=bend*cos(heading)+across*sin(heading);
  let kick=mix(0.12,0.30,pow(random(seed+7u),2.0));
  let velocity=airVelocity(position)*0.48+sideways*kick+up*mix(0.15,0.32,random(seed+8u))
    +normalize(plant.normal.xyz)*mix(0.10,0.16,random(seed+14u));
  let flake=select(0.0,1.0,random(seed+9u)>0.93);
  var ember: Ember;
  ember.positionAge=vec4f(position,0.0);
  ember.velocityLife=vec4f(velocity,mix(2.0,3.3,random(seed+10u))+flake*0.30);
  ember.thermal=vec4f(mix(0.55,0.95,random(seed+11u))+flake*0.20,
    mix(0.83,1.08,random(seed+12u)),flake,random(seed+13u));
  ember.orientation=vec4f(plant.normal.xyz,0.0);
  embers[index]=ember;
}
@compute @workgroup_size(64)
fn detachAsh(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x+${SPARK_SLOTS}u;
  if(index>=${CAPACITY}u||emberSettings.dt<=0.0||emberSettings.spawning<0.5){return;}
  if(embers[index].velocityLife.w>0.0&&embers[index].positionAge.w<embers[index].velocityLife.w){return;}
  if(atomicLoad(&count.ash)>=${MAX_ASH}u){return;}
  let seed=hash32(index*617u+u32(emberSettings.frame)*1583u+7231u);
  let rootCount=u32(u.viewport.w);
  if(rootCount<1u){return;}
  let identity=min(rootCount-1u,u32(random(seed)*f32(rootCount)));
  let blade=min(4u,u32(random(seed+1u)*5.0));
  let release=leafAshState[identity*5u+blade];
  // z is a mass delta for this exact frame, already proportional to dt. Its
  // probability is deliberately NOT multiplied by dt a second time. Cooling
  // old char cannot continuously emit ash after material has stopped eroding.
  if(release.z<=0.000001||random(seed+2u)>min(0.60,release.z*20.0)){return;}
  let plant=plants[identity];
  if(plant.position.w<0.00015||(plant.material.z>0.5&&u.rideOrigin.w<0.65)){return;}
  let base=identity*70u+blade*14u;
  let packed=unpack2x16float(mesh[base].detail.w).y;
  let bladeSeed=fract(packed)*10.0;
  let part=floor(packed);
  let w=select(-1.0,1.0,random(seed+3u)>0.5)*mix(0.36,0.95,random(seed+4u));
  let boundary=max(0.0,release.x-release.z*random(seed+5u));
  var sourceT=0.95;
  var bestError=100.0;
  // The same fractured threshold as the leaf's discard mask locates a chip
  // on its newly disappearing edge. Scan the non-monotone cracks, then refine
  // locally; no position is inferred from a smooth approximate burn sphere.
  for(var sample=0u;sample<17u;sample++){
    let candidate=mix(0.025,0.985,f32(sample)/16.0);
    let error=abs(leafAshThreshold(candidate,w,bladeSeed,part)-boundary);
    if(error<bestError){bestError=error;sourceT=candidate;}
  }
  var spacing=0.030;
  for(var refinement=0u;refinement<4u;refinement++){
    let left=clamp(sourceT-spacing,0.015,0.995);
    let right=clamp(sourceT+spacing,0.015,0.995);
    let a=abs(leafAshThreshold(left,w,bladeSeed,part)-boundary);
    let b=abs(leafAshThreshold(right,w,bladeSeed,part)-boundary);
    if(a<bestError){sourceT=left;bestError=a;}
    if(b<bestError){sourceT=right;bestError=b;}
    spacing*=0.48;
  }
  if(bestError>0.065){return;}
  let reservation=atomicAdd(&count.ash,1u);
  if(reservation>=${MAX_ASH}u){return;}
  let normal=meshNormal(mesh[base+4u].detail.x);
  let position=meshLeafPosition(base,sourceT,w)+normal*0.001;
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let side=normalize(cross(up,normal)+vec3f(0.001,0.0,0.002));
  let direction=select(-1.0,1.0,random(seed+6u)>0.5);
  let mass=random(seed+7u);
  let state=fireState[fireCell(rideDirection(identity))];
  let hot=select(0.07,mix(0.57,0.83,random(seed+8u)),random(seed+9u)<0.22&&state.x>0.43);
  let velocity=airVelocity(position)*mix(0.43,0.67,random(seed+10u))
    +side*direction*mix(0.025,0.12,random(seed+11u))+normal*0.025
    +up*mix(-0.018,0.065,random(seed+12u));
  var fragment: Ember;
  fragment.positionAge=vec4f(position,0.0);
  fragment.velocityLife=vec4f(velocity,mix(3.0,5.2,random(seed+13u)));
  fragment.thermal=vec4f(mix(0.78,1.65,random(seed+14u)),hot,2.0+mass,random(seed+15u));
  fragment.orientation=vec4f(normal,mix(3.0,9.0,random(seed+16u))*direction);
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
  let pixelRadius=ember.thermal.x*clamp(3.58/clip.w,0.25,5.0)*u.camera.z;
  let stretch=1.0+min(1.15,motionLength/max(pixelRadius,0.15));
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
  let core=1.0-smoothstep(0.62-footprint,0.92+footprint,distance);
  let halo=exp(-distance*distance*1.25)*0.10;
  let fade=smoothstep(0.0,0.025,age)*(1.0-smoothstep(0.64,1.0,fraction));
  let red=vec3f(1.00,0.023,0.001);
  let orange=vec3f(3.20,0.44,0.008);
  let gold=vec3f(5.0,2.25,0.30);
  var color=mix(red,orange,smoothstep(0.22,0.67,temperature));
  color=mix(color,gold,smoothstep(0.72,1.06,temperature));
  let flutter=mix(0.80,1.0,0.5+0.5*sin(age*23.0+input.thermal.w*41.0));
  let intensity=fade*flutter*smoothstep(0.15,0.45,temperature);
  let emission=(color*core*1.4+vec3f(2.8,0.29,0.003)*halo)*intensity;
  let opacity=(core*0.88+halo*0.30)*fade;
  return vec4f(emission,opacity);
}
`;

export async function createEmberParticles(device, {
  uniforms, sampleUniforms, plants, fireState, meshVertices, leafAshState,
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
    {binding:9,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
  ]});
  const renderLayout = device.createBindGroupLayout({entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:256}},
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
    {binding:6,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  ]});
  const computeModule=device.createShaderModule({label:'Detached hot leaf fragment dynamics',code:computeWGSL});
  const renderModule=device.createShaderModule({label:'Subpixel incandescent fragment radiance',code:renderWGSL});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[computeLayout]});
  const [advancePipeline,detachPipeline,ashPipeline,renderPipeline]=await Promise.all([
    device.createComputePipelineAsync({label:'Advect and cool live embers',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'advance'}}),
    device.createComputePipelineAsync({label:'Release sparse burning leaf tips',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'detach'}}),
    device.createComputePipelineAsync({label:'Release finite eroded carbon flakes',layout:pipelineLayout,compute:{module:computeModule,entryPoint:'detachAsh'}}),
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
        {binding:9,resource:{buffer:leafAshState}},
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
        return {alive,hot,sparks,ash,temperatureAverage:temperature/Math.max(1,alive),maxTemperature};
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
