import { sharedWGSL } from './shaders.js?v=fire-v21g';
import { fireFieldWGSL } from './fire-simulation.js?v=fire-v21g';
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

export const meshWGSL = /* wgsl */ `
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
fn meshIndex(vertexIndex: u32, instance: u32) -> u32 {
  let count = u32(u.viewport.w);
  if (instance<count) { return instance*GRASS_VERTICES+vertexIndex; }
  let flowerCount=(count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let flowerCloneStart=2u*count+flowerCount+1u;
  if (instance>=flowerCloneStart) {
    return count*GRASS_VERTICES+((instance-flowerCloneStart)%flowerCount)*FLOWER_VERTICES+vertexIndex;
  }
  if (instance>count+flowerCount) { return (instance-count-flowerCount-1u)*GRASS_VERTICES+vertexIndex; }
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
  // Separate plants and separate parts of a blade scorch at different times.
  // A narrow brown drying front reaches the tips before the stem loses support.
  let resilience=mix(-0.10,0.14,random(instance*91u+577u));
  let botanicalChar=clamp((damaged-resilience*smoothstep(0.0,0.18,damaged))/0.90,0.0,1.0);
  let t=clamp(vertex.uv.y,0.0,1.0);
  let charAmount=clamp(botanicalChar+(t-0.45)*0.20*smoothstep(0.01,0.16,damaged),0.0,1.0)*(1.0-recovery.y);
  let wilt=smoothstep(0.12,1.0,botanicalChar);
  let stem=vertex.position-particle.position.xyz;
  let bendAxis=botanicalNormal(cross(particle.normal.xyz,vec3f(0.32,0.87,0.39)),vec3f(1.0,0.0,0.0));
  let curl=wilt*t*t*(0.045+0.055*random(instance*71u+63u));
  let growth=clamp(recovery.x,0.035,1.0);
  vertex.position=particle.position.xyz+(stem*(1.0-wilt*0.62*(1.0-recovery.y))
    -particle.normal.xyz*curl+bendAxis*curl*0.44)*growth;
  let dehydrated=(1.0-smoothstep(0.06,0.27,recovery.z))*smoothstep(0.04,0.45,recovery.w)*(1.0-recovery.y);
  vertex.color=mix(vertex.color,vertex.color*vec3f(1.04,0.66,0.27),dehydrated*0.67);
  let fresh=smoothstep(0.01,0.15,recovery.y)*(1.0-smoothstep(0.60,1.0,growth));
  vertex.color=mix(vertex.color,vertex.color*vec3f(0.75,1.25,0.51)+vec3f(0.012,0.027,0.002),fresh*0.65);
  let packedLight=u32(clamp(vertex.visibility,0.0,1.0)*255.0)
    | (u32(clamp(combustion.x,0.0,1.0)*255.0)<<8u)
    | (u32(charAmount*255.0)<<16u);
  mesh[index].position = vec4f(vertex.position,f32(packedLight));
  mesh[index].detail = vec4u(pack2x16snorm(octEncode(vertex.normal)),pack2x16float(vertex.uv),
    pack2x16float(vertex.color.rg),pack2x16float(vec2f(vertex.color.b,vertex.part+vertex.seed*0.1)));
}
`;

const resolveStoredWGSL = /* wgsl */ `
fn resolveStored(vertexIndex: u32, instance: u32) -> MeshVertex {
  var stored=mesh[meshIndex(vertexIndex,instance)];
  let count=u32(u.viewport.w);
  let flowerCount=(count+FLOWER_STRIDE-1u)/FLOWER_STRIDE;
  let cloneStart=count+flowerCount+1u;
  let flowerCloneStart=2u*count+flowerCount+1u;
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
    return stored;
  }
  if (instance>=cloneStart) {
    let rootIndex=instance-cloneStart;
    let rootPosition=mesh[rootIndex*GRASS_VERTICES].position.xyz;
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
  return stored;
}
`;

export const shadowWGSL = sharedWGSL + meshWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage,read> mesh: array<MeshVertex>;
${resolveStoredWGSL}
@vertex fn shadowVertex(@builtin(vertex_index) vertexIndex:u32,@builtin(instance_index) instance:u32) -> @builtin(position) vec4f {
  return vec4f(sunCoordinates(resolveStored(vertexIndex,instance).position.xyz),1.0);
}
`;

export const renderWGSL = sharedWGSL + meshWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage,read> mesh: array<MeshVertex>;
@group(0) @binding(2) var sunDepth: texture_depth_2d;
@group(0) @binding(3) var sunSampler: sampler_comparison;
@group(0) @binding(4) var characterAtlas: texture_2d_array<f32>;
@group(0) @binding(5) var characterSampler: sampler;
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
};
@vertex fn vertex(@builtin(vertex_index) vertexIndex:u32,@builtin(instance_index) instance:u32) -> VertexOutput {
  let stored = resolveStored(vertexIndex,instance);
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
  output.combustion=vec3f(f32((packedLight>>8u)&255u)/255.0,1.0,f32((packedLight>>16u)&255u)/255.0);
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
@fragment fn sceneFragment(input:VertexOutput,@builtin(front_facing) frontFacing:bool) -> @location(0) vec4f {
  // Evaluate gradients before any material branch, then use explicit LOD so
  // individual character material/texture indices need no uniform control flow.
  let atlasSize=vec2f(textureDimensions(characterAtlas,0));
  let dx=dpdx(input.surface.xy)*atlasSize;
  let dy=dpdy(input.surface.xy)*atlasSize;
  let textureLod=max(0.0,0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001)));
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
    return vec4f(max(radiance,vec3f(0.0)),1.0);
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
    return vec4f(groundColor*sunlitTint*(sky+light+bounce)*canopy,1.0);
  }
  let leaf = part<1.5 || part>3.5;
  let t = clamp(input.uv.y,0.0,1.0);
  let w = clamp(abs(input.uv.x),0.0,1.0);
  let midrib = exp(-w*18.0);
  var color = input.color;
  let charAmount=clamp(input.combustion.z,0.0,1.0);
  let heat=clamp(input.combustion.x,0.0,1.0);
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
  color=mix(color,toasted,smoothstep(0.0,0.2,charAmount));
  let ash=smoothstep(0.84,1.0,charAmount)*smoothstep(-0.15,0.65,noise(input.viewPosition*85.0));
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
  let coalTexture=smoothstep(0.25,0.70,noise(input.viewPosition*145.0+vec3f(0.0,u.viewport.z*0.8,0.0)));
  let cracks=pow(coalTexture,4.0)*smoothstep(0.08,0.42,charAmount);
  let ember=pow(heat,3.0)*charAmount*(0.012+cracks*0.65);
  radiance+=vec3f(1.65,0.15,0.006)*ember;
  radiance+=color*vec3f(0.85,0.20,0.025)*smoothstep(0.04,0.55,heat)*(1.0-scorch*0.85);
  let distance=length(eye-input.viewPosition);
  let haze=1.0-exp(-max(0.0,distance-1.8)*0.025*u.rideOrigin.w);
  return vec4f(mix(max(radiance,vec3f(0.0)),vec3f(0.69,0.83,0.76),haze),1.0);
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
