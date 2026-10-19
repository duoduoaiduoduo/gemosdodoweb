import { sharedWGSL } from './shaders.js?v=fire-v28c';
import { fireFieldWGSL } from './fire-simulation.js?v=fire-v28c';
import { leafAshWGSL } from './leaf-ash.js?v=fire-v28c';
import { fractureWGSL } from './leaf-fracture.js?v=fire-v28c';
import { botanicalWGSL, GRASS_VERTEX_COUNT, FLOWER_VERTEX_COUNT } from './botanical.js?v=flower-ratio-v17';

export const FLOWER_ROOT_STRIDE = 16;
export const CRUST_ROWS = 96;
export const CRUST_COLUMNS = 128;
export const CRUST_VERTEX_COUNT = (CRUST_ROWS+1)*(CRUST_COLUMNS+1);
const crustIndices=[];
for(let y=0;y<CRUST_ROWS;y++) for(let x=0;x<CRUST_COLUMNS;x++) {
  const a=y*(CRUST_COLUMNS+1)+x,b=a+1,c=a+CRUST_COLUMNS+1,d=c+1;
  crustIndices.push(a,b,c,c,b,d);
}
export const CRUST_INDICES = new Uint16Array(crustIndices);
// Each segment owns its four render vertices. The compute mesh stays at 70
// vertices per tuft; duplicated segment edges can separate at real fractures.
const grassRenderIndices=[];
for(let blade=0;blade<5;blade++) for(let segment=0;segment<6;segment++) {
  const base=blade*24+segment*4;
  grassRenderIndices.push(base,base+1,base+2,base+2,base+1,base+3);
}
export const GRASS_RENDER_INDICES=new Uint16Array(grassRenderIndices);

export const meshWGSL = leafAshWGSL + fractureWGSL + /* wgsl */ `
struct MeshVertex {
  position: vec4f, // xyz position; w packs sky/heat/char as an exact 24-bit integer
  detail: vec4u, // octahedral normal, UV, linear RG, linear B + botanical part/seed
};
const GRASS_VERTICES: u32 = ${GRASS_VERTEX_COUNT}u;
const FLOWER_VERTICES: u32 = ${FLOWER_VERTEX_COUNT}u;
const FLOWER_STRIDE: u32 = ${FLOWER_ROOT_STRIDE}u;
const CRUST_VERTEX_COUNT: u32 = ${CRUST_VERTEX_COUNT}u;
const CRUST_COLUMNS: u32 = ${CRUST_COLUMNS}u;
const CRUST_ROWS: u32 = ${CRUST_ROWS}u;
fn octEncode(value: vec3f) -> vec2f {
  let n = value/(abs(value.x)+abs(value.y)+abs(value.z));
  let signs = select(vec2f(-1.0),vec2f(1.0),n.xy>=vec2f(0.0));
  return select((vec2f(1.0)-abs(n.yx))*signs,n.xy,n.z>=0.0);
}
fn octDecode(value: vec2f) -> vec3f {
  var n = vec3f(value,1.0-abs(value.x)-abs(value.y));
  let t = clamp(-n.z,0.0,1.0);
  n = vec3f(n.xy+select(vec2f(t),vec2f(-t),n.xy>=vec2f(0.0)),n.z);
  return normalize(n);
}
fn grassStoredVertex(vertexIndex: u32) -> u32 {
  if (u.worldRight.w<0.5) { return vertexIndex; }
  let blade=vertexIndex/24u;
  let local=vertexIndex%24u;
  let segment=local/4u;
  let corner=local%4u;
  return blade*14u+(segment+corner/2u)*2u+corner%2u;
}
fn meshIndex(vertexIndex: u32, instance: u32) -> u32 {
  let count = u32(u.viewport.w);
  if (instance<count) { return instance*GRASS_VERTICES+grassStoredVertex(vertexIndex); }
  let flowerCount=(count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let flowerCloneStart=2u*count+flowerCount+1u;
  if (instance>=flowerCloneStart) {
    return count*GRASS_VERTICES+((instance-flowerCloneStart)%flowerCount)*FLOWER_VERTICES+vertexIndex;
  }
  if (instance>count+flowerCount) { return (instance-count-flowerCount-1u)*GRASS_VERTICES+grassStoredVertex(vertexIndex); }
  if (instance==count+flowerCount) { return count*GRASS_VERTICES+flowerCount*FLOWER_VERTICES+vertexIndex; }
  return count*GRASS_VERTICES+(instance-count)*FLOWER_VERTICES+vertexIndex;
}
fn rotateTillering(vector: vec3f, angle: f32) -> vec3f {
  let axis=normalize(u.worldUp.xyz);
  let c=cos(angle);
  let s=sin(angle);
  return vector*c+cross(axis,vector)*s+axis*dot(axis,vector)*(1.0-c);
}
// Stable ranks grow/shrink whole plants; density never reseeds the flowing roots.
fn flowerCoverage(identity: u32, coverage: f32) -> f32 {
  let rank=mix(0.025,0.975,random(identity*193u+3767u));
  return smoothstep(rank-0.025,rank+0.025,clamp(coverage,0.0,1.0));
}
fn flowerGrowth(instance: u32) -> f32 {
  let ratio=clamp(u.domainNormal.w,0.0,2.0);
  let referenceGrowth=flowerCoverage(instance,min(ratio,1.0));
  if (instance%32u==0u) { return referenceGrowth; }
  let extraGrowth=flowerCoverage(instance,max(ratio-1.0,0.0));
  return mix(extraGrowth,referenceGrowth,smoothstep(0.35,0.85,u.rideOrigin.w));
}
// The same material front drives deformation and shading. Thin margins and
// tips lose their moisture first; the midrib and root remain supported longer.
// Progress is persistent fuel damage, rather than a time-based colour pulse.
fn botanicalBurnPhase(progress: f32, t: f32, w: f32, part: f32) -> f32 {
  let thinSurface=part<0.5 || (part>1.5 && part<2.5) || part>3.5;
  let marginAdvance=select(0.0,0.095*pow(clamp(abs(w),0.0,1.0),4.0),thinSurface);
  let axialDelay=select(0.96,0.86,part>1.5 && part<2.5);
  return progress*1.36-(1.0-clamp(t,0.0,1.0))*axialDelay-0.10+marginAdvance;
}
fn botanicalLocalChar(phase: f32) -> f32 {
  return smoothstep(0.018,0.21,phase);
}
fn botanicalErosionCoverage(erosion: f32, signedDistance: f32, footprint: f32, part: f32) -> f32 {
  let aa=max(0.002,footprint*0.65);
  let covered=smoothstep(-aa,aa,signedDistance);
  let spent=select(covered,0.0,erosion>=0.99);
  return select(spent,1.0,erosion<=0.00001 || part>5.5);
}
fn botanicalMaterialSigned(erosion: f32, uv: vec2f, seed: f32, part: f32, fracture: vec4f) -> f32 {
  if (part>=0.5) { return leafAshSigned(erosion,uv.y,uv.x,seed,part); }
  // Whole grass strips remain present through carbonisation and hanging.
  // Only their narrow attachments tear before release; the long free strip
  // powders at the end of its own lifetime, independently of the old fuel mask.
  if (fracture.x<0.5) { return 1.0; }
  if (fracture.x>3.5) { return 1.0; }
  if (fracture.x>2.5) { return -1.0; }
  let t=clamp(uv.y,0.0,1.0);
  let w=clamp(abs(uv.x),0.0,1.0);
  let seamDistance=min(t,min(abs(t-0.34),abs(t-0.70)));
  let tooth=abs(fract(uv.x*1.7+seed*11.3)-0.5)*2.0;
  let hanging=fracture.x<1.5;
  let crack=select(1.0,smoothstep(0.03,0.92,fracture.y/max(0.1,fracture.z)),hanging);
  let seamSize=crack*(0.004+0.012*tooth);
  let bridge=mix(1.05,0.055,crack);
  let tear=max(seamDistance-seamSize,bridge-w);
  if (hanging || fracture.w<=0.0001) { return tear; }
  let longFibres=abs(fract(t*13.0+seed*17.1+uv.x*0.8)-0.5)*2.0;
  let acrossFibres=abs(fract(uv.x*3.1+seed*7.9)-0.5)*2.0;
  let remaining=0.14+0.86*(longFibres*0.60+acrossFibres*0.40);
  return min(tear,remaining-fracture.w*1.15);
}
fn botanicalMaterialCoverage(erosion: f32, signedDistance: f32, footprint: f32, part: f32, fracture: vec4f) -> f32 {
  if (part>=0.5) { return botanicalErosionCoverage(erosion,signedDistance,footprint,part); }
  if (fracture.x<0.5) { return 1.0; }
  if (fracture.x>3.5) { return 1.0; }
  if (fracture.x>2.5) { return 0.0; }
  let aa=max(0.002,footprint*0.65);
  return smoothstep(-aa,aa,signedDistance);
}
// Write a coverage mask with opaque surviving samples. Alpha-to-coverage would
// otherwise square the film's resolved alpha and brighten the exposed gaps.
fn botanicalCoverageMask(coverage: f32) -> u32 {
  let count=u32(clamp(floor(coverage*4.0+0.5),0.0,4.0));
  let masks=array<u32,5>(0u,1u,5u,7u,15u);
  return masks[count];
}
fn sunDirection() -> vec3f {
  return referenceSunDirection();
}
fn sunCoordinates(position: vec3f) -> vec3f {
  let point=position-u.riderContact.xyz*u.rideOrigin.w;
  let sun=sunDirection();
  let skyUp=normalize(mix(macroToWorld(vec3f(0.0,1.0,0.0)),u.worldUp.xyz,u.rideOrigin.w));
  let right=normalize(cross(skyUp,sun));
  let up=cross(sun,right);
  let extent=mix(2.35,3.0,u.rideOrigin.w);
  return vec3f(dot(point,right)/extent,dot(point,up)/extent,0.5-dot(point,sun)/(extent*2.0));
}
`;

