import { sharedWGSL } from './shaders.js?v=fire-v29d';
import { leafAshWGSL } from './leaf-ash.js?v=fire-v29d';

const CHUNKS_PER_BLADE = 3;
const CHUNKS_PER_ROOT = 15;
const STATE_BYTES = 96;
const WORKGROUP_SIZE = 128;

// Every two longitudinal mesh segments retain their own material identity.
// The original six vertices are posed by the same state in colour, shadow and
// depth passes: a leaf cannot disappear and be replaced by an unrelated quad.
export const fractureWGSL = /* wgsl */ `
struct LeafFracture {
  centerAge: vec4f,       // posed centre, stage-local seconds
  velocityLife: vec4f,    // independent velocity, free-flight lifetime
  axisUWidth: vec4f,      // posed unit across vector, captured full width
  axisVLength: vec4f,     // posed unit longitudinal vector, captured length
  anchorStage: vec4f,     // hinge; 0 intact / 1 hanging / 2 free / 3 spent / 4 renewing
  motion: vec4f,          // seed, hanging seconds, angle, dust fraction / renewal growth
};
struct LeafFracturePose { position: vec3f, normal: vec3f };
fn leafFractureChunk(t: f32) -> u32 {
  return select(select(0u,1u,t>=0.34),2u,t>=0.70);
}
fn fractureRotate(vector: vec3f, axis: vec3f, angle: f32) -> vec3f {
  let c=cos(angle);
  let s=sin(angle);
  return vector*c+cross(axis,vector)*s+axis*dot(axis,vector)*(1.0-c);
}
fn leafFractureTransform(state: LeafFracture,
    sourcePosition: vec3f, sourceNormal: vec3f,
    sourceHinge: vec3f, sourceCenter: vec3f,
    sourceAcross: vec3f, sourceAlong: vec3f,
    sourceWidth: f32, sourceLength: f32) -> LeafFracturePose {
  var result: LeafFracturePose;
  result.position=sourcePosition;
  result.normal=sourceNormal;
  if(state.anchorStage.w<0.5){return result;}
  if(state.anchorStage.w>3.5){
    result.position=sourceHinge+(sourcePosition-sourceHinge)*state.motion.w;
    return result;
  }
  if(state.anchorStage.w<1.5){
    result.position=sourceHinge+fractureRotate(sourcePosition-sourceHinge,sourceAcross,state.motion.z);
    result.normal=fractureRotate(sourceNormal,sourceAcross,state.motion.z);
    return result;
  }
  let normal=normalize(cross(sourceAcross,sourceAlong));
  let relative=sourcePosition-sourceCenter;
  let local=vec3f(dot(relative,sourceAcross)/max(0.0000001,sourceWidth),
    dot(relative,sourceAlong)/max(0.0000001,sourceLength),
    dot(relative,normal)/max(0.0000001,sourceLength));
  let posedNormal=normalize(cross(state.axisUWidth.xyz,state.axisVLength.xyz));
  result.position=state.centerAge.xyz+state.axisUWidth.xyz*local.x*state.axisUWidth.w
    +state.axisVLength.xyz*local.y*state.axisVLength.w+posedNormal*local.z*state.axisVLength.w;
  result.normal=normalize(state.axisUWidth.xyz*dot(sourceNormal,sourceAcross)
    +state.axisVLength.xyz*dot(sourceNormal,sourceAlong)+posedNormal*dot(sourceNormal,normal));
  return result;
}
`;

