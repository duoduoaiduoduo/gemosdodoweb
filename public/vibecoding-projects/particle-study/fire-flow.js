import { volumeCommon, SOURCE_STRIDE } from './fire-volume-shared.js?v=fire-v24b';

export const injectWGSL = volumeCommon + /* wgsl */ `
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
        // Compensate sub-voxel phase: a tip at a voxel corner should not
        // suddenly become fifteen times colder than the same tip at its centre.
        let weight=exp(-(dot(delta,delta)-dot(fraction,fraction)*0.65)*spread);
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
  if(plant.material.z>0.5 && u.rideOrigin.w<0.65){return;}
  let state=fireState[combustionCell(rideDirection(identity))];
  let burning=smoothstep(0.24,0.82,state.x)*smoothstep(0.012,0.11,state.y);
  let smoulder=state.w*0.72;
  if(burning<0.002&&smoulder<0.003){return;}
  let vertical=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let leafDirection=normalize(vertical*0.80+plant.normal.xyz*0.34);
  let height=plant.position.w*mix(10.4,15.6,random(identity*37u+114u))*mix(1.0,0.7316,u.rideOrigin.w);
  let remainingHeight=height*(1.0-clamp(state.z,0.0,1.0)*clamp(state.z,0.0,1.0)*0.76);
  let variation=mix(0.78,1.12,random(identity*79u+107u));
  let position=plant.position.xyz;
  let time=gasSettings.frame;
  // Adjacent blades feed one pulsing pocket. Their tips do not each emit a
  // permanent vertical column, and distant patches do not flicker in unison.
  let pocket=noise(position*9.4+vec3f(1.6,-time*1.34,time*0.22));
  let phase=noise(position*3.8+vec3f(14.7,6.8,-3.1))*6.2831853;
  let breath=0.5+0.5*sin(time*6.8+phase+pocket*2.2);
  let burst=smoothstep(-0.20,0.43,pocket+breath*0.44-0.13);
  let pulse=mix(0.23,1.15,burst);
  // The hot blade persists between bursts. Only a thin, intermittent reaction
  // sheet leaves its tip; cooler soot is mostly released by smouldering fuel.
  let sourceHeat=burning*1.48*variation;
  let sourceSoot=smoulder*0.98+burning*0.13;
  splat(position+leafDirection*(remainingHeight*0.31),sourceHeat*0.84,sourceSoot,burning*variation*0.49,2.70);
  splat(position+leafDirection*(remainingHeight*0.77),sourceHeat*mix(0.55,1.0,pulse),sourceSoot*0.67,burning*variation*pulse,3.10);
  splat(position+leafDirection*(remainingHeight*1.02)+vertical*0.008,sourceHeat*pulse,sourceSoot*0.26,burning*variation*pulse*1.20,3.60);
}
`;

