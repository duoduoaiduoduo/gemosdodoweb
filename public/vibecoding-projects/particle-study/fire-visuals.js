import { sharedWGSL } from './shaders.js?v=fire-v20c';

// Temperature, soot and reacting gas occupy a persistent world-space volume.
// No camera-facing polygons are used for either fire or smoke.
const SIZE = 64;
const SOURCE_STRIDE = 8;
const CELLS = SIZE ** 3;

const volumeCommon = sharedWGSL + /* wgsl */ `
struct GasSettings { step: f32, clear: f32, frame: f32, injecting: f32 };
@group(0) @binding(7) var<uniform> gasSettings: GasSettings;
@group(0) @binding(8) var<uniform> previousU: Uniforms;
const GRID: u32 = ${SIZE}u;
fn volumeRight(parameters: Uniforms) -> vec3f {
  return vec3f(1.0,0.0,0.0);
}
fn volumeUp(parameters: Uniforms) -> vec3f {
  return vec3f(0.0,1.0,0.0);
}
// A world-aligned box can follow the rider without interpolating opposing
// heading vectors through zero during the sphere-to-meadow transition.
fn volumeForward(parameters: Uniforms) -> vec3f { return vec3f(0.0,0.0,1.0); }
fn volumeMinimum(parameters: Uniforms) -> vec3f {
  return mix(vec3f(-1.85,-1.60,-1.85),vec3f(-2.5,-0.55,-2.5),parameters.rideOrigin.w);
}
fn volumeExtent(parameters: Uniforms) -> vec3f {
  return mix(vec3f(3.70,4.65,3.70),vec3f(5.0,4.2,5.0),parameters.rideOrigin.w);
}
fn localFromWorld(position: vec3f, parameters: Uniforms) -> vec3f {
  let relative=position-parameters.riderContact.xyz*parameters.rideOrigin.w;
  return vec3f(dot(relative,volumeRight(parameters)),dot(relative,volumeUp(parameters)),dot(relative,volumeForward(parameters)));
}
fn uvFromWorld(position: vec3f, parameters: Uniforms) -> vec3f {
  return (localFromWorld(position,parameters)-volumeMinimum(parameters))/volumeExtent(parameters);
}
fn worldFromUV(uv: vec3f, parameters: Uniforms) -> vec3f {
  let p=uv*volumeExtent(parameters)+volumeMinimum(parameters);
  return parameters.riderContact.xyz*parameters.rideOrigin.w+volumeRight(parameters)*p.x+volumeUp(parameters)*p.y+volumeForward(parameters)*p.z;
}
fn inside(uv: vec3f) -> bool { return all(uv>vec3f(0.001))&&all(uv<vec3f(0.999)); }
fn cellIndex(cell: vec3u) -> u32 { return cell.x+GRID*(cell.y+GRID*cell.z); }
fn combustionCell(direction: vec3f) -> u32 {
  let longitude=fract(atan2(direction.z,direction.x)/6.28318530718+1.0);
  let latitude=acos(clamp(direction.y,-1.0,1.0))/3.14159265359;
  return min(63u,u32(longitude*64.0))+min(31u,u32(latitude*32.0))*64u;
}
`;