const simulationWGSL = sharedWGSL + leafAshWGSL + fractureWGSL + /* wgsl */ `
struct MeshVertex { position: vec4f, detail: vec4u };
struct FractureSettings { dt: f32, count: u32, time: f32, regrowing: u32 };
struct FractureSummary {
  intact: atomic<u32>, hanging: atomic<u32>, flying: atomic<u32>, spent: atomic<u32>,
  dusting: atomic<u32>, oldFlight: atomic<u32>, totalFlight: atomic<u32>, renewing: atomic<u32>,
};
@group(0) @binding(1) var<storage,read> plants: array<Particle>;
@group(0) @binding(2) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(3) var<storage,read> leafAsh: array<vec4f>;
@group(0) @binding(4) var<storage,read> growthField: array<vec4f>;
@group(0) @binding(5) var<storage,read_write> chunks: array<LeafFracture>;
@group(0) @binding(6) var<uniform> fracture: FractureSettings;
@group(0) @binding(7) var flow: texture_3d<f32>;
@group(0) @binding(8) var flowSampler: sampler;
@group(0) @binding(9) var<storage,read_write> summary: FractureSummary;
var<workgroup> partialA: array<vec4u,${WORKGROUP_SIZE}>;
var<workgroup> partialB: array<vec4u,${WORKGROUP_SIZE}>;
struct ChunkFrame { center: vec3f, hinge: vec3f, across: vec3f, along: vec3f, width: f32, length: f32 };
fn fractureCell(direction: vec3f) -> u32 {
  let longitude=fract(atan2(direction.z,direction.x)/6.28318530718+1.0);
  let latitude=acos(clamp(direction.y,-1.0,1.0))/3.14159265359;
  return min(63u,u32(longitude*64.0))+min(31u,u32(latitude*32.0))*64u;
}
fn fractureFrame(base: u32, section: u32) -> ChunkFrame {
  let first=base+section*4u;
  let a=(mesh[first].position.xyz+mesh[first+1u].position.xyz)*0.5;
  let b=(mesh[first+4u].position.xyz+mesh[first+5u].position.xyz)*0.5;
  let acrossVector=mesh[first+3u].position.xyz-mesh[first+2u].position.xyz;
  let across=normalize(acrossVector+vec3f(0.000000001,0.0,0.0));
  let alongVector=b-a;
  let along=normalize(alongVector-across*dot(alongVector,across)+vec3f(0.0,0.000000001,0.0));
  var frame: ChunkFrame;
  frame.center=(a+b)*0.5;
  frame.hinge=a;
  frame.across=across;
  frame.along=along;
  frame.width=max(0.0000001,length(acrossVector));
  frame.length=max(0.0000001,length(alongVector));
  return frame;
}
fn fractureAir(position: vec3f) -> vec3f {
  let minimum=mix(vec3f(-1.85,-1.60,-1.85),vec3f(-2.5,-0.55,-2.5),u.rideOrigin.w);
  let extent=mix(vec3f(3.70,4.65,3.70),vec3f(5.0,4.2,5.0),u.rideOrigin.w);
  let uv=(position-u.riderContact.xyz*u.rideOrigin.w-minimum)/extent;
  if(any(uv<vec3f(0.002))||any(uv>vec3f(0.998))){return vec3f(0.0);}
  return textureSampleLevel(flow,flowSampler,uv,0.0).xyz;
}
fn fractureSwirl(position: vec3f, seed: f32) -> vec3f {
  let time=fracture.time;
  let p=position*5.8+vec3f(seed*8.3,-time*0.65,time*0.17);
  let a=noiseGradient(p).yzw;
  let b=noiseGradient(p*1.83+vec3f(4.1,time*0.22,7.3)).yzw;
  return cross(a,vec3f(0.19,0.96,0.24))*0.035
    +cross(b,vec3f(0.83,-0.12,0.41))*0.012;
}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn advance(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x;
  if(index>=fracture.count*${CHUNKS_PER_ROOT}u||fracture.dt<=0.0){return;}
  let bladeIndex=index/${CHUNKS_PER_BLADE}u;
  let root=bladeIndex/5u;
  let section=index%${CHUNKS_PER_BLADE}u;
  let material=leafAsh[bladeIndex];
  // The overwhelming majority of the scene stays green; intact roots need
  // no per-chunk reads, frame reconstruction or noise evaluations.
  if(material.y<=0.0&&material.w<=0.0&&fracture.regrowing==0u){
    // A quality change may restore roots which were outside the previous
    // dispatch during regrowth. They belong to fresh material now, rather
    // than reviving a frozen old flake from the larger quality setting.
    if(chunks[index].anchorStage.w>0.5){chunks[index]=LeafFracture();}
    return;
  }
  var state=chunks[index];
  var stage=state.anchorStage.w;
  let dt=fracture.dt;
  let regrowing=fracture.regrowing>0u;
  var growth=vec4f(0.0);
  if(regrowing){growth=growthField[fractureCell(rideDirection(root))];}
  // Regrowth does not ignite another round of fracture. Existing hanging
  // pieces still detach and complete their flight; nothing is popped away
  // by the regrowth button. Unfractured material follows the shoot mesh.
  if(regrowing&&stage<0.5){return;}
  if(stage>3.5){
    state.centerAge.w+=dt;
    state.motion.w=smoothstep(0.0,state.velocityLife.w,state.centerAge.w);
    if(state.centerAge.w>=state.velocityLife.w){state=LeafFracture();}
    chunks[index]=state;
    return;
  }
  if(stage>2.5){
    if(regrowing&&growth.y>0.045){
      state.anchorStage.w=4.0;
      state.centerAge.w=0.0;
      state.velocityLife.w=mix(1.20,1.50,state.motion.x);
      state.motion.w=0.0;
      chunks[index]=state;
    }
    return;
  }
  if(stage<0.5){
    if(material.x<=0.015||plants[root].position.w<0.0000001){return;}
    let blade=bladeIndex%5u;
    let base=root*70u+blade*14u;
    let packed=unpack2x16float(mesh[base].detail.w).y;
    let seed=fract(packed)*10.0;
    let part=floor(packed);
    let centers=array<f32,3>(0.17,0.52,0.85);
    let threshold=leafAshThreshold(centers[section],0.65,seed,part)-0.015;
    if(material.x<threshold){return;}
    let identity=root*317u+blade*103u+section*43u+8911u;
    state.motion=vec4f(random(identity),mix(1.10,1.85,random(identity+1u)),0.0,0.0);
    state.centerAge.w=0.0;
    state.velocityLife.w=mix(4.8,7.0,random(identity+2u));
    state.anchorStage.w=1.0;
    stage=1.0;
  }
  if(stage<1.5){
    let blade=bladeIndex%5u;
    let base=root*70u+blade*14u;
    let frame=fractureFrame(base,section);
    let age=state.centerAge.w+dt;
    let progress=clamp(age/state.motion.y,0.0,1.0);
    let sign=select(-1.0,1.0,state.motion.x>0.24);
    let sag=sign*mix(0.65,1.30,state.motion.x)*smoothstep(0.0,0.92,progress);
    let breeze=sin(age*(8.0+state.motion.x*4.5)+state.motion.x*21.0)*0.075*progress;
    let angle=sag+breeze;
    let across=frame.across;
    let along=fractureRotate(frame.along,across,angle);
    let center=frame.hinge+fractureRotate(frame.center-frame.hinge,across,angle);
    state.centerAge=vec4f(center,age);
    state.axisUWidth=vec4f(across,frame.width);
    state.axisVLength=vec4f(along,frame.length);
    state.anchorStage=vec4f(frame.hinge,state.anchorStage.w);
    state.motion.z=angle;
    if(age>=state.motion.y){
      let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
      let normal=normalize(cross(across,along));
      let kick=normal*mix(0.028,0.065,state.motion.x)+across*sin(state.motion.x*47.0)*0.032;
      // First lose support and tip downward. A short delay before entrainment
      // makes detachment readable rather than a weightless upward teleport.
      state.velocityLife=vec4f(fractureAir(center)*0.10-up*mix(0.065,0.12,state.motion.x)+kick,state.velocityLife.w);
      state.centerAge.w=0.0;
      state.anchorStage.w=2.0;
    }
    chunks[index]=state;
    return;
  }
  let age=state.centerAge.w+dt;
  let life=state.velocityLife.w;
  if(age>=life){
    state.anchorStage.w=3.0;
    state.motion.w=1.0;
    if(regrowing&&growth.y>0.045){
      state.anchorStage.w=4.0;
      state.centerAge.w=0.0;
      state.velocityLife.w=mix(1.20,1.50,state.motion.x);
      state.motion.w=0.0;
    }
    chunks[index]=state;
    return;
  }
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let seed=state.motion.x;
  let position=state.centerAge.xyz;
  let air=fractureAir(position);
  let entrainment=smoothstep(0.18,0.62,age);
  let inertia=mix(1.30,2.40,seed);
  let response=1.0-exp(-dt*inertia*entrainment);
  let breeze=fractureSwirl(position,seed)+vec3f(0.017,0.0,-0.008);
  let flutter=sin(age*(8.5+seed*5.0)+seed*31.0);
  let normal=normalize(cross(state.axisUWidth.xyz,state.axisVLength.xyz));
  let targetVelocity=air*mix(0.78,1.06,seed)+breeze+up*0.035
    +normal*flutter*0.025;
  var velocity=mix(state.velocityLife.xyz,targetVelocity,response);
  velocity-=up*dt*0.15*(1.0-entrainment);
  // Aerodynamic lift couples flutter to the same resolved gas field. The
  // small residual curl gives flat, cooling fragments a visible slow roll.
  let torqueAxis=normalize(state.axisUWidth.xyz*(0.70+seed*0.4)
    +state.axisVLength.xyz*sin(age*1.9+seed*15.0)*0.43+up*0.19);
  let spin=mix(2.5,5.4,seed)*(0.52+0.48*entrainment)
    +clamp(length(air-velocity)*5.0,0.0,2.3);
  let across=normalize(fractureRotate(state.axisUWidth.xyz,torqueAxis,dt*spin));
  var along=fractureRotate(state.axisVLength.xyz,torqueAxis,dt*spin);
  along=normalize(along-across*dot(along,across));
  state.centerAge=vec4f(position+velocity*dt,age);
  state.velocityLife=vec4f(velocity,state.velocityLife.w);
  state.axisUWidth=vec4f(across,state.axisUWidth.w);
  state.axisVLength=vec4f(along,state.axisVLength.w);
  let powderDuration=mix(1.8,2.5,seed);
  state.motion.w=smoothstep(life-powderDuration,life,age);
  chunks[index]=state;
}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn summarize(@builtin(global_invocation_id) invocation: vec3u,
    @builtin(local_invocation_index) local: u32) {
  let index=invocation.x;
  var a=vec4u(0u);
  var b=vec4u(0u);
  if(index<fracture.count*${CHUNKS_PER_ROOT}u){
    let state=chunks[index];
    let stage=u32(state.anchorStage.w+0.5);
    if(stage==0u){a.x=1u;}
    if(stage==1u){a.y=1u;}
    if(stage==2u){
      a.z=1u;
      b.x=select(0u,1u,state.motion.w>0.01);
      b.y=select(0u,1u,state.centerAge.w>1.0);
      b.z=u32(min(30.0,state.centerAge.w)*100.0);
    }
    if(stage==3u){a.w=1u;}
    if(stage==4u){a.x=1u;b.w=1u;}
  }
  partialA[local]=a;
  partialB[local]=b;
  workgroupBarrier();
  for(var stride=${WORKGROUP_SIZE/2}u;stride>0u;stride/=2u){
    if(local<stride){partialA[local]+=partialA[local+stride];partialB[local]+=partialB[local+stride];}
    workgroupBarrier();
  }
  if(local==0u){
    atomicAdd(&summary.intact,partialA[0].x);
    atomicAdd(&summary.hanging,partialA[0].y);
    atomicAdd(&summary.flying,partialA[0].z);
    atomicAdd(&summary.spent,partialA[0].w);
    atomicAdd(&summary.dusting,partialB[0].x);
    atomicAdd(&summary.oldFlight,partialB[0].y);
    atomicAdd(&summary.totalFlight,partialB[0].z);
    atomicAdd(&summary.renewing,partialB[0].w);
  }
}
`;