export const advectWGSL = volumeCommon + /* wgsl */ `
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
// Analytic curls of scalar potentials provide coherent, divergence-free
// rolling motion at three scales, without frame-to-frame random displacement.
fn turbulentCurl(position: vec3f, time: f32) -> vec3f {
  let p=position*3.65+vec3f(time*0.17,-time*0.62,time*0.11);
  let a=noiseGradient(p+vec3f(4.1,1.2,7.8)).yzw;
  let b=noiseGradient(p*1.87+vec3f(-2.7,6.1,3.9)+vec3f(-time*0.13,time*0.18,time*0.16)).yzw;
  let c=noiseGradient(p*3.43+vec3f(8.6,-2.5,1.1)).yzw;
  return cross(a,vec3f(0.23,0.90,0.31))*0.74
    +cross(b,vec3f(0.81,0.12,-0.46))*0.35
    +cross(c,vec3f(-0.44,0.36,0.72))*0.11;
}
// A toroidal vector potential creates paired inward/outward flow around a
// rising lobe. These broader rolls entrain the cool rim back into each plume,
// rather than dragging every source upwards at the same fixed velocity.
fn entrainmentRoll(position: vec3f,time: f32) -> vec3f {
  let right=normalize(u.worldRight.xyz);
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let forward=normalize(cross(right,up));
  let p=vec3f(dot(position,right),dot(position,up),dot(position,forward));
  let tile=floor((p.xz+vec2f(0.13,-0.21))/0.86);
  let seed=hash3(vec3f(tile.x,3.7,tile.y));
  let center=(tile+vec2f(0.5))*0.86-vec2f(0.13,-0.21);
  let drift=vec2f(sin(time*0.59+seed*7.1),cos(time*0.47+seed*8.3))*0.075;
  let radial=p.xz-center-drift;
  let radius=length(radial);
  let offset=(fract(p.y/0.76-time*0.58+seed*0.77)-0.5)*0.76;
  let ringRadius=0.19+seed*0.025;
  let width2=0.018;
  let kernel=exp(-((radius-ringRadius)*(radius-ringRadius)+offset*offset)/width2);
  let radialFlow=2.0*0.33*radius*offset/width2*kernel;
  let lift=0.33*kernel*(2.0-2.0*radius*(radius-ringRadius)/width2);
  let horizontal=radial/max(radius,0.025)*radialFlow;
  return right*horizontal.x+forward*horizontal.y+up*lift;
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
  if(dt<=0.0){
    let frameOffset=u.riderContact.xyz*u.rideOrigin.w-previousU.riderContact.xyz*previousU.rideOrigin.w;
    let sameFrame=abs(u.rideOrigin.w-previousU.rideOrigin.w)<0.000001&&all(abs(frameOffset)<vec3f(0.000001));
    // Paused aperture accumulation may run hundreds of frames. Exact loads
    // preserve the frozen field instead of repeatedly filtering and fading it.
    if(sameFrame){
      textureStore(nextGas,vec3i(cell),textureLoad(oldGas,vec3i(cell),0));
      textureStore(nextVelocity,vec3i(cell),textureLoad(oldVelocity,vec3i(cell),0));
    }else{
      // Reproject once when the world-space volume follows an unfolding ride.
      textureStore(nextGas,vec3i(cell),sampleGas(world));
      textureStore(nextVelocity,vec3i(cell),vec4f(sampleVelocity(world),0.0));
    }
    return;
  }
  let firstVelocity=sampleVelocity(world);
  let middleVelocity=sampleVelocity(world-firstVelocity*dt*0.5);
  let departure=world-middleVelocity*dt;
  var gas=sampleGas(departure);
  var velocity=sampleVelocity(departure);
  let source=vec3f(sources[cellIndex(cell)].xyz)/4096.0;
  let vertical=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let sourceResponse=1.0-exp(-dt*22.0);
  gas.x=mix(gas.x,max(gas.x,source.x),sourceResponse);
  gas.y=mix(gas.y,max(gas.y,source.y),sourceResponse*0.58);
  gas.z=mix(gas.z,max(gas.z,source.z),sourceResponse);
  // Age follows each pocket through advection. A fresh reaction sheet stays
  // near zero while its detached, cooling cap becomes stratified older smoke.
  let ageRefresh=smoothstep(0.015,0.30,source.z)*sourceResponse;
  gas.w=mix(gas.w+dt,0.0,ageRefresh);
  let reactionCooling=mix(1.24,2.70,smoothstep(0.08,0.65,gas.w));
  let consumed=gas.z*(1.0-exp(-dt*reactionCooling));
  gas.z-=consumed;
  gas.x*=exp(-dt*(1.08+gas.y*0.13));
  // Soot forms at the cooling reaction rim and remains in a detached plume.
  gas.y=(gas.y+consumed*0.17)*exp(-dt*0.13);
  let activity=smoothstep(0.006,0.14,gas.x+gas.y*0.8);
  let warm=clamp(gas.x,0.0,1.5);
  let buoyancy=vertical*(warm*0.98-gas.y*0.024);
  let time=gasSettings.frame;
  let ambientWind=volumeRight(u)*(0.11+0.07*sin(time*0.71))
    +volumeForward(u)*(0.055+0.045*cos(time*0.47+1.2));
  var curling=vec3f(0.0);
  if(activity>0.001){curling=turbulentCurl(world,time)+entrainmentRoll(world,time)*0.68;}
  velocity+=(buoyancy+curling*activity)*dt;
  // A coherent low-frequency breeze pushes a whole group before its smaller
  // lobes peel sideways. No per-blade vertical impulse is imposed.
  let verticalSpeed=dot(velocity,vertical);
  let horizontalVelocity=velocity-vertical*verticalSpeed;
  let horizontalWind=ambientWind-vertical*dot(ambientWind,vertical);
  // Sideways wind relaxation must not erase rising smoke's momentum. Its
  // cooler, detached cap coasts upward while the rim still rolls sideways.
  let drifting=mix(horizontalVelocity,horizontalWind,1.0-exp(-dt*0.65))*exp(-dt*0.24);
  velocity=drifting+vertical*verticalSpeed*exp(-dt*0.16);
  velocity=clamp(velocity,vec3f(-1.1),vec3f(1.1));
  let boundary=min(min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),min(uv.z,1.0-uv.z));
  gas=vec4f(gas.xyz*smoothstep(0.0,0.045,boundary),gas.w);
  if(max(max(gas.x,gas.y),gas.z)<0.0002){gas=vec4f(0.0);}
  gas=clamp(gas,vec4f(0.0),vec4f(2.5,2.0,1.6,12.0));
  textureStore(nextGas,vec3i(cell),gas);
  textureStore(nextVelocity,vec3i(cell),vec4f(velocity,0.0));
}
`;