const injectWGSL = volumeCommon + /* wgsl */ `
struct SourceCell { heat: atomic<u32>, soot: atomic<u32>, reaction: atomic<u32>, coverage: atomic<u32> };
@group(0) @binding(1) var<storage,read> plants: array<Particle>;
@group(0) @binding(2) var<storage,read> fireState: array<vec4f>;
@group(0) @binding(3) var<storage,read_write> sources: array<SourceCell>;
fn splat(position: vec3f, heat: f32, soot: f32, reaction: f32, spread: f32) {
  let uv=uvFromWorld(position,u);
  if(!inside(uv)){return;}
  let center=vec3i(floor(uv*f32(GRID)));
  let fraction=fract(uv*f32(GRID))-vec3f(0.5);
  for(var z=-1;z<=1;z++){
    for(var y=-1;y<=1;y++){
      for(var x=-1;x<=1;x++){
        let cell=center+vec3i(x,y,z);
        if(any(cell<vec3i(0))||any(cell>=vec3i(i32(GRID)))){continue;}
        let delta=vec3f(f32(x),f32(y),f32(z))-fraction;
        let weight=exp(-dot(delta,delta)*spread);
        let index=cellIndex(vec3u(cell));
        atomicMax(&sources[index].heat,u32(heat*weight*4096.0));
        atomicMax(&sources[index].soot,u32(soot*weight*4096.0));
        atomicMax(&sources[index].reaction,u32(reaction*weight*4096.0));
      }
    }
  }
}
@compute @workgroup_size(64)
fn inject(@builtin(global_invocation_id) invocation: vec3u) {
  let identity=invocation.x*${SOURCE_STRIDE}u;
  if(identity>=u32(u.viewport.w)||gasSettings.injecting<0.5){return;}
  let plant=plants[identity];
  if(plant.position.w<0.00015){return;}
  // Hidden inner roots do not pour gas through the outside of the shell.
  if(plant.material.z>0.5 && u.rideOrigin.w<0.65){return;}
  let state=fireState[combustionCell(rideDirection(identity))];
  let burning=smoothstep(0.24,0.82,state.x)*smoothstep(0.012,0.11,state.y);
  let smoulder=state.w*0.72;
  if(burning<0.002&&smoulder<0.003){return;}
  let vertical=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let leafDirection=normalize(vertical*0.80+plant.normal.xyz*0.34);
  let height=plant.position.w*mix(10.4,15.6,random(identity*37u+114u))*mix(1.0,0.7316,u.rideOrigin.w);
  let remainingHeight=height*(1.0-clamp(state.z,0.0,1.0)*clamp(state.z,0.0,1.0)*0.76);
  let variation=mix(0.72,1.16,random(identity*79u+107u));
  // Emission is distributed along the actual remaining blades, with gaps
  // between plants. It is never a screen-aligned or periodically reset flame.
  let sourceHeat=burning*1.84*variation+smoulder*0.18;
  let sourceSoot=smoulder*1.12+burning*0.32;
  splat(plant.position.xyz+leafDirection*(remainingHeight*0.30),sourceHeat,sourceSoot,burning*variation,1.90);
  splat(plant.position.xyz+leafDirection*(remainingHeight*0.76),sourceHeat*0.92,sourceSoot*0.78,burning*variation*0.93,2.15);
  splat(plant.position.xyz+leafDirection*(remainingHeight*1.04)+vertical*0.012,sourceHeat*1.04,sourceSoot*0.44,burning*variation*1.05,2.70);
}
`;

