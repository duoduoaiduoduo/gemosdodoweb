import { sharedWGSL } from './shaders.js?v=fire-v29d';

export const FIRE_WIDTH = 64;
export const FIRE_HEIGHT = 32;
export const FIRE_CELL_COUNT = FIRE_WIDTH * FIRE_HEIGHT;

// Shared by the field, plant geometry and flame rendering. This deliberately
// declares no bindings: each renderer owns its fireField storage binding.
export const fireFieldWGSL = /* wgsl */ `
const FIRE_WIDTH: u32 = 64u;
const FIRE_HEIGHT: u32 = 32u;
const FIRE_CELL_COUNT: u32 = 2048u;
fn fireCell(direction: vec3f) -> u32 {
  let d = normalize(direction);
  let longitude = fract(atan2(d.z,d.x)/6.28318530718+1.0);
  let latitude = acos(clamp(d.y,-1.0,1.0))/3.14159265359;
  let x = min(u32(longitude*f32(FIRE_WIDTH)),FIRE_WIDTH-1u);
  let y = min(u32(latitude*f32(FIRE_HEIGHT)),FIRE_HEIGHT-1u);
  return y*FIRE_WIDTH+x;
}
`;

const simulationWGSL = sharedWGSL + fireFieldWGSL + /* wgsl */ `
struct FireUniforms {
  igniter: vec4f, // normalized screen xy, enabled, wall-clock delta
  clock: vec4f,   // combustion seconds, reserved, reset flag, CSS hit radius
  counts: vec4u, // live plant count, field width/height, reserved
  regrowth: vec4f, // elapsed, previous elapsed, enabled, full duration
};
@group(0) @binding(1) var<uniform> fire: FireUniforms;
@group(0) @binding(2) var<storage,read> plants: array<Particle>;
@group(0) @binding(3) var<storage,read> previousField: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> nextField: array<vec4f>;
@group(0) @binding(5) var<storage,read_write> seedHeat: array<atomic<u32>>;
// Each invocation exclusively owns its auxiliary cell. Only the heat field
// uses a separate next buffer, because its neighbours are read concurrently.
@group(0) @binding(6) var<storage,read_write> physiology: array<vec4f>;
@group(0) @binding(7) var<storage,read_write> growthField: array<vec4f>;
// Positive inverse-depth float bits have the same ordering as uints. Zero
// therefore clears this nearest-root reduction without an infinity upload.
@group(0) @binding(8) var<storage,read_write> nearestRootDepth: array<atomic<u32>>;

fn fieldIndex(x: i32, y: i32) -> u32 {
  let wrappedX = (x+i32(FIRE_WIDTH))%i32(FIRE_WIDTH);
  return u32(clamp(y,0,i32(FIRE_HEIGHT)-1))*FIRE_WIDTH+u32(wrappedX);
}
fn depositHeat(index: u32, heat: f32) {
  atomicMax(&seedHeat[index],u32(clamp(heat,0.0,1.0)*65535.0));
}
fn cellDirection(index: u32) -> vec3f {
  let longitude = (f32(index%FIRE_WIDTH)+0.5)*6.28318530718/f32(FIRE_WIDTH);
  let latitude = (f32(index/FIRE_WIDTH)+0.5)*3.14159265359/f32(FIRE_HEIGHT);
  return vec3f(cos(longitude)*sin(latitude),cos(latitude),sin(longitude)*sin(latitude));
}
fn initialMoisture(index: u32) -> f32 {
  let direction = cellDirection(index);
  let broad = noise(direction*3.8+vec3f(8.2,1.7,4.6));
  let dampPocket = smoothstep(0.19,0.53,broad);
  return 0.22+0.15*(broad*0.5+0.5)+0.08*random(index*181u+71u)+dampPocket*0.38;
}

// Project the same deformed GPU roots as the plant mesh. Facing the camera
// alone is insufficient: folds can contain several overlapping front faces.
fn ignitionCandidate(index: u32) -> vec4f {
  let plant = plants[index];
  if (plant.position.w<0.0000001) { return vec4f(0.0,0.0,-1.0,0.0); }
  let root = plant.position.xyz;
  if (dot(plant.normal.xyz,cameraWorld()-root)<=0.0) { return vec4f(0.0,0.0,-1.0,0.0); }
  // Main scene uniforms reserve lens.x for history weight. Picking is the
  // centre pinhole ray, independent of the per-aperture lens/jitter uniforms.
  let view = worldToView(root);
  let cameraDistance = 3.58/max(0.65,u.settings.w);
  let depth = cameraDistance-view.z;
  if (depth<=0.0) { return vec4f(0.0,0.0,-1.0,0.0); }
  let aspect = u.viewport.x/u.viewport.y;
  let focal = mix(1.93*min(1.0,aspect),1.90,u.extra.x);
  let ndc = view.xy*vec2f(focal/aspect,focal)/depth;
  let screen = vec2f(ndc.x*0.5+0.5,0.5-ndc.y*0.5);
  let radius = fire.clock.w*max(u.camera.z,1.0);
  let distance = length((screen-fire.igniter.xy)*u.viewport.xy);
  if (distance>radius) { return vec4f(0.0,0.0,-1.0,0.0); }
  return vec4f(screen,depth,distance);
}

@compute @workgroup_size(256)
fn pickNearest(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=fire.counts.x || fire.igniter.z<0.5) { return; }
  let candidate = ignitionCandidate(index);
  if (candidate.z<=0.0) { return; }
  atomicMax(&nearestRootDepth[0],bitcast<u32>(1.0/candidate.z));
}

@compute @workgroup_size(256)
fn ignite(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=fire.counts.x || fire.igniter.z<0.5) { return; }
  let nearest = atomicLoad(&nearestRootDepth[0]);
  if (nearest==0u) { return; }
  let candidate = ignitionCandidate(index);
  if (candidate.z<=0.0) { return; }
  let frontDepth = 1.0/bitcast<f32>(nearest);
  // Keep the thickness of a small leaf canopy, not the overlapping body
  // behind it. Heat on hidden folds must arrive through later propagation.
  if (candidate.z>frontDepth+0.14) { return; }
  let cell = fireCell(rideDirection(index));
  if (previousField[cell].y<0.035) { return; }
  let radius = fire.clock.w*max(u.camera.z,1.0);
  let strength = mix(0.93,1.0,1.0-smoothstep(radius*0.35,radius,candidate.w));
  depositHeat(cell,strength);
  // Heat beyond this touched cell comes from radiation and conduction in
  // advance(). Depositing four already-hot neighbours made a tap explode
  // immediately into an unnaturally broad patch.
}

@compute @workgroup_size(128)
fn reset(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=FIRE_CELL_COUNT) { return; }
  nextField[index] = vec4f(0.0,1.0,0.0,0.0);
  let moisture = initialMoisture(index);
  physiology[index] = vec4f(moisture,0.0,0.0,0.0);
  growthField[index] = vec4f(1.0,0.0,moisture,0.0);
  atomicStore(&seedHeat[index],0u);
}

@compute @workgroup_size(128)
fn advance(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=FIRE_CELL_COUNT) { return; }
  let x = i32(index%FIRE_WIDTH);
  let y = i32(index/FIRE_WIDTH);
  let state = previousField[index];
  let dt = fire.igniter.w;
  var biology = physiology[index]; // moisture, exposure, flaming fraction, stored ignition energy
  if (fire.regrowth.z>0.5) {
    let elapsed = fire.regrowth.x;
    let oldElapsed = fire.regrowth.y;
    // Capture the actual amount of damaged vegetation only once. Clicking
    // regrow never clears the field or changes plant length in one frame.
    if (oldElapsed<=0.0) { biology.w=state.z; }
    let damage = smoothstep(0.015,0.56,biology.w);
    let delay = 2.1+1.7*random(index*67u+491u);
    let finish = 10.7+2.1*random(index*227u+1021u);
    let previousGrowth = smoothstep(delay,finish,oldElapsed);
    let newGrowth = smoothstep(delay,finish,elapsed);
    let survivingChar = clamp((1.0-newGrowth)/max(0.00001,1.0-previousGrowth),0.0,1.0);
    let charred = state.z*survivingChar;
    let fuel = 1.0-(1.0-state.y)*survivingChar;
    let heat = state.x*exp(-dt*(2.2+elapsed*0.3));
    let smoke = state.w*exp(-dt*(0.65+elapsed*0.18));
    let oldLeafCollapse = mix(1.0,0.055,smoothstep(0.05,1.8,elapsed));
    let freshShoot = mix(0.055,1.0,newGrowth*newGrowth*(3.0-2.0*newGrowth));
    let localLength = mix(oldLeafCollapse,freshShoot,smoothstep(1.8,delay,elapsed));
    let growth = mix(1.0,localLength,damage);
    biology.x=mix(biology.x,initialMoisture(index),1.0-exp(-dt*0.85));
    biology.y*=exp(-dt*1.7);
    biology.z*=exp(-dt*3.5);
    physiology[index]=biology;
    growthField[index]=vec4f(growth,newGrowth,biology.x,biology.y);
    nextField[index]=vec4f(heat,fuel,charred,smoke);
    if (elapsed>=fire.regrowth.w) {
      physiology[index]=vec4f(initialMoisture(index),0.0,0.0,0.0);
      growthField[index]=vec4f(1.0,0.0,initialMoisture(index),0.0);
      nextField[index]=vec4f(0.0,1.0,0.0,0.0);
    }
    return;
  }
  let theta = (f32(y)+0.5)*3.14159265359/f32(FIRE_HEIGHT);
  let latitudeStep = 3.14159265359/f32(FIRE_HEIGHT);
  let latitudeSine = max(sin(theta),0.0001);
  // Finite-volume spherical diffusion. Longitude shrinks toward the poles;
  // zero-area polar boundaries carry no heat across an artificial seam.
  let longitudeWeight = min(2.4,1.0/max(0.08,latitudeSine*latitudeSine));
  let northWeight = max(0.0,sin(theta-latitudeStep*0.5))/latitudeSine;
  let southWeight = max(0.0,sin(theta+latitudeStep*0.5))/latitudeSine;
  let west = previousField[fieldIndex(x-1,y)].x;
  let east = previousField[fieldIndex(x+1,y)].x;
  let north = previousField[fieldIndex(x,y-1)].x;
  let south = previousField[fieldIndex(x,y+1)].x;
  let northwest = previousField[fieldIndex(x-1,y-1)].x;
  let northeast = previousField[fieldIndex(x+1,y-1)].x;
  let southwest = previousField[fieldIndex(x-1,y+1)].x;
  let southeast = previousField[fieldIndex(x+1,y+1)].x;
  let totalWeight = longitudeWeight*2.0+northWeight+southWeight;
  let neighbourHeat = (longitudeWeight*(west+east)+northWeight*north+southWeight*south)/totalWeight;
  // A bounded diffusion rate avoids explosive pole propagation. Nearby hot
  // leaves also radiate into cooler fuel, with diagonal attenuation and a
  // gently biased wind rather than an expanding mathematical circle.
  let strongest = max(max(max(west*0.97,east*1.035),max(north*1.055,south*0.94)),
    max(max(northwest,northeast),max(southwest,southeast))*0.73);
  let dryness = mix(0.82,1.17,random(index*193u+3187u));
  let diffused = mix(state.x,neighbourHeat,1.0-exp(-dt*0.74));
  let seed = f32(atomicLoad(&seedHeat[index]))/65535.0;
  let storedIgnition = max(biology.w*exp(-dt*2.0),seed);
  let radiated = diffused+dt*0.40*smoothstep(0.36,0.85,strongest)*dryness;
  let temperature = max(mix(radiated,1.0,1.0-exp(-dt*seed*9.0)),storedIgnition*0.81);
  // Water must evaporate and exposure must accumulate before unburned fuel
  // can ignite. Wet pockets and uneven drying leave small surviving islands.
  let moisture = max(0.0,biology.x-dt*(0.27+0.26*seed)*smoothstep(0.11,0.50,temperature));
  let exposure = clamp(biology.y+dt*(smoothstep(0.14,0.49,temperature)*(1.0-smoothstep(0.06,0.34,moisture))
    -(1.0-smoothstep(0.12,0.30,temperature))*0.16),0.0,2.0);
  let ignition = smoothstep(0.20,0.43,temperature)*smoothstep(0.16,0.51,exposure)
    *(1.0-smoothstep(0.04,0.20,moisture));
  let burning = max(biology.z*exp(-dt*(0.16+1.5*smoothstep(0.06,0.30,moisture))),ignition)
    *smoothstep(0.006,0.11,state.y);
  let consumed = min(state.y,dt*0.065*dryness*burning*smoothstep(0.005,0.12,state.y));
  let fuel = max(0.0,state.y-consumed);
  // Heat comes from real consumption; spent material cools into char. The
  // consumption time is deliberately longer than the flame flicker time.
  var heat = clamp((temperature+consumed*15.0)*exp(-dt*(0.62+0.25*(1.0-fuel))),0.0,1.0);
  if (heat<0.00008 && seed<=0.0) { heat=0.0; }
  let charred = clamp(max(state.z,1.0-fuel),0.0,1.0);
  let smokeProduced = consumed*4.0+dt*burning*smoothstep(0.05,0.36,moisture)*0.12;
  var smoke = clamp(state.w*exp(-dt*0.80)+smokeProduced,0.0,1.0);
  if (smoke<0.00008 && heat<=0.0) { smoke=0.0; }
  physiology[index]=vec4f(moisture,exposure,burning,storedIgnition);
  growthField[index]=vec4f(1.0,0.0,moisture,exposure);
  nextField[index] = vec4f(heat,fuel,charred,smoke);
}
`;