export const PRESSURE_SIZE = 20;
const pressureCommon = volumeCommon + /* wgsl */ `
const PRESSURE_GRID: u32 = ${PRESSURE_SIZE}u;
fn pressureSpacing() -> vec3f { return volumeExtent(u)/f32(PRESSURE_GRID); }
`;

export const divergenceWGSL = pressureCommon + /* wgsl */ `
@group(0) @binding(1) var predictedVelocity: texture_3d<f32>;
@group(0) @binding(2) var divergenceOutput: texture_storage_3d<r32float,write>;
@group(0) @binding(3) var pressureSampler: sampler;
// Integrate each coarse face instead of taking one point at the coarse
// centre. Narrow hot updrafts must contribute to the surrounding air pressure.
fn faceFlux(center: vec3f, axis: vec3f, tangentA: vec3f, tangentB: vec3f, side: f32) -> f32 {
  let texel=1.0/f32(PRESSURE_GRID);
  let face=center+axis*(side*0.5*texel);
  var flux=0.0;
  for(var a=0u;a<2u;a++){
    for(var b=0u;b<2u;b++){
      let offset=tangentA*((f32(a)-0.5)*0.5*texel)+tangentB*((f32(b)-0.5)*0.5*texel);
      flux+=dot(textureSampleLevel(predictedVelocity,pressureSampler,face+offset,0.0).xyz,axis);
    }
  }
  return flux*0.25;
}
@compute @workgroup_size(4,4,4)
fn divergence(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(PRESSURE_GRID))){return;}
  let center=(vec3f(cell)+vec3f(0.5))/f32(PRESSURE_GRID);
  let spacing=pressureSpacing();
  let x=vec3f(1.0,0.0,0.0);
  let y=vec3f(0.0,1.0,0.0);
  let z=vec3f(0.0,0.0,1.0);
  let dx=(faceFlux(center,x,y,z,1.0)-faceFlux(center,x,y,z,-1.0))/spacing.x;
  let dy=(faceFlux(center,y,x,z,1.0)-faceFlux(center,y,x,z,-1.0))/spacing.y;
  let dz=(faceFlux(center,z,x,y,1.0)-faceFlux(center,z,x,y,-1.0))/spacing.z;
  textureStore(divergenceOutput,vec3i(cell),vec4f(dx+dy+dz,0.0,0.0,0.0));
}
`;