const advectWGSL = volumeCommon + /* wgsl */ `
@group(0) @binding(1) var oldGas: texture_3d<f32>;
@group(0) @binding(2) var oldVelocity: texture_3d<f32>;
@group(0) @binding(3) var<storage,read> sources: array<vec4u>;
@group(0) @binding(4) var nextGas: texture_storage_3d<rgba16float,write>;
@group(0) @binding(5) var nextVelocity: texture_storage_3d<rgba16float,write>;
@group(0) @binding(6) var linearSampler: sampler;
fn sampleGas(position: vec3f) -> vec4f {
  let uv=uvFromWorld(position,previousU);
  if(!inside(uv)){return vec4f(0.0);}
  return textureSampleLevel(oldGas,linearSampler,uv,0.0);
}
fn sampleVelocity(position: vec3f) -> vec3f {
  let uv=uvFromWorld(position,previousU);
  if(!inside(uv)){return vec3f(0.0);}
  return textureSampleLevel(oldVelocity,linearSampler,uv,0.0).xyz;
}
// Curl of two scalar potentials. These forces are divergence-free and roll
// the density into filaments instead of randomly translating smoke puffs.
fn turbulentCurl(position: vec3f, time: f32) -> vec3f {
  let p=position*5.2+vec3f(time*0.29,-time*0.41,time*0.17);
  let a=noiseGradient(p+vec3f(4.1,1.2,7.8)).yzw;
  let b=noiseGradient(p*1.73+vec3f(-2.7,6.1,3.9)).yzw;
  return cross(a,vec3f(0.0,1.0,0.0))*0.11+cross(b,vec3f(0.7,0.1,0.5))*0.045;
}
@compute @workgroup_size(4,4,4)
fn advect(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(GRID))){return;}
  if(gasSettings.clear>0.5){
    textureStore(nextGas,vec3i(cell),vec4f(0.0));
    textureStore(nextVelocity,vec3i(cell),vec4f(0.0));
    return;
  }
  let dt=gasSettings.step;
  let uv=(vec3f(cell)+vec3f(0.5))/f32(GRID);
  let world=worldFromUV(uv,u);
  let firstVelocity=sampleVelocity(world);
  let middleVelocity=sampleVelocity(world-firstVelocity*dt*0.5);
  let departure=world-middleVelocity*dt;
  var gas=sampleGas(departure);
  var velocity=sampleVelocity(departure);
  let source=vec3f(sources[cellIndex(cell)].xyz)/4096.0;
  let vertical=normalize(u.worldUp.xyz);
  let sourceResponse=1.0-exp(-dt*17.0);
  gas.x=mix(gas.x,max(gas.x,source.x),sourceResponse);
  gas.y=mix(gas.y,max(gas.y,source.y),sourceResponse*0.70);
  gas.z=mix(gas.z,max(gas.z,source.z),sourceResponse);
  gas.x*=exp(-dt*(0.82+gas.y*0.09));
  gas.y*=exp(-dt*0.16);
  gas.z*=exp(-dt*1.20);
  // Buoyancy integrates acceleration, so a new hot pocket first gathers,
  // rises, curls over and cools into a separate persistent soot plume.
  let buoyancy=vertical*(gas.x*1.58-gas.y*0.11);
  let ambientWind=volumeRight(u)*(0.045+0.018*sin(u.viewport.z*0.43))+volumeForward(u)*0.025;
  let curl=turbulentCurl(world,u.viewport.z);
  velocity+=(buoyancy+curl*min(1.0,gas.x*1.9+gas.y*0.7))*dt;
  // Expanding combustion gas leaves the exposed blade tip with upward
  // momentum before buoyancy takes over higher in the plume.
  velocity+=vertical*max(0.0,0.40-dot(velocity,vertical))*min(1.0,source.z)*sourceResponse;
  velocity=mix(velocity,ambientWind,1.0-exp(-dt*0.32));
  velocity*=exp(-dt*0.47);
  velocity=clamp(velocity,vec3f(-1.4),vec3f(1.4));
  let boundary=min(min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),min(uv.z,1.0-uv.z));
  gas*=smoothstep(0.0,0.045,boundary);
  gas=clamp(gas,vec4f(0.0),vec4f(2.5,2.0,1.6,1.0));
  textureStore(nextGas,vec3i(cell),gas);
  textureStore(nextVelocity,vec3i(cell),vec4f(velocity,0.0));
}
`;