/**
 * A persistent 64 × 32 spherical fuel field; vec4 = heat/fuel/char/smoke.
 * `plants` is the renderer's GPU viewParticles buffer after projection.
 * `igniter` x/y use canvas UV coordinates (top-left origin), default radius
 * 22 CSS pixels. Pass a real unscaled frame delta; pass zero while paused.
 */
export async function createFireSimulation(device, { uniforms, plants, maxParticles = 48000 }) {
  const stateBytes = FIRE_CELL_COUNT * 16;
  const fieldUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const stateBuffer = device.createBuffer({ label:'Fire · persistent heat/fuel/char/smoke',size:stateBytes,usage:fieldUsage });
  const scratch = device.createBuffer({ label:'Fire · next state',size:stateBytes,usage:fieldUsage });
  const physiologyBuffer = device.createBuffer({ label:'Fire · persistent moisture/exposure/combustion/ember',size:stateBytes,usage:fieldUsage });
  // Public vec4 per cell: shoot length, local regrowth progress, moisture,
  // accumulated heat exposure. A stable buffer can be bound by plant meshes.
  const growthBuffer = device.createBuffer({ label:'Fire · growth/moisture/exposure',size:stateBytes,usage:fieldUsage });
  const seeds = device.createBuffer({ label:'Fire · projected ignition seeds',size:FIRE_CELL_COUNT*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST });
  const nearestDepth = device.createBuffer({ label:'Fire · nearest visible ignition root',size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST });
  const fireUniform = device.createBuffer({ label:'Fire · simulation controls',size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const ownBuffers = [stateBuffer,scratch,physiologyBuffer,growthBuffer,seeds,nearestDepth,fireUniform];
  let destroyed = false;
  let pendingReset = true;
  let remaining = 0;
  let combustionTime = 0;
  const regrowthDuration = 12.8;
  let regrowing = false;
  let regrowthTime = 0;
  let statsReadback = null;
  let statsPending = false;
  const controls = new ArrayBuffer(64);
  const floats = new Float32Array(controls);
  const integers = new Uint32Array(controls);

  try {
    const initial = new Float32Array(FIRE_CELL_COUNT*4);
    for (let i=0;i<FIRE_CELL_COUNT;i++) initial[i*4+1]=1;
    device.queue.writeBuffer(stateBuffer,0,initial);
    device.queue.writeBuffer(scratch,0,initial);
    const initialGrowth = new Float32Array(FIRE_CELL_COUNT*4);
    for (let i=0;i<FIRE_CELL_COUNT;i++) initialGrowth[i*4]=1;
    device.queue.writeBuffer(growthBuffer,0,initialGrowth);
    const layout = device.createBindGroupLayout({label:'Fire · field layout',entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:256}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:64}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage',minBindingSize:64}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage',minBindingSize:stateBytes}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:stateBytes}},
      {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:FIRE_CELL_COUNT*4}},
      {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:stateBytes}},
      {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:stateBytes}},
      {binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:4}},
    ]});
    const group = device.createBindGroup({label:'Fire · field bindings',layout,entries:[
      {binding:0,resource:{buffer:uniforms}}, {binding:1,resource:{buffer:fireUniform}},
      {binding:2,resource:{buffer:plants}}, {binding:3,resource:{buffer:stateBuffer}},
      {binding:4,resource:{buffer:scratch}}, {binding:5,resource:{buffer:seeds}},
      {binding:6,resource:{buffer:physiologyBuffer}}, {binding:7,resource:{buffer:growthBuffer}},
      {binding:8,resource:{buffer:nearestDepth}},
    ]});
    const module = device.createShaderModule({label:'Fire · surface combustion',code:simulationWGSL});
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter(message=>message.type==='error');
    if (errors.length) throw new Error(`Fire simulation: ${errors.map(message=>message.message).join('; ')}`);
    const pipelineLayout = device.createPipelineLayout({bindGroupLayouts:[layout]});
    const [pickPipeline,ignitePipeline,advancePipeline,resetPipeline] = await Promise.all(['pickNearest','ignite','advance','reset'].map(entryPoint=>
      device.createComputePipelineAsync({label:`Fire · ${entryPoint}`,layout:pipelineLayout,compute:{module,entryPoint}})));

    return {
      stateBuffer,
      growthBuffer,
      get active() { return remaining>0 || regrowing; },
      get regrowing() { return regrowing; },
      get growthProgress() { return regrowing ? Math.min(1,regrowthTime/regrowthDuration) : 1; },
      encode(encoder, {dt=0,time=0,igniter=null,count=maxParticles,reset=false} = {}) {
        if (destroyed) return;
        if (reset) this.clear();
        const step = Number.isFinite(dt) ? Math.min(Math.max(dt,0),1/15) : 0;
        const x = Number(igniter?.x), y = Number(igniter?.y);
        const ignition = !regrowing && Boolean(igniter?.active) && Number.isFinite(x) && Number.isFinite(y)
          && x>=0 && x<=1 && y>=0 && y<=1 && step>0;
        if (!pendingReset && (!step || (!ignition && remaining<=0 && !regrowing))) return;
        if (ignition && !pendingReset) remaining=150;
        floats.set([Number.isFinite(x)?x:0,Number.isFinite(y)?y:0,ignition?1:0,step],0);
        floats.set([combustionTime,Number.isFinite(time)?time:0,pendingReset?1:0,
          Math.min(40,Math.max(8,(Number(igniter?.radius)||36)*(22/36)))],4);
        integers.set([Math.min(maxParticles,Math.max(0,Math.floor(count))),FIRE_WIDTH,FIRE_HEIGHT,0],8);
        const nextRegrowthTime = regrowing ? Math.min(regrowthDuration,regrowthTime+step) : 0;
        floats.set([nextRegrowthTime,regrowthTime,regrowing?1:0,regrowthDuration],12);
        device.queue.writeBuffer(fireUniform,0,controls);
        // Seeds are frame-local and are never read back to JavaScript.
        encoder.clearBuffer(seeds);
        encoder.clearBuffer(nearestDepth);
        if (pendingReset) {
          const pass = encoder.beginComputePass({label:'Fire · reset surface'});
          pass.setBindGroup(0,group);
          pass.setPipeline(resetPipeline);
          pass.dispatchWorkgroups(Math.ceil(FIRE_CELL_COUNT/128));
          pass.end();
          pendingReset=false;
        } else {
          if (ignition && integers[8]>0) {
            const pickPass = encoder.beginComputePass({label:'Fire · find nearest visible root'});
            pickPass.setBindGroup(0,group);
            pickPass.setPipeline(pickPipeline);
            pickPass.dispatchWorkgroups(Math.ceil(integers[8]/256));
            pickPass.end();
            // Separate passes make the atomic nearest-depth result visible
            // to every ignition invocation, and seeds visible to advance.
            const ignitePass = encoder.beginComputePass({label:'Fire · ignite front canopy'});
            ignitePass.setBindGroup(0,group);
            ignitePass.setPipeline(ignitePipeline);
            ignitePass.dispatchWorkgroups(Math.ceil(integers[8]/256));
            ignitePass.end();
          }
          const pass = encoder.beginComputePass({label:'Fire · surface combustion'});
          pass.setBindGroup(0,group);
          pass.setPipeline(advancePipeline);
          pass.dispatchWorkgroups(Math.ceil(FIRE_CELL_COUNT/128));
          pass.end();
          combustionTime+=step;
          remaining=Math.max(0,remaining-step);
          if (regrowing) {
            regrowthTime=nextRegrowthTime;
            if (regrowthTime>=regrowthDuration) regrowing=false;
          }
        }
        // Keep a stable public buffer, so all plant/flame bind groups remain
        // valid while the private next-state buffer gives race-free diffusion.
        encoder.copyBufferToBuffer(scratch,0,stateBuffer,0,stateBytes);
      },
      clear() {
        if (destroyed) return;
        pendingReset=true;
        remaining=0;
        combustionTime=0;
        regrowing=false;
        regrowthTime=0;
      },
      regrow() {
        if (destroyed || pendingReset || regrowing) return false;
        remaining=0;
        regrowthTime=0;
        regrowing=true;
        return true;
      },
      // Optional diagnostics only. The renderer never waits for this result;
      // overlapping reads are dropped and the small staging buffer is reused.
      async readStats() {
        if (destroyed || statsPending) return null;
        statsPending=true;
        let buffer;
        try {
          buffer=statsReadback ||= device.createBuffer({
            label:'Fire · asynchronous field diagnostics',size:stateBytes*2,
            usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,
          });
          const encoder=device.createCommandEncoder({label:'Fire · read field diagnostics'});
          encoder.copyBufferToBuffer(stateBuffer,0,buffer,0,stateBytes);
          encoder.copyBufferToBuffer(growthBuffer,0,buffer,stateBytes,stateBytes);
          device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ,0,stateBytes*2);
          if (destroyed) return null;
          const values=new Float32Array(buffer.getMappedRange(0,stateBytes*2));
          let heat=0, fuel=0, burned=0, smoke=0, activeCells=0, growth=0, moisture=0, peakHeat=0, peakSmoke=0;
          for (let i=0;i<FIRE_CELL_COUNT;i++) {
            const offset=i*4;
            heat+=values[offset];
            fuel+=values[offset+1];
            burned+=values[offset+2];
            smoke+=values[offset+3];
            growth+=values[FIRE_CELL_COUNT*4+offset];
            moisture+=values[FIRE_CELL_COUNT*4+offset+2];
            peakHeat=Math.max(peakHeat,values[offset]);
            peakSmoke=Math.max(peakSmoke,values[offset+3]);
            if (values[offset]>0.12) activeCells++;
          }
          if (!regrowing && remaining<149.5) {
            if (peakHeat<0.001 && peakSmoke<0.002) remaining=0;
            else remaining=Math.max(remaining,3);
          }
          return {
            burnedFraction:burned/FIRE_CELL_COUNT,
            heatAverage:heat/FIRE_CELL_COUNT,
            activeCells,
            smokeAverage:smoke/FIRE_CELL_COUNT,
            fuelAverage:fuel/FIRE_CELL_COUNT,
            growthAverage:growth/FIRE_CELL_COUNT,
            moistureAverage:moisture/FIRE_CELL_COUNT,
            regrowing,
            growthProgress:regrowing ? Math.min(1,regrowthTime/regrowthDuration) : 1,
          };
        } catch {
          // A destroyed/lost device can reject a pending map. Diagnostics must
          // never interrupt the animation or leave an unhandled rejection.
          return null;
        } finally {
          if (buffer?.mapState==='mapped') buffer.unmap();
          statsPending=false;
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed=true;
        remaining=0;
        regrowing=false;
        // Destroy cancels an in-flight map; readStats catches that rejection.
        statsReadback?.destroy();
        statsReadback=null;
        for (const buffer of ownBuffers) buffer.destroy();
      },
    };
  } catch (error) {
    for (const buffer of ownBuffers) buffer.destroy();
    throw error;
  }
}
