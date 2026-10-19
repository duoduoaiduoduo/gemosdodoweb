import { volumeCommon, VOLUME_SIZE as SIZE } from './fire-volume-shared.js?v=fire-v29d';

// Density and its age/material coordinates travel together in their own volume.
// No smoke pass writes combustion gases or the pressure-projected air field.
const smokeWGSL = volumeCommon + /* wgsl */ `
@group(0) @binding(1) var previousSmoke: texture_3d<f32>;
@group(0) @binding(2) var currentVelocity: texture_3d<f32>;
@group(0) @binding(3) var<storage,read> sources: array<vec4u>;
@group(0) @binding(4) var nextSmoke: texture_storage_3d<rgba16float,write>;
@group(0) @binding(5) var currentGas: texture_3d<f32>;
@group(0) @binding(6) var smokeSampler: sampler;
fn smokeAt(position: vec3f) -> vec4f {
  let uv=uvFromWorld(position,previousU);
  if(!inside(uv)){return vec4f(0.0);}
  return textureSampleLevel(previousSmoke,smokeSampler,uv,0.0);
}
fn gasAt(position: vec3f) -> vec4f {
  let uv=uvFromWorld(position,u);
  if(!inside(uv)){return vec4f(0.0);}
  return textureSampleLevel(currentGas,smokeSampler,uv,0.0);
}
fn airAt(position: vec3f) -> vec3f {
  let uv=uvFromWorld(position,u);
  if(!inside(uv)){return vec3f(0.0);}
  return textureSampleLevel(currentVelocity,smokeSampler,uv,0.0).xyz;
}
// A rising toroidal vector potential turns the cap outwards and draws its
// underside back in. Each pocket has its own scale, speed and oblique shoulder.
fn pocketRoll(p: vec3f,time: f32,offset: vec2f,scale: f32) -> vec3f {
  let tileSize=0.94*scale;
  let tiled=(p.xz+offset)/tileSize;
  let tile=floor(tiled);
  let seed=0.5+0.5*hash3(vec3f(tile.x+offset.x,8.7,tile.y+offset.y));
  let tileLocal=(fract(tiled)-vec2f(0.5))*tileSize;
  let drift=vec2f(sin(time*0.43+seed*8.1),cos(time*0.37+seed*7.3))*0.036*scale;
  let radial=(tileLocal-drift)*vec2f(1.0,mix(0.91,1.13,seed));
  let radius=length(radial);
  let spacing=mix(0.64,0.79,seed)*scale;
  let rise=mix(0.30,0.39,seed);
  let height=(fract((p.y-time*rise)/spacing+seed*0.83)-0.5)*spacing;
  let ringRadius=mix(0.22,0.29,seed)*scale;
  let width=mix(0.115,0.145,seed)*scale;
  let width2=width*width;
  let shoulder=(radius-ringRadius);
  let kernel=exp(-(shoulder*shoulder+height*height)/width2);
  let potential=mix(0.32,0.40,seed)*scale;
  let radialSpeed=2.0*potential*radius*height/width2*kernel;
  let lift=potential*kernel*(2.0-2.0*radius*shoulder/width2);
  let horizontal=radial/max(radius,0.018)*radialSpeed;
  // Both sides approach still air before a tile boundary. An overlapping,
  // differently tilted family below prevents straight seams in the plume.
  let edge=min(tileSize*0.5-abs(tileLocal.x),tileSize*0.5-abs(tileLocal.y));
  let edgeFade=smoothstep(0.012*scale,0.105*scale,edge);
  return vec3f(horizontal.x,lift,horizontal.y)*edgeFade;
}
fn smokeRoll(position: vec3f,time: f32) -> vec3f {
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  let forward=normalize(cross(vec3f(1.0,0.0,0.0),up));
  let right=normalize(cross(up,forward));
  let p=vec3f(dot(position,right),dot(position,up),dot(position,forward));
  let primary=pocketRoll(p,time,vec2f(0.17,-0.23),1.0);
  let secondUp=normalize(up*0.9659+forward*0.2588);
  let secondForward=normalize(cross(right*0.81+forward*0.586,secondUp));
  let secondRight=normalize(cross(secondUp,secondForward));
  let q=vec3f(dot(position,secondRight),dot(position,secondUp),dot(position,secondForward));
  let secondary=pocketRoll(q,time+1.73,vec2f(-0.37,0.41),0.82);
  var roll=(right*primary.x+up*primary.y+forward*primary.z)*0.82
    +(secondRight*secondary.x+secondUp*secondary.y+secondForward*secondary.z)*0.34;
  roll*=1.45;
  roll*=min(1.0,1.00/max(length(roll),0.001));
  return roll;
}
fn coldFreedom(gas: vec4f) -> f32 {
  return (1.0-smoothstep(0.22,0.72,gas.x))*(1.0-smoothstep(0.012,0.045,gas.z));
}
fn preserveShoulder(position: vec3f,carried: vec4f) -> vec4f {
  let spacing=volumeExtent(previousU)/f32(GRID);
  let a=smokeAt(position+spacing*vec3f(0.85,0.85,0.85)).x;
  let b=smokeAt(position+spacing*vec3f(0.85,-0.85,-0.85)).x;
  let c=smokeAt(position+spacing*vec3f(-0.85,0.85,-0.85)).x;
  let d=smokeAt(position+spacing*vec3f(-0.85,-0.85,0.85)).x;
  let lower=min(carried.x,min(min(a,b),min(c,d)));
  let upper=max(carried.x,max(max(a,b),max(c,d)));
  let phase=fract(uvFromWorld(position,previousU)*f32(GRID)-vec3f(0.5));
  let filtering=dot(phase*(vec3f(1.0)-phase),vec3f(1.3333333));
  let corrected=clamp(carried.x+(carried.x-(a+b+c+d)*0.25)*0.55*filtering,max(0.0,lower),upper);
  return carried*(corrected/max(carried.x,0.000001));
}
@compute @workgroup_size(4,4,4)
fn advanceSmoke(@builtin(global_invocation_id) cell: vec3u) {
  if(any(cell>=vec3u(GRID))){return;}
  if(gasSettings.clear>0.5){textureStore(nextSmoke,vec3i(cell),vec4f(0.0));return;}
  let uv=(vec3f(cell)+vec3f(0.5))/f32(GRID);
  let world=worldFromUV(uv,u);
  let dt=gasSettings.step;
  if(dt<=0.0){
    let frameOffset=u.riderContact.xyz*u.rideOrigin.w-previousU.riderContact.xyz*previousU.rideOrigin.w;
    let sameFrame=abs(u.rideOrigin.w-previousU.rideOrigin.w)<0.000001&&all(abs(frameOffset)<vec3f(0.000001));
    if(sameFrame){textureStore(nextSmoke,vec3i(cell),textureLoad(previousSmoke,vec3i(cell),0));}
    else{textureStore(nextSmoke,vec3i(cell),smokeAt(world));}
    return;
  }
  let gas=gasAt(world);
  let time=gasSettings.frame;
  let firstAir=airAt(world);
  let freedom=coldFreedom(gas);
  let firstRoll=smokeRoll(world,time)*freedom;
  let middle=world-(firstAir*mix(1.0,0.52,freedom)+firstRoll)*dt*0.5;
  let middleGas=gasAt(middle);
  let middleFreedom=coldFreedom(middleGas);
  let transport=airAt(middle)*mix(1.0,0.52,middleFreedom)+smokeRoll(middle,time-dt*0.5)*middleFreedom;
  let departure=world-transport*dt;
  var smoke=smokeAt(departure);
  if(smoke.x>0.003){smoke=preserveShoulder(departure,smoke);}
  // Age and birth position are premultiplied by density, so entraining empty
  // air thins a pocket without making its remaining material young again.
  let age=clamp(smoke.y/max(smoke.x,0.000001),0.0,12.0);
  smoke.y+=smoke.x*dt;
  let thin=1.0-smoothstep(0.012,0.105,smoke.x);
  let old=smoothstep(1.8,7.0,age);
  let dilution=0.10+thin*0.18+old*0.12+smoothstep(6.0,10.0,age)*0.25;
  smoke*=exp(-dt*dilution);
  if(gasSettings.injecting>0.5){
    let soot=f32(sources[cellIndex(cell)].y)/4096.0;
    if(soot>0.0001){
      let pocket=floor(world*vec3f(1.6,1.1,1.6));
      let seed=0.5+0.5*hash3(pocket+vec3f(11.7,3.9,7.1));
      let period=1.80;
      let cycle=time/period+seed*0.14;
      let birth=fract(cycle);
      let pulse=0.025+1.45*smoothstep(0.04,0.16,birth)*(1.0-smoothstep(0.38,0.64,birth));
      let replenishment=max(0.0,soot*pulse*0.85-smoke.x)*(1.0-exp(-dt*12.0));
      smoke+=vec4f(replenishment,0.0,world.x*replenishment,world.z*replenishment);
    }
  }
  let boundary=min(min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),min(uv.z,1.0-uv.z));
  smoke*=smoothstep(0.0,0.045,boundary);
  if(smoke.x<0.00008){textureStore(nextSmoke,vec3i(cell),vec4f(0.0));return;}
  smoke*=min(1.0,1.5/smoke.x);
  smoke.y=clamp(smoke.y,0.0,smoke.x*12.0);
  smoke=vec4f(smoke.xy,clamp(smoke.zw,vec2f(-2048.0)*smoke.x,vec2f(2048.0)*smoke.x));
  textureStore(nextSmoke,vec3i(cell),smoke);
}
`;