const renderWGSL = volumeCommon + /* wgsl */ `
@group(0) @binding(1) var gasField: texture_3d<f32>;
@group(0) @binding(2) var sceneDepth: texture_depth_2d;
@group(0) @binding(3) var linearSampler: sampler;
struct VolumeVertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn volumeVertex(@builtin(vertex_index) vertex: u32) -> VolumeVertex {
  let corners=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  var result: VolumeVertex;
  result.position=vec4f(corners[vertex],0.0,1.0);
  result.uv=corners[vertex]*vec2f(0.5,-0.5)+vec2f(0.5);
  return result;
}
fn volumeSample(uv: vec3f) -> vec3f {
  if(!inside(uv)){return vec3f(0.0);}
  return textureSampleLevel(gasField,linearSampler,uv,0.0).xyz;
}
fn blackbody(temperature: f32) -> vec3f {
  let red=vec3f(1.45,0.016,0.001);
  let orange=vec3f(3.0,0.33,0.008);
  let gold=vec3f(4.15,1.32,0.10);
  let hot=vec3f(4.8,2.2,0.36);
  var color=mix(red,orange,smoothstep(0.22,0.57,temperature));
  color=mix(color,gold,smoothstep(0.64,1.16,temperature));
  return mix(color,hot,smoothstep(1.27,1.68,temperature)*0.42);
}
@fragment fn volumeFragment(input: VolumeVertex) -> @location(0) vec4f {
  let rayOrigin=cameraWorld();
  let rayDirection=backgroundWorldRay(input.uv);
  let localOrigin=localFromWorld(rayOrigin,u);
  let localRay=vec3f(dot(rayDirection,volumeRight(u)),dot(rayDirection,volumeUp(u)),dot(rayDirection,volumeForward(u)));
  let minimum=volumeMinimum(u);
  let extent=volumeExtent(u);
  let reciprocal=1.0/select(vec3f(0.000001),localRay,abs(localRay)>vec3f(0.000001));
  let a=(minimum-localOrigin)*reciprocal;
  let b=(minimum+extent-localOrigin)*reciprocal;
  let lower=min(a,b); let upper=max(a,b);
  var start=max(0.0,max(lower.x,max(lower.y,lower.z)));
  var end=min(upper.x,min(upper.y,upper.z));
  let depthSize=textureDimensions(sceneDepth);
  let depthCoord=clamp(vec2i(input.uv*vec2f(depthSize)),vec2i(0),vec2i(depthSize)-vec2i(1));
  // The final plant aperture is a pinhole sample. Its stored geometric depth
  // hides gas behind the grass and shell while preserving the gas in front.
  let depth=textureLoad(sceneDepth,depthCoord,0);
  let near=mix(0.1,0.012,u.extra.x);
  let axialDepth=(10.0*near)/(10.0-depth*(10.0-near));
  let forwardCos=max(0.01,dot(rayDirection,-u.viewBack.xyz));
  if(depth<0.99999){end=min(end,axialDepth/forwardCos+0.002);}
  if(end<=start){return vec4f(0.0);}
  let rayLength=end-start;
  let steps=72u;
  let stepLength=rayLength/f32(steps);
  let jitter=random(u32(input.position.x)*1973u+u32(input.position.y)*9277u)*0.75+0.125;
  var distance=start+stepLength*jitter;
  var transmission=1.0;
  var radiance=vec3f(0.0);
  let sun=referenceSunDirection();
  let sunUV=vec3f(dot(sun,volumeRight(u)),dot(sun,volumeUp(u)),dot(sun,volumeForward(u)))/extent;
  let phase=0.78+0.35*pow(max(0.0,dot(rayDirection,-sun)),3.0);
  for(var sample=0u;sample<steps;sample++){
    let world=rayOrigin+rayDirection*distance;
    let uv=uvFromWorld(world,u);
    let density=volumeSample(uv);
    if(density.x+density.y+density.z>0.004){
      // Small-scale noise modulates a real advected field. World-space sampling
      // remains identical from every viewpoint and has no polygon boundary.
      let q=localFromWorld(world,u)*vec3f(26.0,14.0,26.0)-vec3f(0.0,u.viewport.z*3.2,0.0);
      let fold=noise(q*0.31+vec3f(2.6,u.viewport.z*0.22,7.4));
      let warped=q+vec3f(fold*2.3,fold*0.62,-fold*1.65);
      let fine=noise(warped)*0.72+noise(warped*2.17+vec3f(7.9,2.1,4.8))*0.28;
      let filament=smoothstep(-0.27,0.28,fine+density.z*0.16);
      let flameBoundary=smoothstep(0.035,0.23,density.z);
      let reaction=density.z*smoothstep(0.24,0.83,density.x)*filament*flameBoundary;
      let soot=density.y*clamp(0.90+fine*0.24,0.55,1.15);
      let smokeExtinction=soot*7.2;
      // Hot soot absorbs the blue sky behind a flame. Without this coupled
      // absorption, additive emission over a bright sky makes pastel halos.
      let flameExtinction=reaction*6.2;
      let extinction=smokeExtinction+flameExtinction;
      let opacity=1.0-exp(-extinction*stepLength);
      if(opacity>0.00008||reaction>0.001){
        var opticalShadow=0.0;
        if(soot>0.008){
          for(var shadow=1u;shadow<=4u;shadow++){
            let shadowDistance=f32(shadow)*0.11;
            opticalShadow+=volumeSample(uv+sunUV*shadowDistance).y*0.11*7.2;
          }
        }
        let sunTransmission=exp(-opticalShadow);
        let ambient=vec3f(0.095,0.104,0.117);
        let sunColor=vec3f(0.25,0.229,0.199)*sunTransmission*phase;
        let smokeLight=(ambient+sunColor)+vec3f(0.24,0.045,0.003)*min(1.0,density.x)*reaction;
        let smokeContribution=smokeLight*(1.0-exp(-smokeExtinction*stepLength));
        let flameColor=blackbody(density.x);
        let flameEmission=flameColor*reaction*stepLength*5.6;
        radiance+=transmission*(smokeContribution+flameEmission);
        transmission*=1.0-opacity;
      }
    }
    distance+=stepLength;
    if(transmission<0.025){break;}
  }
  return vec4f(radiance,1.0-transmission);
}
`;