export const pressureWGSL = pressureCommon + /* wgsl */ `
@group(0) @binding(1) var divergenceField: texture_3d<f32>;
@group(0) @binding(2) var previousPressure: texture_3d<f32>;
@group(0) @binding(3) var nextPressure: texture_storage_3d<r32float,write>;
fn pressureAt(cell: vec3i) -> f32 {
  // Open boundaries: pressure vanishes outside the simulated air box.
  if(any(cell<vec3i(0))||any(cell>=vec3i(i32(PRESSURE_GRID)))){return 0.0;}
  return textureLoad(previousPressure,cell,0).x;
}
@compute @workgroup_size(4,4,4)
fn clearPressure(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(PRESSURE_GRID))){return;}
  textureStore(nextPressure,vec3i(cell),vec4f(0.0));
}
@compute @workgroup_size(4,4,4)
fn pressureJacobi(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(PRESSURE_GRID))){return;}
  let position=vec3i(cell);
  let spacing=pressureSpacing();
  let weights=vec3f(1.0)/(spacing*spacing);
  let neighbours=weights.x*(pressureAt(position+vec3i(1,0,0))+pressureAt(position-vec3i(1,0,0)))
    +weights.y*(pressureAt(position+vec3i(0,1,0))+pressureAt(position-vec3i(0,1,0)))
    +weights.z*(pressureAt(position+vec3i(0,0,1))+pressureAt(position-vec3i(0,0,1)));
  let rhs=textureLoad(divergenceField,position,0).x;
  let pressure=(neighbours-rhs)/(2.0*(weights.x+weights.y+weights.z));
  textureStore(nextPressure,position,vec4f(pressure,0.0,0.0,0.0));
}
`;

export const gradientWGSL = pressureCommon + /* wgsl */ `
@group(0) @binding(1) var solvedPressure: texture_3d<f32>;
@group(0) @binding(2) var gradientOutput: texture_storage_3d<rgba16float,write>;
fn solvedAt(cell: vec3i) -> f32 {
  if(any(cell<vec3i(0))||any(cell>=vec3i(i32(PRESSURE_GRID)))){return 0.0;}
  return textureLoad(solvedPressure,cell,0).x;
}
@compute @workgroup_size(4,4,4)
fn pressureGradient(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(PRESSURE_GRID))){return;}
  let p=vec3i(cell);
  let difference=vec3f(
    solvedAt(p+vec3i(1,0,0))-solvedAt(p-vec3i(1,0,0)),
    solvedAt(p+vec3i(0,1,0))-solvedAt(p-vec3i(0,1,0)),
    solvedAt(p+vec3i(0,0,1))-solvedAt(p-vec3i(0,0,1)));
  // r32float pressure stays full precision. Only its smooth vector gradient
  // is filtered while reconstructing air velocity on the fine simulation grid.
  textureStore(gradientOutput,p,vec4f(difference/(2.0*pressureSpacing()),0.0));
}
`;

export const projectWGSL = pressureCommon + /* wgsl */ `
@group(0) @binding(1) var predictedVelocity: texture_3d<f32>;
@group(0) @binding(2) var pressureGradientField: texture_3d<f32>;
@group(0) @binding(3) var projectedVelocity: texture_storage_3d<rgba16float,write>;
@group(0) @binding(4) var projectionSampler: sampler;
@compute @workgroup_size(4,4,4)
fn projectVelocity(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(GRID))){return;}
  let predicted=textureLoad(predictedVelocity,vec3i(cell),0);
  if(gasSettings.clear>0.5||gasSettings.step<=0.0){
    textureStore(projectedVelocity,vec3i(cell),predicted);
    return;
  }
  let uv=(vec3f(cell)+vec3f(0.5))/f32(GRID);
  let gradient=textureSampleLevel(pressureGradientField,projectionSampler,uv,0.0).xyz;
  // Pressure has velocity-times-distance units: its gradient is a velocity
  // correction, so multiplying this projection by dt would be incorrect.
  textureStore(projectedVelocity,vec3i(cell),vec4f(predicted.xyz-gradient,0.0));
}
`;