export async function createSmokePlume(device, { uniforms, settingsBuffer, previousUniforms, sourceBuffer, gases, velocities }) {
  const makeVolume = label => device.createTexture({ label, size: [SIZE, SIZE, SIZE], dimension: '3d', format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
  const textures = [makeVolume('Independent rolling smoke A'), makeVolume('Independent rolling smoke B')];
  const visibility = GPUShaderStage.COMPUTE;
  const uniform = binding => ({ binding, visibility, buffer: { type: 'uniform' } });
  const sampled = binding => ({ binding, visibility, texture: { viewDimension: '3d' } });
  const layout = device.createBindGroupLayout({ label: 'Independent smoke transport layout', entries: [
    uniform(0), sampled(1), sampled(2), { binding: 3, visibility, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
    sampled(5), { binding: 6, visibility, sampler: { type: 'filtering' } }, uniform(7), uniform(8),
  ] });
  const sampler = device.createSampler({ label: 'Smoke density and material interpolation', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge' });
  const module = device.createShaderModule({ label: 'Density-carrying rolling smoke', code: smokeWGSL });
  const pipeline = await device.createComputePipelineAsync({ label: 'Independent smoke lobe transport and dilution', layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: 'advanceSmoke' } });
  const groups = [0, 1].map(index => device.createBindGroup({ label: `Smoke destination ${index}`, layout, entries: [
    { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: textures[1 - index].createView() },
    { binding: 2, resource: velocities[index].createView() }, { binding: 3, resource: { buffer: sourceBuffer } },
    { binding: 4, resource: textures[index].createView() }, { binding: 5, resource: gases[index].createView() },
    { binding: 6, resource: sampler }, { binding: 7, resource: { buffer: settingsBuffer } }, { binding: 8, resource: { buffer: previousUniforms } },
  ] }));
  let destroyed = false;
  return {
    textures,
    encode(encoder, newIndex) {
      if (destroyed) return;
      const pass = encoder.beginComputePass({ label: 'Roll, separate and dissipate smoke lobes' });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, groups[newIndex]);
      pass.dispatchWorkgroups(Math.ceil(SIZE / 4), Math.ceil(SIZE / 4), Math.ceil(SIZE / 4));
      pass.end();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      textures.forEach(texture => texture.destroy());
    },
  };
}