export async function createFireVisuals(device, { uniforms, plants, fireState, format = 'rgba16float' }) {
  const settingsBuffer = device.createBuffer({label:'Volumetric fire settings',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const previousUniforms = device.createBuffer({label:'Previous volume coordinate frame',size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const sourceBuffer = device.createBuffer({label:'World-space atomic gas emission',size:CELLS*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const makeVolume = label => device.createTexture({label,size:[SIZE,SIZE,SIZE],dimension:'3d',format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING});
  const gases = [makeVolume('Combustion volume A'),makeVolume('Combustion volume B')];
  const velocities = [makeVolume('Buoyant velocity A'),makeVolume('Buoyant velocity B')];
  const sampler = device.createSampler({label:'Trilinear gas interpolation',magFilter:'linear',minFilter:'linear',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge',addressModeW:'clamp-to-edge'});
  const uniformEntry = (binding, visibility=GPUShaderStage.COMPUTE|GPUShaderStage.FRAGMENT) => ({binding,visibility,buffer:{type:'uniform'}});
  const commonEntries=[uniformEntry(0),uniformEntry(7),uniformEntry(8)];
  const sourceLayout = device.createBindGroupLayout({entries:[uniformEntry(0,GPUShaderStage.COMPUTE),{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},uniformEntry(7,GPUShaderStage.COMPUTE),uniformEntry(8,GPUShaderStage.COMPUTE)]});
  const computeLayout=device.createBindGroupLayout({entries:[...commonEntries,{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},{binding:2,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:4,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float',viewDimension:'3d'}},{binding:5,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float',viewDimension:'3d'}},{binding:6,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}}]});
  const renderLayout=device.createBindGroupLayout({entries:[...commonEntries,{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{viewDimension:'3d'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
  const [injectPipeline,advectPipeline,renderPipeline]=await Promise.all([
    device.createComputePipelineAsync({label:'Gas released by burning blades',layout:device.createPipelineLayout({bindGroupLayouts:[sourceLayout]}),compute:{module:device.createShaderModule({label:'Root gas injection',code:injectWGSL}),entryPoint:'inject'}}),
    device.createComputePipelineAsync({label:'Persistent buoyant gas advection',layout:device.createPipelineLayout({bindGroupLayouts:[computeLayout]}),compute:{module:device.createShaderModule({label:'Buoyant flow and cooling',code:advectWGSL}),entryPoint:'advect'}}),
    device.createRenderPipelineAsync({label:'World-space volume ray integration',layout:device.createPipelineLayout({bindGroupLayouts:[renderLayout]}),vertex:{module:device.createShaderModule({label:'Volume raymarch',code:renderWGSL}),entryPoint:'volumeVertex'},fragment:{module:device.createShaderModule({label:'Volumetric radiance and self-shadow',code:renderWGSL}),entryPoint:'volumeFragment',targets:[{format}]},primitive:{topology:'triangle-list'}}),
  ]);
  const commonResources=[{binding:0,resource:{buffer:uniforms}},{binding:7,resource:{buffer:settingsBuffer}},{binding:8,resource:{buffer:previousUniforms}}];
  const sourceGroup=device.createBindGroup({layout:sourceLayout,entries:[...commonResources,{binding:1,resource:{buffer:plants}},{binding:2,resource:{buffer:fireState}},{binding:3,resource:{buffer:sourceBuffer}}]});
  const computeGroups=[0,1].map(index=>device.createBindGroup({layout:computeLayout,entries:[...commonResources,{binding:1,resource:gases[index].createView()},{binding:2,resource:velocities[index].createView()},{binding:3,resource:{buffer:sourceBuffer}},{binding:4,resource:gases[1-index].createView()},{binding:5,resource:velocities[1-index].createView()},{binding:6,resource:sampler}]}));
  let current=0;
  let frame=0;
  let first=true;
  let remainingSmokeTime=0;
  let destroyed=false;
  let outputTexture=null;
  let renderGroups=[];
  let outputView=null;
  return {
    get texture(){return outputTexture;},
    get active(){return remainingSmokeTime>0;},
    encode(encoder,{dt=0,count=0,active=false,regrowing=false,clear=false}={}){
      if(destroyed){return;}
      let reset=clear||first;
      const step=reset?0:Math.min(Math.max(dt,0),0.05);
      const previousSmokeTime=remainingSmokeTime;
      remainingSmokeTime=reset?0:active&&!regrowing?16:Math.max(0,remainingSmokeTime-step);
      // Expired smoke must be erased from the persistent volume as well as
      // hidden. Otherwise the next ignition could resurrect an old plume.
      if(!reset&&previousSmokeTime>0&&remainingSmokeTime<=0){reset=true;}
      device.queue.writeBuffer(settingsBuffer,0,new Float32Array([step,reset?1:0,frame++,active&&!regrowing?1:0]));
      if(!reset&&remainingSmokeTime<=0){
        encoder.copyBufferToBuffer(uniforms,0,previousUniforms,0,256);
        return;
      }
      encoder.clearBuffer(sourceBuffer);
      if(active&&!regrowing&&!reset&&count>0&&step>0){
        const injectPass=encoder.beginComputePass({label:'Inject leaf heat and soot into space'});
        injectPass.setPipeline(injectPipeline);injectPass.setBindGroup(0,sourceGroup);
        injectPass.dispatchWorkgroups(Math.ceil(count/SOURCE_STRIDE/64));injectPass.end();
      }
      // Even at dt=0 the frame is reprojected, so changing view/ride position
      // does not attach old smoke to the camera or to a moving volume box.
      const flowPass=encoder.beginComputePass({label:'Advect and cool persistent 3D gases'});
      flowPass.setPipeline(advectPipeline);flowPass.setBindGroup(0,computeGroups[current]);
      flowPass.dispatchWorkgroups(SIZE/4,SIZE/4,SIZE/4);flowPass.end();
      current=1-current;
      encoder.copyBufferToBuffer(uniforms,0,previousUniforms,0,256);
      first=false;
    },
    resize({width,height,depthTexture}){
      if(destroyed){return;}
      outputTexture?.destroy();
      const scale=Math.min(0.5,640/Math.max(width,height));
      outputTexture=device.createTexture({label:'Half-resolution volumetric radiance',size:[Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale))],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
      outputView=outputTexture.createView();
      renderGroups=[0,1].map(index=>device.createBindGroup({layout:renderLayout,entries:[...commonResources,{binding:1,resource:gases[index].createView()},{binding:2,resource:depthTexture.createView()},{binding:3,resource:sampler}]}));
    },
    render(encoder){
      if(destroyed||!outputView){return;}
      const pass=encoder.beginRenderPass({label:'Integrate volume radiance and smoke occlusion',colorAttachments:[{view:outputView,clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
      if(remainingSmokeTime>0){pass.setPipeline(renderPipeline);pass.setBindGroup(0,renderGroups[current]);pass.draw(3);}pass.end();
    },
    destroy(){
      if(destroyed){return;}destroyed=true;
      outputTexture?.destroy();settingsBuffer.destroy();previousUniforms.destroy();sourceBuffer.destroy();
      for(const texture of [...gases,...velocities]){texture.destroy();}
    },
  };
}