export const geometryWGSL = sharedWGSL + botanicalWGSL + meshWGSL + fireFieldWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage,read> plants: array<Particle>;
@group(0) @binding(2) var<storage,read_write> mesh: array<MeshVertex>;
@group(0) @binding(3) var<storage,read> fireField: array<vec4f>;
@group(0) @binding(4) var<storage,read> plantRecovery: array<vec4f>;
@group(0) @binding(5) var<storage,read> leafAshStates: array<vec4f>;
@compute @workgroup_size(128)
fn generate(@builtin(global_invocation_id) invocation: vec3u) {
  let count = u32(u.viewport.w);
  let grassEnd = count*GRASS_VERTICES;
  let flowerCount = (count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let index = invocation.x;
  let botanicalEnd=grassEnd+flowerCount*FLOWER_VERTICES;
  if (index>=botanicalEnd+CRUST_VERTEX_COUNT) { return; }
  if (index>=botanicalEnd) {
    let crustIndex=index-botanicalEnd;
    let theta=f32(crustIndex/(CRUST_COLUMNS+1u))/f32(CRUST_ROWS)*(3.14159265359-0.18);
    let azimuth=f32(crustIndex%(CRUST_COLUMNS+1u))/f32(CRUST_COLUMNS)*6.28318530718;
    let tangent=u.domainRight.xyz*cos(azimuth)+u.domainForward.xyz*sin(azimuth);
    let direction=u.domainNormal.xyz*cos(theta)+tangent*sin(theta);
    let original=crustSurface(direction);
    let position=unfoldPosition(original,direction);
    let directionR=normalize(direction+u.domainRight.xyz*0.003);
    let directionF=normalize(direction+u.domainForward.xyz*0.003);
    let pointR=unfoldPosition(crustSurface(directionR),directionR);
    let pointF=unfoldPosition(crustSurface(directionF),directionF);
    let derivativeNormal=cross(pointF-position,pointR-position);
    let normalLength=length(derivativeNormal);
    var microNormal=derivativeNormal/max(normalLength,0.00000001);
    microNormal=select(microNormal,-microNormal,dot(microNormal,u.worldUp.xyz)<0.0);
    microNormal=normalize(mix(unfoldNormal(direction),microNormal,u.rideOrigin.w*select(0.0,1.0,normalLength>0.000000001)));
    let color=srgbToLinear(referenceParticle(worldToMacro(original),crustIndex));
    // The optical-scale support is below the same grass roots. Fine green
    // fibers shade its gaps, rather than exposing pale background through them.
    let combustion=fireField[fireCell(direction)];
    let packedLight=178u | (u32(clamp(combustion.x,0.0,1.0)*255.0)<<8u) | (u32(clamp(combustion.z,0.0,1.0)*255.0)<<16u);
    mesh[index].position=vec4f(position,f32(packedLight));
    mesh[index].detail=vec4u(pack2x16snorm(octEncode(microNormal)),pack2x16float(vec2f(0.0)),
      pack2x16float(color.rg*0.75),pack2x16float(vec2f(color.b*0.75,6.0)));
    return;
  }
  var instance = index/GRASS_VERTICES;
  var vertexIndex = index%GRASS_VERTICES;
  let flower = index>=grassEnd;
  if (flower) {
    instance = ((index-grassEnd)/FLOWER_VERTICES)*FLOWER_STRIDE;
    vertexIndex = (index-grassEnd)%FLOWER_VERTICES;
  }
  var particle = plants[instance];
  if (flower) { particle.position.w*=flowerGrowth(instance); }
  var vertex = makeBotanicalVertex(particle,instance,vertexIndex,flower);
  if (!flower && instance%32u==0u) {
    vertex.position=mix(vertex.position,particle.position.xyz,flowerGrowth(instance));
  }
  let cell=fireCell(rideDirection(instance));
  let combustion=fireField[cell];
  let recovery=plantRecovery[cell];
  let damaged=clamp(combustion.z,0.0,1.0);
  // Separate plants and blades enter the front at different times. The
  // variation vanishes at both endpoints, so healthy plants and fully spent
  // fuel retain their exact states through a complete burn/regrowth cycle.
  let blade=vertexIndex/14u;
  let resilience=mix(-0.10,0.12,random(instance*91u+577u));
  let bladeDelay=select(mix(-0.075,0.075,random(instance*53u+blade*17u+709u)),0.0,flower);
  let progress=clamp(damaged+(resilience+bladeDelay)*4.0*damaged*(1.0-damaged),0.0,1.0)*(1.0-recovery.y);
  let t=clamp(vertex.uv.y,0.0,1.0);
  let localChar=botanicalLocalChar(botanicalBurnPhase(progress,t,vertex.uv.x,vertex.part));
  let wilt=smoothstep(0.10,0.98,localChar);
  let erosion=leafAshStates[instance*5u+select(min(blade,4u),0u,flower)].x;
  let stem=vertex.position-particle.position.xyz;
  let bendAxis=botanicalNormal(cross(particle.normal.xyz,vec3f(0.32,0.87,0.39)),vec3f(1.0,0.0,0.0));
  let curl=wilt*t*t*(0.045+0.055*random(instance*71u+63u))
    *(1.0+0.28*smoothstep(0.06,0.60,erosion)*localChar);
  let growth=clamp(recovery.x,0.035,1.0);
  vertex.position=particle.position.xyz+(stem*(1.0-wilt*0.28*(1.0-recovery.y))
    -particle.normal.xyz*curl+bendAxis*curl*0.44)*growth;
  let dehydrated=(1.0-smoothstep(0.06,0.27,recovery.z))*smoothstep(0.04,0.45,recovery.w)*(1.0-recovery.y);
  vertex.color=mix(vertex.color,vertex.color*vec3f(1.04,0.66,0.27),dehydrated*0.67);
  let fresh=smoothstep(0.01,0.15,recovery.y)*(1.0-smoothstep(0.60,1.0,growth));
  vertex.color=mix(vertex.color,vertex.color*vec3f(0.75,1.25,0.51)+vec3f(0.012,0.027,0.002),fresh*0.65);
  let packedLight=u32(clamp(vertex.visibility,0.0,1.0)*255.0)
    | (u32(clamp(combustion.x,0.0,1.0)*255.0)<<8u)
    | (u32(progress*255.0)<<16u);
  mesh[index].position = vec4f(vertex.position,f32(packedLight));
  mesh[index].detail = vec4u(pack2x16snorm(octEncode(vertex.normal)),pack2x16float(vertex.uv),
    pack2x16float(vertex.color.rg),pack2x16float(vec2f(vertex.color.b,vertex.part+vertex.seed*0.1)));
}
`;

const resolveStoredWGSL = /* wgsl */ `
struct ResolvedBotanical {
  stored: MeshVertex,
  fracture: vec4f,
};
fn botanicalSource(instance: u32) -> vec2u {
  let count=u32(u.viewport.w);
  let flowerCount=(count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let crustInstance=count+flowerCount;
  let flowerCloneStart=2u*count+flowerCount+1u;
  if (instance<count) { return vec2u(instance,0u); }
  if (instance==crustInstance) { return vec2u(0u,2u); }
  if (instance>=flowerCloneStart) {
    return vec2u(((instance-flowerCloneStart)%flowerCount)*FLOWER_STRIDE,1u);
  }
  if (instance>crustInstance) { return vec2u(instance-crustInstance-1u,0u); }
  return vec2u((instance-count)*FLOWER_STRIDE,1u);
}
fn botanicalAshStateIndex(vertexIndex: u32, instance: u32) -> u32 {
  let source=botanicalSource(instance);
  if (source.y==2u) { return 0xffffffffu; }
  let bladeStride=select(14u,24u,u.worldRight.w>0.5);
  return source.x*5u+select(0u,min(vertexIndex/bladeStride,4u),source.y==0u);
}
fn botanicalErosion(vertexIndex: u32, instance: u32) -> f32 {
  let stateIndex=botanicalAshStateIndex(vertexIndex,instance);
  if (stateIndex==0xffffffffu) { return 0.0; }
  return clamp(leafAshStates[stateIndex].x,0.0,1.0);
}
fn resolveStored(vertexIndex: u32, instance: u32) -> ResolvedBotanical {
  var stored=mesh[meshIndex(vertexIndex,instance)];
  let count=u32(u.viewport.w);
  let flowerCount=(count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let cloneStart=count+flowerCount+1u;
  let flowerCloneStart=2u*count+flowerCount+1u;
  let source=botanicalSource(instance);
  var metadata=vec4f(0.0);
  var detached=false;
  var detachedPivot=vec3f(0.0);
  if (source.y==0u && u.worldRight.w>0.5) {
    let blade=vertexIndex/24u;
    let chunk=(vertexIndex%24u)/8u;
    let fracture=leafFractures[(source.x*5u+blade)*3u+chunk];
    let stage=fracture.anchorStage.w;
    if (stage>0.5) {
      metadata=vec4f(stage,fracture.centerAge.w,select(fracture.velocityLife.w,fracture.motion.y,stage<1.5),fracture.motion.w);
      if (stage>2.5 && stage<3.5) {
        // Retain captured mesh positions for the physics and dust emitter,
        // but do not rasterise an already exhausted segment in any pass.
        stored.position=vec4f(vec3f(0.0),stored.position.w);
      } else {
        let base=source.x*GRASS_VERTICES+blade*14u+chunk*4u;
        let start=(mesh[base].position.xyz+mesh[base+1u].position.xyz)*0.5;
        let midLeft=mesh[base+2u].position.xyz;
        let midRight=mesh[base+3u].position.xyz;
        let end=(mesh[base+4u].position.xyz+mesh[base+5u].position.xyz)*0.5;
        let acrossVector=midRight-midLeft;
        let across=normalize(acrossVector+vec3f(0.00000001));
        let alongVector=end-start;
        let along=normalize(alongVector-across*dot(alongVector,across)+vec3f(0.00000001));
        let pose=leafFractureTransform(fracture,stored.position.xyz,octDecode(unpack2x16snorm(stored.detail.x)),
          start,(start+end)*0.5,across,along,length(acrossVector),length(alongVector));
        stored.position=vec4f(pose.position,stored.position.w);
        stored.detail.x=pack2x16snorm(octEncode(pose.normal));
        detached=stage>1.5 && stage<2.5;
        detachedPivot=fracture.anchorStage.xyz;
      }
    }
  }
  if (instance>=flowerCloneStart) {
    let cloneIndex=instance-flowerCloneStart;
    let flowerIndex=cloneIndex%flowerCount;
    let sourceRoot=flowerIndex*FLOWER_STRIDE;
    let rootPosition=mesh[sourceRoot*GRASS_VERTICES].position.xyz;
    let identity=sourceRoot*167u+(cloneIndex/flowerCount)*919u+1877u;
    let angle=random(identity)*6.28318530718;
    let offsetAngle=random(identity+1u)*6.28318530718;
    let offsetLength=mix(0.03,0.16,random(identity+2u));
    let offset=(u.worldRight.xyz*cos(offsetAngle)+u.worldForward.xyz*sin(offsetAngle))*offsetLength;
    let growth=smoothstep(0.35,0.85,u.rideOrigin.w);
    let densityGrowth=select(1.0,flowerCoverage(identity,max(u.domainNormal.w-1.0,0.0)),cloneIndex/flowerCount>=2u);
    let branchScale=mix(0.55,0.95,random(identity+3u))*growth*densityGrowth;
    let position=rootPosition+rotateTillering(stored.position.xyz-rootPosition,angle)*branchScale+offset*growth*densityGrowth;
    let normal=rotateTillering(octDecode(unpack2x16snorm(stored.detail.x)),angle);
    stored.position=vec4f(position,stored.position.w);
    stored.detail.x=pack2x16snorm(octEncode(normal));
    return ResolvedBotanical(stored,metadata);
  }
  if (instance>=cloneStart) {
    let rootIndex=instance-cloneStart;
    let rootPosition=select(mesh[rootIndex*GRASS_VERTICES].position.xyz,detachedPivot,detached);
    let identity=rootIndex*109u+1229u;
    let angle=random(identity)*6.28318530718;
    let offsetAngle=random(identity+1u)*6.28318530718;
    let offsetLength=mix(0.04,0.13,random(identity+2u));
    let offset=(u.worldRight.xyz*cos(offsetAngle)+u.worldForward.xyz*sin(offsetAngle))*offsetLength;
    let growth=smoothstep(0.35,0.85,u.rideOrigin.w);
    let position=rootPosition+(rotateTillering(stored.position.xyz-rootPosition,angle)+offset)*growth;
    let normal=rotateTillering(octDecode(unpack2x16snorm(stored.detail.x)),angle);
    stored.position=vec4f(position,stored.position.w);
    stored.detail.x=pack2x16snorm(octEncode(normal));
  }
  return ResolvedBotanical(stored,metadata);
}
`;

export const shadowWGSL = sharedWGSL + meshWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(7) var<storage,read> leafAshStates: array<vec4f>;
@group(0) @binding(8) var<storage,read> leafFractures: array<LeafFracture>;
${resolveStoredWGSL}
struct BotanicalShadowOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) material: vec3f,
  @location(2) fracture: vec4f,
};
@vertex fn shadowVertex(@builtin(vertex_index) vertexIndex:u32,@builtin(instance_index) instance:u32) -> BotanicalShadowOutput {
  let resolved=resolveStored(vertexIndex,instance);
  let stored=resolved.stored;
  let bp=unpack2x16float(stored.detail.w);
  let part=floor(bp.y);
  var output: BotanicalShadowOutput;
  output.position=vec4f(sunCoordinates(stored.position.xyz),1.0);
  output.uv=unpack2x16float(stored.detail.y);
  output.material=vec3f(part,(bp.y-part)*10.0,botanicalErosion(vertexIndex,instance));
  output.fracture=resolved.fracture;
  return output;
}
@fragment fn shadowFragment(input: BotanicalShadowOutput) {
  if (botanicalMaterialSigned(input.material.z,input.uv,input.material.y,input.material.x,input.fracture)<=0.0) { discard; }
}
`;

export const renderWGSL = sharedWGSL + meshWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(2) var sunDepth: texture_depth_2d;
@group(0) @binding(3) var sunSampler: sampler_comparison;
@group(0) @binding(4) var characterAtlas: texture_2d_array<f32>;
@group(0) @binding(5) var characterSampler: sampler;
@group(0) @binding(7) var<storage,read> leafAshStates: array<vec4f>;
@group(0) @binding(8) var<storage,read> leafFractures: array<LeafFracture>;
${resolveStoredWGSL}
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) viewPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec3f,
  @location(4) material: vec3f,
  @location(5) surface: vec4f,
  @location(6) combustion: vec3f,
  @location(7) fracture: vec4f,
};
@vertex fn vertex(@builtin(vertex_index) vertexIndex:u32,@builtin(instance_index) instance:u32) -> VertexOutput {
  let resolved=resolveStored(vertexIndex,instance);
  let stored=resolved.stored;
  let rg = unpack2x16float(stored.detail.z);
  let bp = unpack2x16float(stored.detail.w);
  let part = floor(bp.y);
  var output: VertexOutput;
  output.position = cameraProjection(stored.position.xyz);
  output.viewPosition = stored.position.xyz;
  output.normal = octDecode(unpack2x16snorm(stored.detail.x));
  output.uv = unpack2x16float(stored.detail.y);
  output.color = vec3f(rg,bp.x);
  let packedLight=u32(stored.position.w);
  output.material = vec3f(part,f32(packedLight&255u)/255.0,(bp.y-part)*10.0);
  output.surface = vec4f(0.0,0.0,-1.0,0.9);
  output.combustion=vec3f(f32((packedLight>>8u)&255u)/255.0,botanicalErosion(vertexIndex,instance),f32((packedLight>>16u)&255u)/255.0);
  output.fracture=resolved.fracture;
  return output;
}
fn sunVisibility(position: vec3f, normal:vec3f) -> f32 {
  let light = sunCoordinates(position);
  let uv = vec2f(light.x*0.5+0.5,0.5-light.y*0.5);
  let grazing=1.0-abs(dot(normal,sunDirection()));
  let bias=mix(0.00013+0.00035*grazing,0.00005+0.00012*grazing,u.rideOrigin.w);
  let depth = light.z-bias;
  let texel=mix(0.85,0.75,u.rideOrigin.w)/vec2f(textureDimensions(sunDepth));
  let visibility = (textureSampleCompareLevel(sunDepth,sunSampler,uv+texel*vec2f(-1.0,-1.0),depth)
    +textureSampleCompareLevel(sunDepth,sunSampler,uv+texel*vec2f(1.0,-1.0),depth)
    +textureSampleCompareLevel(sunDepth,sunSampler,uv+texel*vec2f(-1.0,1.0),depth)
    +textureSampleCompareLevel(sunDepth,sunSampler,uv+texel*vec2f(1.0,1.0),depth))*0.25;
  return select(visibility,1.0,any(uv<vec2f(0.0)) || any(uv>vec2f(1.0)) || depth<0.0 || depth>1.0);
}
fn actorFresnel(f0: vec3f, viewHalf: f32) -> vec3f {
  let grazing=pow(1.0-viewHalf,5.0);
  return f0+(vec3f(1.0)-f0)*grazing;
}
fn actorGgx(normalHalf: f32, alphaSquared: f32) -> f32 {
  let denominator=normalHalf*normalHalf*(alphaSquared-1.0)+1.0;
  return alphaSquared/max(3.14159265*denominator*denominator,0.000001);
}
fn actorSmith(normalView: f32, normalLight: f32, alphaSquared: f32) -> f32 {
  let viewMask=normalLight*sqrt(normalView*normalView*(1.0-alphaSquared)+alphaSquared);
  let lightMask=normalView*sqrt(normalLight*normalLight*(1.0-alphaSquared)+alphaSquared);
  return 0.5/max(viewMask+lightMask,0.00001);
}
struct BotanicalFragmentOutput {
  @location(0) color: vec4f,
  @builtin(sample_mask) coverage: u32,
};
fn botanicalFragmentOutput(color: vec3f, mask: u32) -> BotanicalFragmentOutput {
  var output: BotanicalFragmentOutput;
  output.color=vec4f(color,1.0);
  output.coverage=mask;
  return output;
}
@fragment fn botanicalDepthFragment(input: VertexOutput) -> @builtin(sample_mask) u32 {
  let signedDistance=botanicalMaterialSigned(input.combustion.y,input.uv,input.material.z,input.material.x,input.fracture);
  let footprint=fwidth(signedDistance);
  let coverage=botanicalMaterialCoverage(input.combustion.y,signedDistance,footprint,input.material.x,input.fracture);
  return botanicalCoverageMask(coverage);
}
@fragment fn sceneFragment(input:VertexOutput,@builtin(front_facing) frontFacing:bool) -> BotanicalFragmentOutput {
  // Evaluate gradients before any material branch, then use explicit LOD so
  // individual character material/texture indices need no uniform control flow.
  let atlasSize=vec2f(textureDimensions(characterAtlas,0));
  let dx=dpdx(input.surface.xy)*atlasSize;
  let dy=dpdy(input.surface.xy)*atlasSize;
  let textureLod=max(0.0,0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001)));
  let erosionDistance=botanicalMaterialSigned(input.combustion.y,input.uv,input.material.z,input.material.x,input.fracture);
  let erosionFootprint=fwidth(erosionDistance);
  let erosionCoverage=botanicalMaterialCoverage(input.combustion.y,erosionDistance,erosionFootprint,input.material.x,input.fracture);
  let erosionMask=botanicalCoverageMask(erosionCoverage);
  // Evaluate these derivatives before material returns. Analytic coverage
  // preserves a thin ember's energy when a leaf is narrower than one pixel.
  let burnT=clamp(input.uv.y,0.0,1.0);
  let burnW=clamp(abs(input.uv.x),0.0,1.0);
  let burnProgress=clamp(input.combustion.z,0.0,1.0);
  let burnPhase=botanicalBurnPhase(burnProgress,burnT,burnW,input.material.x);
  let phaseFootprint=max(fwidth(burnPhase),0.0025);
  let widthFootprint=max(fwidth(burnW),0.003);
  let lengthFootprint=max(fwidth(burnT),0.001);
  if (erosionMask==0u) { discard; }
  let geometricNormal = normalize(input.normal);
  let normal = select(-geometricNormal,geometricNormal,frontFacing);
  let sun = sunDirection();
  let eye = cameraWorld()+u.viewRight.xyz*u.lens.x+u.viewUp.xyz*u.lens.y;
  let view = normalize(eye-input.viewPosition);
  let sunVis = sunVisibility(input.viewPosition,normal);
  let nl = max(dot(normal,sun),0.0);
  let back = max(-dot(normal,sun),0.0);
  let part = input.material.x;
  let skyUp=normalize(mix(macroToWorld(vec3f(0.0,1.0,0.0)),u.worldUp.xyz,u.rideOrigin.w));
  if (part>8.0) {
    let reveal=fract(sin(dot(floor(input.position.xy)+u.lens.xy*771.0,vec2f(12.9898,78.233)))*43758.5453);
    if(reveal>u.riderContact.w) { discard; }
    let material = part-10.0;
    // Material protocol: 0 cotton/olive fabric, 1 skin, 2 hair,
    // 3 shoes/wood, 4 metal. The sRGB texture array is decoded by the GPU.
    let cloth=material<0.5;
    let skin=material>0.5 && material<1.5;
    let hair=material>1.5 && material<2.5;
    let metal=material>3.5;
    var roughness=0.72;
    var f0=vec3f(0.035);
    if(cloth){roughness=0.88;f0=vec3f(0.025);}
    if(skin){roughness=0.55;f0=vec3f(0.028);}
    if(hair){roughness=0.48;f0=vec3f(0.04);}
    if(metal){roughness=0.28;f0=vec3f(0.60);}
    if(input.surface.w>=0.0){roughness=clamp(input.surface.w,0.08,1.0);}
    var importedColor=input.color;
    if(input.surface.z>=0.0){
      let texel=textureSampleLevel(characterAtlas,characterSampler,input.surface.xy,i32(input.surface.z+0.5),textureLod);
      if(hair && texel.a<0.40){discard;}
      importedColor*=texel.rgb;
    }
    let alpha=roughness*roughness;
    let alphaSquared=alpha*alpha;
    let halfVector=normalize(view+sun);
    let normalView=max(dot(normal,view),0.0001);
    let normalHalf=max(dot(normal,halfVector),0.0);
    let viewHalf=max(dot(view,halfVector),0.0);
    let fresnel=actorFresnel(f0,viewHalf);
    let distribution=actorGgx(normalHalf,alphaSquared);
    let visibility=actorSmith(normalView,nl,alphaSquared);
    let clampedColor=clamp(importedColor,vec3f(0.0),vec3f(1.0));
    let baseColor=mix(clampedColor,min(clampedColor,vec3f(0.78)),select(0.0,1.0,cloth));
    let specular=fresnel*distribution*visibility*select(1.0,0.15,cloth);
    let diffuse=baseColor*(vec3f(1.0)-fresnel)*select(1.0,0.0,metal)/3.14159265;
    let actorSun=vec3f(7.2,6.15,4.60);
    let direct=(diffuse+specular)*actorSun*nl*sunVis;
    let sky=mix(vec3f(0.065,0.105,0.055),vec3f(0.38,0.49,0.65),0.5+0.5*dot(normal,skyUp));
    let meadowBounce=vec3f(0.18,0.17,0.09)*(1.0-nl*sunVis)*u.rideOrigin.w;
    let skyFill=mix(0.80,1.44,u.rideOrigin.w);
    var radiance=baseColor*(sky*skyFill+meadowBounce)*select(1.0,0.03,metal)+direct;
    radiance+=f0*sky*(0.06+0.10*(1.0-roughness));
    if(cloth){
      // A little warm transmission through thin cotton opens the backlit
      // sleeves without turning their broad diffuse folds into glossy plastic.
      radiance+=baseColor*actorSun*vec3f(1.0,0.82,0.62)*back*0.035*sunVis*u.rideOrigin.w;
    }
    if(skin){
      let wrap=max((dot(normal,sun)+0.25)/1.25,0.0);
      let softDiffuse=max(0.0,wrap-nl)*0.11;
      let edgeGlow=back*pow(max(dot(view,-sun),0.0),4.0)*0.07;
      radiance+=baseColor*actorSun*vec3f(1.0,0.55,0.31)*(softDiffuse+edgeGlow)*sunVis;
    }
    return botanicalFragmentOutput(max(radiance,vec3f(0.0)),15u);
  }
  if (part>5.5 && part<8.5) {
    let fur=noise(input.viewPosition*125.0)*0.12+noise(input.viewPosition*32.0)*0.09;
    let canopy=mix(0.64,0.79,u.rideOrigin.w)+fur;
    let skyAmount=0.5+0.5*dot(normal,skyUp);
    let macroSky=mix(vec3f(0.035,0.105,0.075),vec3f(0.24,0.37,0.39),skyAmount);
    let microSky=mix(vec3f(0.065,0.13,0.07),vec3f(0.38,0.48,0.34),skyAmount);
    let sky=mix(macroSky,microSky,u.rideOrigin.w);
    let light=mix(vec3f(3.9,3.45,2.65),vec3f(4.5,3.65,2.45),u.rideOrigin.w)*nl*sunVis;
    let bounce=vec3f(0.17,0.18,0.08)*(1.0-sunVis)*u.rideOrigin.w;
    let sunlitTint=mix(vec3f(1.0),vec3f(1.25,1.04,0.78),u.rideOrigin.w*nl*sunVis);
    let charred=smoothstep(0.04,0.9,input.combustion.z);
    let groundColor=mix(input.color,vec3f(0.009,0.007,0.006),charred);
    return botanicalFragmentOutput(groundColor*sunlitTint*(sky+light+bounce)*canopy,15u);
  }
  let leaf = part<1.5 || part>3.5;
  let t = clamp(input.uv.y,0.0,1.0);
  let w = clamp(abs(input.uv.x),0.0,1.0);
  let midrib = exp(-w*18.0);
  var color = input.color;
  let fractureStage=input.fracture.x;
  let charcoalRamp=select(smoothstep(0.0,0.35,input.fracture.y),1.0,fractureStage>1.5);
  let fractured=select(0.0,charcoalRamp,part<0.5 && fractureStage>0.5 && fractureStage<2.5);
  let freeStrip=select(0.0,1.0,part<0.5 && fractureStage>1.5 && fractureStage<2.5);
  let charAmount=max(botanicalLocalChar(burnPhase),max(fractured*0.92,freeStrip));
  var heat=clamp(input.combustion.x,0.0,1.0);
  if (freeStrip>0.5) {
    // Detached carbon cools on its own trajectory. Watering the source plant
    // or moving the original flame cannot recolour or reheat an airborne leaf.
    heat=(0.70+0.24*input.material.z)*exp(-input.fracture.y*1.20);
  }
  var thickness = 0.46;
  var localAO = 1.0;
  var scatter = vec3f(0.82,0.97,0.20);
  var transmissionWeight = 0.32;
  if (leaf) {
    thickness = 0.24+0.48*midrib+0.21*(1.0-t);
    localAO = mix(0.65,1.0,smoothstep(0.0,0.45,t));
    let fibers = 0.98+0.02*sin(input.uv.x*47.0+input.uv.y*11.0+input.material.z*3.0);
    color *= fibers*mix(0.96,1.06,midrib);
  } else if (part<2.5) {
    thickness = 0.22+0.72*pow(1.0-t,2.0)+0.15*(1.0-w);
    localAO = mix(0.57,1.0,smoothstep(0.03,0.48,t));
    scatter = sqrt(max(color,vec3f(0.02)));
    transmissionWeight = 0.18;
    color *= mix(0.55,0.72,u.rideOrigin.w)*mix(vec3f(1.0),vec3f(1.07,1.01,0.96),u.rideOrigin.w);
    let veins = 0.985+0.015*cos(input.uv.x*33.0+sin(t*8.0)*2.0);
    color *= veins;
    let pigmentLuminance=dot(color,vec3f(0.2126,0.7152,0.0722));
    color=max(mix(vec3f(pigmentLuminance),color,mix(1.0,1.08,u.rideOrigin.w)),vec3f(0.0));
  } else {
    thickness = 1.4;
    scatter = vec3f(0.75,0.41,0.05);
    transmissionWeight = 0.04;
    localAO = 0.85;
    color *= 0.94+0.06*sin(input.uv.x*65.0+input.uv.y*47.0);
    color *= 0.60;
  }
  let scorch=smoothstep(0.025,0.72,charAmount);
  let toasted=color*vec3f(0.88,0.47,0.16);
  let dryFront=smoothstep(-0.22,0.025,burnPhase)*smoothstep(0.015,0.11,burnProgress);
  color=mix(color,toasted,dryFront);
  let ashGrain=smoothstep(-0.15,0.65,noise(input.viewPosition*85.0));
  let hangingAsh=fractured*(0.16+0.32*smoothstep(0.2,1.0,input.fracture.y/max(0.1,input.fracture.z)));
  let releasedAsh=freeStrip*(0.48+0.32*smoothstep(0.05,1.8,input.fracture.y));
  let ash=max(smoothstep(0.78,1.0,burnProgress)*(1.0-smoothstep(0.16,0.58,heat))*ashGrain,
    max(hangingAsh,releasedAsh)*(0.76+ashGrain*0.24));
  color=mix(color,mix(vec3f(0.006,0.0045,0.0038),vec3f(0.10,0.095,0.087),ash),scorch);
  transmissionWeight*=1.0-scorch;
  let skyAmount = 0.5+0.5*dot(normal,skyUp);
  let sky = mix(vec3f(0.055,0.095,0.045),vec3f(0.30,0.49,0.72),skyAmount);
  let skyVisibility = mix(0.38,1.0,clamp(input.material.y,0.0,1.0))*localAO;
  let sunColor=mix(vec3f(4.80,4.10,3.05),vec3f(4.90,4.08,2.85),u.rideOrigin.w);
  let direct = sunColor*nl*sunVis;
  let absorption = -log(clamp(scatter,vec3f(0.08),vec3f(0.98)));
  let tissue = exp(-absorption*thickness/max(abs(dot(geometricNormal,sun)),0.24));
  let forward = 0.45+0.55*pow(max(dot(view,-sun),0.0),4.0);
  let transmitted = sunColor*tissue*back*sunVis*forward*transmissionWeight;
  let backSky = mix(vec3f(0.055,0.095,0.045),vec3f(0.30,0.49,0.72),0.5-0.5*dot(normal,skyUp));
  let skyTransmitted = backSky*tissue*skyVisibility*select(0.28,0.38,part>1.5 && part<2.5);
  let halfVector = normalize(view+sun);
  let sheen = pow(max(dot(normal,halfVector),0.0),24.0)*select(0.0035,0.015,part>1.5 && part<2.5);
  let meadowBounce=vec3f(0.13,0.14,0.065)*skyVisibility*(1.0-nl*sunVis)*u.rideOrigin.w;
  let indirect=sky*skyVisibility*mix(1.0,1.15,u.rideOrigin.w);
  let sunlitTint=mix(vec3f(1.0),vec3f(1.10,1.025,0.88),u.rideOrigin.w*nl*sunVis*select(0.0,1.0,leaf));
  var radiance=color*sunlitTint*(indirect+direct+meadowBounce)+transmitted+skyTransmitted*(1.0-scorch)+sunColor*sheen*sunVis*(1.0-scorch);
  // Incandescence belongs to the moving boundary between intact tissue and
  // carbon, with short-lived embers just behind it. It never outlines a whole
  // unburnt blade, nor remains luminous after the local heat has dissipated.
  let frontWidth=0.019;
  let frontDistance=abs(burnPhase-0.073);
  let front=(1.0-smoothstep(frontWidth,frontWidth+phaseFootprint,frontDistance))
    *frontWidth/(frontWidth+phaseFootprint*0.5);
  let marginWidth=0.075;
  let margin=smoothstep(1.0-marginWidth-widthFootprint,1.0-marginWidth+widthFootprint,burnW)
    *marginWidth/(marginWidth+widthFootprint*0.5);
  let hotTissue=smoothstep(0.17,0.66,heat)*smoothstep(0.012,0.09,burnProgress);
  let seed=input.material.z;
  let fracturePhase=burnT*27.0+seed*41.0+input.uv.x*2.6;
  let resolvedFiber=exp(-lengthFootprint*lengthFootprint*260.0);
  let fracture=0.40+0.60*smoothstep(-0.15,0.65,sin(fracturePhase))*resolvedFiber;
  let rimWake=smoothstep(0.04,0.12,burnPhase)*(1.0-smoothstep(0.24,0.43,burnPhase));
  let thermalFlicker=0.80+0.12*sin(u.viewport.z*7.1+seed*31.0+burnT*10.0)
    +0.08*sin(u.viewport.z*13.7+seed*13.0-burnT*17.0);
  let tissueWeight=select(select(0.16,0.38,part>1.5 && part<2.5),1.0,part<0.5 || part>3.5);
  let liveFront=front*(0.46+margin*0.54)*hotTissue*thermalFlicker*tissueWeight*(1.0-freeStrip);
  let rimEmber=margin*rimWake*fracture*hotTissue*thermalFlicker*tissueWeight*(1.0-freeStrip);
  radiance+=vec3f(5.2,0.92,0.028)*liveFront;
  radiance+=vec3f(2.8,0.22,0.005)*rimEmber*0.72;
  let tornRim=(1.0-smoothstep(0.003,0.022+erosionFootprint,abs(erosionDistance)))
    *fractured*smoothstep(0.18,0.76,heat)*(1.0-input.fracture.w);
  radiance+=vec3f(2.9,0.32,0.009)*tornRim*0.45;
  radiance+=color*vec3f(0.85,0.20,0.025)*smoothstep(0.04,0.55,heat)*(1.0-scorch*0.85);
  let distance=length(eye-input.viewPosition);
  let haze=1.0-exp(-max(0.0,distance-1.8)*0.025*u.rideOrigin.w);
  return botanicalFragmentOutput(mix(max(radiance,vec3f(0.0)),vec3f(0.69,0.83,0.76),haze),erosionMask);
}
`;

export const riderRenderWGSL = renderWGSL.replace(
  /@vertex fn vertex\([\s\S]*?\nfn sunVisibility/,
  `@group(0) @binding(6) var<storage,read> riderJoints: array<mat4x4f>;
