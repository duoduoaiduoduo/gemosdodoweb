import { volumeCommon, VOLUME_SIZE as SIZE, SOURCE_STRIDE } from './fire-volume-shared.js?v=fire-v29d';
import { injectWGSL, advectWGSL, PRESSURE_SIZE, divergenceWGSL, pressureWGSL, gradientWGSL, projectWGSL } from './fire-flow.js?v=fire-v29d';
import { createSmokePlume } from './smoke-plume.js?v=fire-v29d';

// Temperature, soot and reacting gas occupy a persistent world-space volume.
// No camera-facing polygons are used for either fire or smoke.
const CELLS = SIZE ** 3;


const renderWGSL = volumeCommon + /* wgsl */ `
@group(0) @binding(1) var gasField: texture_3d<f32>;
// Four sorted MSAA centre-camera depths retain the fractional coverage of
// hair-thin blades. One near blade can no longer cut a whole gas pixel away.
@group(0) @binding(2) var sceneDepth: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var flowField: texture_3d<f32>;
@group(0) @binding(5) var smokeField: texture_3d<f32>;
struct VolumeVertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn volumeVertex(@builtin(vertex_index) vertex: u32) -> VolumeVertex {
  let corners=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  var result: VolumeVertex;
  result.position=vec4f(corners[vertex],0.0,1.0);
  result.uv=corners[vertex]*vec2f(0.5,-0.5)+vec2f(0.5);
  return result;
}
fn volumeSample(uv: vec3f) -> vec4f {
  if(!inside(uv)){return vec4f(0.0);}
  return textureSampleLevel(gasField,linearSampler,uv,0.0);
}
fn smokeSample(uv: vec3f) -> vec4f {
  if(!inside(uv)){return vec4f(0.0);}
  return textureSampleLevel(smokeField,linearSampler,uv,0.0);
}
fn smokeAge(state: vec4f) -> f32 {
  return clamp(state.y/max(0.00001,state.x),0.0,12.0);
}
fn blackbody(temperature: f32) -> vec3f {
  let red=vec3f(0.90,0.023,0.001);
  let orange=vec3f(2.20,0.29,0.005);
  let gold=vec3f(3.35,1.40,0.085);
  let hot=vec3f(4.6,3.1,0.92);
  var color=mix(red,orange,smoothstep(0.27,0.59,temperature));
  color=mix(color,gold,smoothstep(0.59,1.13,temperature));
  return mix(color,hot,smoothstep(1.14,1.52,temperature)*0.72);
}
fn reactionIntegral(value: f32,width: f32) -> f32 {
  let x=min(abs(value)/width,1.0);
  return sign(value)*width*(x-x*x*x+0.5*x*x*x*x);
}
fn reactionBand(previous: f32,current: f32,width: f32) -> f32 {
  let delta=current-previous;
  if(abs(delta)<0.001){return 1.0-smoothstep(0.0,width,abs((current+previous)*0.5));}
  // Exact integral of 1-smoothstep(0,width,abs(x)) across a ray segment.
  // A thin sheet between two sample centres contributes its proper area,
  // instead of disappearing or becoming an isolated overbright pixel.
  return clamp((reactionIntegral(current,width)-reactionIntegral(previous,width))/delta,0.0,1.0);
}
fn smokeCoefficient(age: f32) -> f32 {
  // A fresh fold is dense; its older, entrained cap becomes translucent.
  // Old soot must not become progressively more opaque as it leaves the fire.
  return mix(8.8,10.5,smoothstep(0.12,0.75,age))
    *mix(1.0,0.44,smoothstep(0.85,4.8,age));
}
fn rollingSoot(state: vec4f,world: vec3f,velocity: vec3f) -> f32 {
  if(state.x<=0.0015){return 0.0;}
  // Birth position and recovered birth time are material coordinates. Their
  // contours bend with the independent smoke transport, so the thin sheets
  // stretch and roll with the plume instead of sliding through world noise.
  let birth=state.zw/max(0.00001,state.x);
  let age=smokeAge(state);
  let birthTime=gasSettings.frame-age;
  let material=vec3f(birth.x*5.4,birthTime*1.35,birth.y*5.4);
  let warp=noiseGradient(material*0.73+vec3f(1.7,4.8,6.2)).yzw;
  let fold=noise(material+warp*0.85);
  let lace=noise(material*2.13+warp*1.1+vec3f(3.1,7.3,2.9));
  let folded=fold+lace*0.28;
  let opened=smoothstep(0.20,0.85,age);
  let sheet=mix(0.10,1.32,smoothstep(-0.28,0.24,folded));
  let strand=noise((world-velocity*0.07)*vec3f(14.0,9.0,14.0)+warp*1.2);
  let thin=1.0-smoothstep(0.022,0.13,state.x);
  let old=smoothstep(0.7,4.0,age);
  let gap=smoothstep(-0.02,0.42,lace+strand*0.38);
  let erosion=(0.001+old*0.014)*thin*gap;
  return max(0.0,(state.x-0.0015)*mix(1.0,sheet,opened)*(1.0+strand*0.16)-erosion);
}
fn flameInterface(density: vec4f,world: vec3f,velocity: vec3f,time: f32) -> vec3f {
  let age=min(density.w,2.0);
  let roll=noiseGradient(world*6.4-velocity*0.7+vec3f(time*0.21,-time*0.77,time*0.14));
  let foldedWorld=world+roll.yzw*0.045-velocity*(0.075+age*0.10);
  let wrinkle=noise(foldedWorld*vec3f(11.0,6.0,11.0)+vec3f(time*0.35,-time*1.85,-time*0.23));
  let lace=noise(foldedWorld*vec3f(18.0,10.8,18.0)+roll.yzw*0.85+vec3f(6.2,-time*2.3,1.7));
  let fuelInterface=0.085+(wrinkle*0.5+0.5)*0.060+lace*0.010+max(0.0,age-0.10)*0.16;
  let branchChannel=0.15+1.05*smoothstep(-0.40,0.38,wrinkle+lace*0.16);
  return vec3f(density.z*branchChannel-fuelInterface,wrinkle,lace);
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
  let depths=textureLoad(sceneDepth,depthCoord,0);
  let near=mix(0.1,0.012,u.extra.x);
  let axialDepth=(10.0*near)/(vec4f(10.0)-depths*(10.0-near));
  let forwardCos=max(0.01,dot(rayDirection,-u.viewBack.xyz));
  let depthDistances=axialDepth/forwardCos;
  end=min(end,depthDistances.w+0.002);
  if(end<=start){return vec4f(0.0);}
  let rayLength=end-start;
  let steps=104u;
  let stepLength=rayLength/f32(steps);
  // Fixed stratified midpoints, plus an analytic reaction-band footprint,
  // avoid the stationary salt-and-pepper pattern of random ray offsets.
  var distance=start+stepLength*0.5;
  var transmission=1.0;
  var coverageOpacity=0.0;
  var radiance=vec3f(0.0);
  var previousMixture=-0.15;
  var skippedMixture=false;
  let sun=referenceSunDirection();
  let sunUV=vec3f(dot(sun,volumeRight(u)),dot(sun,volumeUp(u)),dot(sun,volumeForward(u)))/extent;
  let cosine=dot(rayDirection,sun);
  let phase=0.72+0.19*(1.0-0.38*0.38)/pow(1.0+0.38*0.38-0.76*cosine,1.5);
  let time=gasSettings.frame;
  for(var sample=0u;sample<steps;sample++){
    let world=rayOrigin+rayDirection*distance;
    let uv=uvFromWorld(world,u);
    let density=volumeSample(uv);
    let smoke=smokeSample(uv);
    let gasPresent=density.x+density.y+density.z>0.0018;
    if(gasPresent||smoke.x>0.0018){
      let velocity=textureSampleLevel(flowField,linearSampler,uv,0.0).xyz;
      let age=min(density.w,2.0);
      // A diffusion flame radiates at a thin fuel/air reaction interface;
      // the whole hot gas pocket must not glow like coloured fog. The scalar
      // interface is folded by the actual advected flow, then wrinkles split
      // and rejoin it into unequal, leaning tongues and torn trailing tips.
      var sheet=0.0;
      var reaction=0.0;
      var hotCore=0.0;
      // Leave the accepted reaction interface intact. Cold detached smoke
      // skips its flame-only wrinkles, paying instead for coherent soot folds.
      if(density.x>0.14&&density.z>0.035&&age<1.10){
        if(skippedMixture&&sample>0u){
          // Restore the preceding sample only at a flame entrance, retaining
          // the original thin-interface integral without shading every cold voxel.
          let previousWorld=rayOrigin+rayDirection*(distance-stepLength);
          let previousUV=uvFromWorld(previousWorld,u);
          let previousDensity=volumeSample(previousUV);
          let previousVelocity=textureSampleLevel(flowField,linearSampler,previousUV,0.0).xyz;
          previousMixture=flameInterface(previousDensity,previousWorld,previousVelocity,time).x;
        }
        let reactionInterface=flameInterface(density,world,velocity,time);
        let mixtureDistance=reactionInterface.x;
        let wrinkle=reactionInterface.y;
        let lace=reactionInterface.z;
        sheet=min(1.0,reactionBand(previousMixture,mixtureDistance,0.068)*1.10);
        let tears=smoothstep(-0.52,-0.19,lace+wrinkle*0.40-age*0.10);
        let innerShoulder=smoothstep(-0.005,0.050,mixtureDistance)
          *(1.0-smoothstep(0.14,0.28,mixtureDistance))*0.35;
        reaction=max(sheet,innerShoulder)*tears*smoothstep(0.14,0.38,density.x)
          *smoothstep(0.035,0.11,density.z)*(1.0-smoothstep(0.64,1.10,age));
        hotCore=smoothstep(1.10,1.48,density.x)*smoothstep(0.55,0.94,density.z)
          *(1.0-smoothstep(0.035,0.14,age));
        previousMixture=mixtureDistance;
        skippedMixture=false;
      }else if(gasPresent){skippedMixture=true;}
      else{previousMixture=-0.15;skippedMixture=false;}
      let soot=rollingSoot(smoke,world,velocity);
      let localSmokeAge=smokeAge(smoke);
      let smokeExtinction=soot*smokeCoefficient(localSmokeAge);
      let flameExtinction=reaction*38.0+hotCore*7.0;
      let extinction=smokeExtinction+flameExtinction;
      let opacity=1.0-exp(-extinction*stepLength);
      if(opacity>0.000025){
        var opticalShadow=0.0;
        var litNeighbour=soot;
        if(soot>0.005){
          // Increasing world-space intervals resolve the lit billow rim and
          // still reach the neighbouring roll that shadows its darker core.
          var shadowDistance=0.045;
          var shadowStep=0.065;
          for(var shadow=0u;shadow<5u;shadow++){
            let neighbour=smokeSample(uv+sunUV*shadowDistance);
            var shadowSoot=max(0.0,neighbour.x-0.0015);
            if(shadow==0u){
              // The nearest lit fold must use the same carved material as
              // the visible ray. Raw voxel density would smooth its dark
              // troughs and lit shoulders back into one broad grey cap.
              shadowSoot=rollingSoot(neighbour,world+sun*shadowDistance,velocity);
              litNeighbour=shadowSoot;
            }
            opticalShadow+=shadowSoot*shadowStep*smokeCoefficient(smokeAge(neighbour));
            shadowDistance+=shadowStep;shadowStep*=1.55;
          }
        }
        let sunTransmission=exp(-opticalShadow*1.15);
        let facing=clamp(0.50+(soot-litNeighbour)/max(0.018,soot*0.75),0.0,1.0);
        let cavity=mix(0.28,1.0,exp(-opticalShadow*0.85));
        let ambient=vec3f(0.062,0.074,0.093)*cavity*exp(-soot*0.60);
        let sunColor=vec3f(0.38,0.36,0.325)*sunTransmission*phase*mix(0.62,1.22,facing);
        let warmBase=vec3f(0.16,0.032,0.006)*min(1.0,density.x)*exp(-localSmokeAge*0.55);
        let smokeLight=ambient+sunColor+warmBase;
        // The thin mixing layer is hotter than the bulk gas in its voxel.
        // Temperature gates combustion above; interface chemistry gives the
        // readable gold centre, while the outer optical edge stays orange.
        let reactionTemperature=0.94+0.46*smoothstep(0.20,0.90,density.x);
        let centre=smoothstep(0.18,0.76,sheet);
        var flameColor=mix(blackbody(0.57),blackbody(reactionTemperature),centre);
        flameColor=mix(flameColor,vec3f(5.5,4.2,1.60),max(hotCore*0.70,pow(centre,5.0)*0.23))*0.93;
        let sourceRadiance=(smokeExtinction*smokeLight+flameExtinction*flameColor)/max(extinction,0.00001);
        // T is the gas transmission common to all four sub-rays. Coverage is
        // applied only to the contributions, equivalent to averaging four
        // independently truncated rays, without allowing gas through a blade.
        let visible=select(vec4f(0.0),vec4f(1.0),vec4f(distance)<depthDistances+vec4f(0.001));
        let visibility=dot(visible,vec4f(0.25));
        radiance+=transmission*sourceRadiance*opacity*visibility;
        coverageOpacity+=transmission*opacity*visibility;
        transmission*=1.0-opacity;
      }
    }else{
      previousMixture=-0.15;
      skippedMixture=false;
    }
    distance+=stepLength;
    if(transmission<0.025){break;}
  }
  return vec4f(radiance,coverageOpacity);
}
`;