/** A finite, persistent 3-piece identity for each of the five actual blades. */
export async function createLeafFracture(device, {
  uniforms, plants, meshVertices, leafAshState, growthBuffer, maxParticles = 48000,
} = {}) {
  const roots=Math.max(1,Math.floor(maxParticles));
  const capacity=roots*CHUNKS_PER_ROOT;
  const stateBuffer=device.createBuffer({label:'Leaf fracture · three persistent sections per actual blade',size:capacity*STATE_BYTES,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const settings=device.createBuffer({label:'Leaf fracture · real elapsed time and lifecycle',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const summary=device.createBuffer({label:'Leaf fracture · reduced lifecycle counts',size:32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  const fallback=device.createTexture({label:'Leaf fracture · still air fallback',size:[1,1,1],dimension:'3d',format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING});
  const sampler=device.createSampler({label:'Leaf fracture · resolved hot air trilinear sampling',minFilter:'linear',magFilter:'linear',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge',addressModeW:'clamp-to-edge'});
  const owned=[stateBuffer,settings,summary,fallback];
  const controlBytes=new ArrayBuffer(16);
  const controlsF=new Float32Array(controlBytes);
  const controlsU=new Uint32Array(controlBytes);
  let first=true,destroyed=false,time=0,remaining=0,lastCount=0,statsPending=false,readback=null;
  try {
    const layout=device.createBindGroupLayout({label:'Leaf fracture · material and gas state',entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:256}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:16}},
      {binding:7,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},
      {binding:8,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}},
      {binding:9,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:32}},
    ]});
    const groups=new WeakMap();
    const groupFor=texture=>{
      let group=groups.get(texture);
      if(!group){
        group=device.createBindGroup({label:'Leaf fracture · current velocity field',layout,entries:[
          {binding:0,resource:{buffer:uniforms}},
          {binding:1,resource:{buffer:plants}},
          {binding:2,resource:{buffer:meshVertices}},
          {binding:3,resource:{buffer:leafAshState}},
          {binding:4,resource:{buffer:growthBuffer}},
          {binding:5,resource:{buffer:stateBuffer}},
          {binding:6,resource:{buffer:settings}},
          {binding:7,resource:texture.createView()},
          {binding:8,resource:sampler},
          {binding:9,resource:{buffer:summary}},
        ]});
        groups.set(texture,group);
      }
      return group;
    };
    const module=device.createShaderModule({label:'Leaf fracture · crack, hang, release, tumble and powder',code:simulationWGSL});
    const compilation=await module.getCompilationInfo();
    const errors=compilation.messages.filter(message=>message.type==='error');
    if(errors.length){throw new Error(`Leaf fracture: ${errors.map(message=>message.message).join('; ')}`);}
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
    const [advancePipeline,summaryPipeline]=await Promise.all(['advance','summarize'].map(entryPoint=>
      device.createComputePipelineAsync({label:`Leaf fracture · ${entryPoint}`,layout:pipelineLayout,compute:{module,entryPoint}})));
    return {
      stateBuffer,
      get active(){return remaining>0;},
      encode(encoder,{dt=0,count=0,active=false,regrowing=false,clear=false,flowTexture}={}){
        if(destroyed){return;}
        const reset=first||clear;
        const step=reset?0:Number.isFinite(dt)?Math.min(1/15,Math.max(0,dt)):0;
        lastCount=Math.min(roots,Math.max(0,Math.floor(count)));
        time=reset?0:time+step;
        remaining=reset?0:active&&!regrowing?45:Math.max(0,remaining-step);
        if(reset){encoder.clearBuffer(stateBuffer);encoder.clearBuffer(summary);first=false;}
        controlsF[0]=step;
        controlsU[1]=lastCount;
        controlsF[2]=time;
        controlsU[3]=regrowing?1:0;
        device.queue.writeBuffer(settings,0,controlBytes);
        if(reset||step<=0||lastCount<=0||(!remaining&&!regrowing)){return;}
        const texture=(typeof flowTexture==='function'?flowTexture():flowTexture)||fallback;
        const pass=encoder.beginComputePass({label:'Leaf fracture · pose finite material sections in resolved hot air'});
        pass.setPipeline(advancePipeline);
        pass.setBindGroup(0,groupFor(texture));
        pass.dispatchWorkgroups(Math.ceil(lastCount*CHUNKS_PER_ROOT/WORKGROUP_SIZE));
        pass.end();
      },
      async readStats(){
        if(destroyed||statsPending){return null;}
        statsPending=true;
        let buffer;
        try {
          buffer=readback ||= device.createBuffer({label:'Leaf fracture · asynchronous 32-byte lifecycle summary',size:32,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
          const encoder=device.createCommandEncoder({label:'Leaf fracture · reduce material lifecycle diagnostics'});
          encoder.clearBuffer(summary);
          if(lastCount>0){
            const pass=encoder.beginComputePass({label:'Leaf fracture · classify attached and detached material'});
            pass.setPipeline(summaryPipeline);
            pass.setBindGroup(0,groupFor(fallback));
            pass.dispatchWorkgroups(Math.ceil(lastCount*CHUNKS_PER_ROOT/WORKGROUP_SIZE));
            pass.end();
          }
          encoder.copyBufferToBuffer(summary,0,buffer,0,32);
          device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ,0,32);
          if(destroyed){return null;}
          const values=new Uint32Array(buffer.getMappedRange(0,32));
          return {chunks:lastCount*CHUNKS_PER_ROOT,intact:values[0],hanging:values[1],flying:values[2],spent:values[3],
            dusting:values[4],oldFlight:values[5],flightAgeAverage:values[6]/Math.max(1,values[2]*100),renewing:values[7]};
        } catch {return null;}
        finally {if(buffer?.mapState==='mapped'){buffer.unmap();}statsPending=false;}
      },
      destroy(){
        if(destroyed){return;}
        destroyed=true;remaining=0;readback?.destroy();readback=null;
        for(const resource of owned){resource.destroy();}
      },
    };
  } catch(error){
    for(const resource of owned){resource.destroy();}
    throw error;
  }
}