struct RiderInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) material: f32,
  @location(4) uv: vec2f,
  @location(5) textureIndex: f32,
  @location(6) roughness: f32,
  @location(7) joints: vec4u,
  @location(8) weights: vec4f,
};
@vertex fn riderVertex(input: RiderInput) -> VertexOutput {
  let skin=riderJoints[input.joints.x]*input.weights.x
    +riderJoints[input.joints.y]*input.weights.y
    +riderJoints[input.joints.z]*input.weights.z
    +riderJoints[input.joints.w]*input.weights.w;
  let worldPosition=(skin*vec4f(input.position,1.0)).xyz;
  let worldNormal=normalize((skin*vec4f(input.normal,0.0)).xyz);
  var output: VertexOutput;
  output.position = cameraProjection(worldPosition);
  output.viewPosition = worldPosition;
  output.normal = worldNormal;
  output.uv = vec2f(0.0);
  output.color = input.color;
  output.material = vec3f(10.0+input.material,1.0,0.0);
  output.surface = vec4f(input.uv,input.textureIndex,input.roughness);
  output.combustion=vec3f(0.0,1.0,0.0);
  output.fracture=vec4f(0.0);
  return output;
}
fn sunVisibility`
);
export const riderShadowWGSL = sharedWGSL + meshWGSL + `
@group(0) @binding(4) var characterAtlas: texture_2d_array<f32>;
@group(0) @binding(5) var characterSampler: sampler;
@group(0) @binding(6) var<storage,read> riderJoints: array<mat4x4f>;
struct RiderInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) material: f32,
  @location(4) uv: vec2f,
  @location(5) textureIndex: f32,
  @location(6) roughness: f32,
  @location(7) joints: vec4u,
  @location(8) weights: vec4f,
};
struct RiderShadowOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) cutout: vec2f,
};
@vertex fn riderShadowVertex(input: RiderInput) -> RiderShadowOutput {
  let skin=riderJoints[input.joints.x]*input.weights.x
    +riderJoints[input.joints.y]*input.weights.y
    +riderJoints[input.joints.z]*input.weights.z
    +riderJoints[input.joints.w]*input.weights.w;
  let worldPosition=(skin*vec4f(input.position,1.0)).xyz;
  var output: RiderShadowOutput;
  output.position=vec4f(sunCoordinates(worldPosition),1.0);
  output.uv=input.uv;
  output.cutout=vec2f(input.material,input.textureIndex);
  return output;
}
@fragment fn riderShadowFragment(input: RiderShadowOutput) {
  if(input.cutout.x>1.5 && input.cutout.x<2.5 && input.cutout.y>=0.0){
    let alpha=textureSampleLevel(characterAtlas,characterSampler,input.uv,i32(input.cutout.y+0.5),0.0).a;
    if(alpha<0.40){discard;}
  }
}
`;