export async function createFireVisuals(device, { uniforms, plants, fireState, format = 'rgba16float' }) {
  const settingsBuffer = device.createBuffer({label:'Volumetric fire settings',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const previousUniforms = device.createBuffer({label:'Previous volume coordinate frame',size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const sourceBuffer = device.createBuffer({label:'World-space atomic gas emission',size:CELLS*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const makeVolume = label => device.createTexture({label,size:[SIZE,SIZE,SIZE],dimension:'3d',format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING});
  const gases = [makeVolume('Combustion volume A'),makeVolume('Combustion volume B')];
  const velocities = [makeVolume('Buoyant velocity A'),makeVolume('Buoyant velocity B')];
  const smokePlume=await createSmokePlume(device,{uniforms,settingsBuffer,previousUniforms,sourceBuffer,gases,velocities});
  const predictedVelocity=makeVolume('Unprojected buoyant velocity');
  const makeCoarse=(label,coarseFormat)=>device.createTexture({label,size:[PRESSURE_SIZE,PRESSURE_SIZE,PRESSURE_SIZE],dimension:'3d',format:coarseFormat,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING});
  const divergenceTexture=makeCoarse('Coarse velocity divergence','r32float');
  const pressures=[makeCoarse('Air pressure A','r32float'),makeCoarse('Air pressure B','r32float')];
  const pressureGradient=makeCoarse('Trilinear pressure-gradient field','rgba16float');
  const sampler = device.createSampler({label:'Trilinear gas interpolation',magFilter:'linear',minFilter:'linear',mipmapFilter:'nearest',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge',addressModeW:'clamp-to-edge'});
  const uniformEntry = (binding, visibility=GPUShaderStage.COMPUTE|GPUShaderStage.FRAGMENT) => ({binding,visibility,buffer:{type:'uniform'}});
  const commonEntries=[uniformEntry(0),uniformEntry(7),uniformEntry(8)];
  const sourceLayout = device.createBindGroupLayout({entries:[uniformEntry(0,GPUShaderStage.COMPUTE),{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},uniformEntry(7,GPUShaderStage.COMPUTE),uniformEntry(8,GPUShaderStage.COMPUTE)]});
  const computeLayout=device.createBindGroupLayout({entries:[...commonEntries,{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},{binding:2,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:4,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float',viewDimension:'3d'}},{binding:5,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:'rgba16float',viewDimension:'3d'}},{binding:6,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}}]});
  const sampled3D=(binding,sampleType='float')=>({binding,visibility:GPUShaderStage.COMPUTE,texture:{viewDimension:'3d',sampleType}});
  const stored3D=(binding,storageFormat)=>({binding,visibility:GPUShaderStage.COMPUTE,storageTexture:{access:'write-only',format:storageFormat,viewDimension:'3d'}});
  const filteredSampler=binding=>({binding,visibility:GPUShaderStage.COMPUTE,sampler:{type:'filtering'}});
  const divergenceLayout=device.createBindGroupLayout({entries:[...commonEntries,sampled3D(1),stored3D(2,'r32float'),filteredSampler(3)]});
  const pressureLayout=device.createBindGroupLayout({entries:[...commonEntries,sampled3D(1,'unfilterable-float'),sampled3D(2,'unfilterable-float'),stored3D(3,'r32float')]});
  const gradientLayout=device.createBindGroupLayout({entries:[...commonEntries,sampled3D(1,'unfilterable-float'),stored3D(2,'rgba16float')]});
  const projectLayout=device.createBindGroupLayout({entries:[...commonEntries,sampled3D(1),sampled3D(2),stored3D(3,'rgba16float'),filteredSampler(4)]});
  const renderLayout=device.createBindGroupLayout({entries:[...commonEntries,{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{viewDimension:'3d'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'unfilterable-float'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},{binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{viewDimension:'3d'}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{viewDimension:'3d'}}]});
  const computePipeline=(label,layout,code,entryPoint)=>device.createComputePipelineAsync({label,layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:device.createShaderModule({label,code}),entryPoint}});
  const [injectPipeline,advectPipeline,renderPipeline,divergencePipeline,clearPressurePipeline,pressurePipeline,gradientPipeline,projectPipeline]=await Promise.all([
    device.createComputePipelineAsync({label:'Gas released by burning blades',layout:device.createPipelineLayout({bindGroupLayouts:[sourceLayout]}),compute:{module:device.createShaderModule({label:'Root gas injection',code:injectWGSL}),entryPoint:'inject'}}),
    device.createComputePipelineAsync({label:'Persistent buoyant gas advection',layout:device.createPipelineLayout({bindGroupLayouts:[computeLayout]}),compute:{module:device.createShaderModule({label:'Buoyant flow and cooling',code:advectWGSL}),entryPoint:'advect'}}),
    device.createRenderPipelineAsync({label:'World-space volume ray integration',layout:device.createPipelineLayout({bindGroupLayouts:[renderLayout]}),vertex:{module:device.createShaderModule({label:'Volume raymarch',code:renderWGSL}),entryPoint:'volumeVertex'},fragment:{module:device.createShaderModule({label:'Volumetric radiance and self-shadow',code:renderWGSL}),entryPoint:'volumeFragment',targets:[{format}]},primitive:{topology:'triangle-list'}}),
    computePipeline('Airflow divergence',divergenceLayout,divergenceWGSL,'divergence'),
    computePipeline('Clear pressure solution',pressureLayout,pressureWGSL,'clearPressure'),
    computePipeline('Incompressible air pressure',pressureLayout,pressureWGSL,'pressureJacobi'),
    computePipeline('Pressure gradient for velocity projection',gradientLayout,gradientWGSL,'pressureGradient'),
    computePipeline('Projected air velocity',projectLayout,projectWGSL,'projectVelocity'),
  ]);
  const commonResources=[{binding:0,resource:{buffer:uniforms}},{binding:7,resource:{buffer:settingsBuffer}},{binding:8,resource:{buffer:previousUniforms}}];
  const sourceGroup=device.createBindGroup({layout:sourceLayout,entries:[...commonResources,{binding:1,resource:{buffer:plants}},{binding:2,resource:{buffer:fireState}},{binding:3,resource:{buffer:sourceBuffer}}]});
  const computeGroups=[0,1].map(index=>device.createBindGroup({layout:computeLayout,entries:[...commonResources,{binding:1,resource:gases[index].createView()},{binding:2,resource:velocities[index].createView()},{binding:3,resource:{buffer:sourceBuffer}},{binding:4,resource:gases[1-index].createView()},{binding:5,resource:velocities[1-index].createView()},{binding:6,resource:sampler}]}));
  const liveComputeGroups=[0,1].map(index=>device.createBindGroup({layout:computeLayout,entries:[...commonResources,{binding:1,resource:gases[index].createView()},{binding:2,resource:velocities[index].createView()},{binding:3,resource:{buffer:sourceBuffer}},{binding:4,resource:gases[1-index].createView()},{binding:5,resource:predictedVelocity.createView()},{binding:6,resource:sampler}]}));
  const divergenceGroup=device.createBindGroup({layout:divergenceLayout,entries:[...commonResources,{binding:1,resource:predictedVelocity.createView()},{binding:2,resource:divergenceTexture.createView()},{binding:3,resource:sampler}]});
  const pressureGroups=[0,1].map(index=>device.createBindGroup({layout:pressureLayout,entries:[...commonResources,{binding:1,resource:divergenceTexture.createView()},{binding:2,resource:pressures[index].createView()},{binding:3,resource:pressures[1-index].createView()}]}));
  const gradientGroup=device.createBindGroup({layout:gradientLayout,entries:[...commonResources,{binding:1,resource:pressures[0].createView()},{binding:2,resource:pressureGradient.createView()}]});
  const projectGroups=[0,1].map(index=>device.createBindGroup({layout:projectLayout,entries:[...commonResources,{binding:1,resource:predictedVelocity.createView()},{binding:2,resource:pressureGradient.createView()},{binding:3,resource:velocities[1-index].createView()},{binding:4,resource:sampler}]}));
  let current=0;
  let elapsedGasTime=0;
  let first=true;
  let remainingSmokeTime=0;
  let destroyed=false;
  let outputTexture=null;
  let renderGroups=[];
  let outputView=null;
  return {
    get texture(){return outputTexture;},
    get velocityTexture(){return velocities[current];},
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
      elapsedGasTime=reset?0:elapsedGasTime+step;
      device.queue.writeBuffer(settingsBuffer,0,new Float32Array([step,reset?1:0,elapsedGasTime,active&&!regrowing?1:0]));
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
      const projectAirflow=!reset&&step>0;
      const flowPass=encoder.beginComputePass({label:'Advect and cool persistent 3D gases'});
      flowPass.setPipeline(advectPipeline);flowPass.setBindGroup(0,projectAirflow?liveComputeGroups[current]:computeGroups[current]);
      flowPass.dispatchWorkgroups(SIZE/4,SIZE/4,SIZE/4);flowPass.end();
      if(projectAirflow){
        const coarseGroups=Math.ceil(PRESSURE_SIZE/4);
        const divergencePass=encoder.beginComputePass({label:'Measure rising-gas airflow divergence'});
        divergencePass.setPipeline(divergencePipeline);divergencePass.setBindGroup(0,divergenceGroup);divergencePass.dispatchWorkgroups(coarseGroups,coarseGroups,coarseGroups);divergencePass.end();
        const pressurePass=encoder.beginComputePass({label:'Let the surrounding air respond to buoyancy'});
        pressurePass.setPipeline(clearPressurePipeline);pressurePass.setBindGroup(0,pressureGroups[1]);pressurePass.dispatchWorkgroups(coarseGroups,coarseGroups,coarseGroups);
        pressurePass.setPipeline(pressurePipeline);
        // Thirty-two cheap coarse-grid relaxations propagate a pressure
        // response into still air before the next density advection. Merely
        // accelerating occupied voxels cannot carry smoke into empty space.
        for(let iteration=0;iteration<32;iteration++){
          pressurePass.setBindGroup(0,pressureGroups[iteration&1]);pressurePass.dispatchWorkgroups(coarseGroups,coarseGroups,coarseGroups);
        }
        pressurePass.end();
        const gradientPass=encoder.beginComputePass({label:'Reconstruct the pressure-gradient field'});
        gradientPass.setPipeline(gradientPipeline);gradientPass.setBindGroup(0,gradientGroup);gradientPass.dispatchWorkgroups(coarseGroups,coarseGroups,coarseGroups);gradientPass.end();
        const projectionPass=encoder.beginComputePass({label:'Project buoyant velocity through surrounding air'});
        projectionPass.setPipeline(projectPipeline);projectionPass.setBindGroup(0,projectGroups[current]);projectionPass.dispatchWorkgroups(SIZE/4,SIZE/4,SIZE/4);projectionPass.end();
      }
      current=1-current;
      smokePlume.encode(encoder,current);
      encoder.copyBufferToBuffer(uniforms,0,previousUniforms,0,256);
      first=false;
    },
    resize({width,height,depthTexture}){
      if(destroyed){return;}
      outputTexture?.destroy();
      const scale=Math.min(0.75,960/Math.max(width,height));
      outputTexture=device.createTexture({label:'Antialiased volumetric radiance',size:[Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale))],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
      outputView=outputTexture.createView();
      renderGroups=[0,1].map(index=>device.createBindGroup({layout:renderLayout,entries:[...commonResources,{binding:1,resource:gases[index].createView()},{binding:2,resource:depthTexture.createView()},{binding:3,resource:sampler},{binding:4,resource:velocities[index].createView()},{binding:5,resource:smokePlume.textures[index].createView()}]}));
    },
    render(encoder){
      if(destroyed||!outputView){return;}
      const pass=encoder.beginRenderPass({label:'Integrate volume radiance and smoke occlusion',colorAttachments:[{view:outputView,clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
      if(remainingSmokeTime>0){pass.setPipeline(renderPipeline);pass.setBindGroup(0,renderGroups[current]);pass.draw(3);}pass.end();
    },
    destroy(){
      if(destroyed){return;}destroyed=true;
      outputTexture?.destroy();smokePlume.destroy();settingsBuffer.destroy();previousUniforms.destroy();sourceBuffer.destroy();
      for(const texture of [...gases,...velocities,predictedVelocity,divergenceTexture,...pressures,pressureGradient]){texture.destroy();}
    },
  };
}
