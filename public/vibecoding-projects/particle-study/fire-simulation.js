import { sharedWGSL } from './shaders.js?v=fire-v19';

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
  padding: vec4f,
};
@group(0) @binding(1) var<uniform> fire: FireUniforms;
@group(0) @binding(2) var<storage,read> plants: array<Particle>;
@group(0) @binding(3) var<storage,read> previousField: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> nextField: array<vec4f>;
@group(0) @binding(5) var<storage,read_write> seedHeat: array<atomic<u32>>;

fn fieldIndex(x: i32, y: i32) -> u32 {
  let wrappedX = (x+i32(FIRE_WIDTH))%i32(FIRE_WIDTH);
  return u32(clamp(y,0,i32(FIRE_HEIGHT)-1))*FIRE_WIDTH+u32(wrappedX);
}
fn depositHeat(index: u32, heat: f32) {
  atomicMax(&seedHeat[index],u32(clamp(heat,0.0,1.0)*65535.0));
}

// Picking uses the very same deformed, unfolded GPU roots as the plant mesh.
// A screen-space hemisphere shortcut would ignite empty sky or the far side.
@compute @workgroup_size(256)
fn ignite(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=fire.counts.x || fire.igniter.z<0.5) { return; }
  let plant = plants[index];
  if (plant.position.w<0.0000001) { return; }
  let root = plant.position.xyz;
  if (dot(plant.normal.xyz,cameraWorld()-root)<=0.0) { return; }
  // Main scene uniforms reserve lens.x for history weight. Picking is the
  // centre pinhole ray, independent of the per-aperture lens/jitter uniforms.
  let view = worldToView(root);
  let cameraDistance = 3.58/max(0.65,u.settings.w);
  let depth = cameraDistance-view.z;
  if (depth<=0.0) { return; }
  let aspect = u.viewport.x/u.viewport.y;
  let focal = mix(1.93*min(1.0,aspect),1.90,u.extra.x);
  let ndc = view.xy*vec2f(focal/aspect,focal)/depth;
  let screen = vec2f(ndc.x*0.5+0.5,0.5-ndc.y*0.5);
  let radius = fire.clock.w*max(u.camera.z,1.0);
  let distance = length((screen-fire.igniter.xy)*u.viewport.xy);
  if (distance>radius) { return; }
  let cell = fireCell(rideDirection(index));
  if (previousField[cell].y<0.035) { return; }
  let strength = mix(0.93,1.0,1.0-smoothstep(radius*0.35,radius,distance));
  let x = i32(cell%FIRE_WIDTH);
  let y = i32(cell/FIRE_WIDTH);
  depositHeat(cell,strength);
  // A sub-cell flame transfers heat across the four touching cell edges.
  // This also makes a short tap a real ignition rather than a one-frame flash.
  depositHeat(fieldIndex(x-1,y),strength*0.84);
  depositHeat(fieldIndex(x+1,y),strength*0.84);
  depositHeat(fieldIndex(x,y-1),strength*0.84);
  depositHeat(fieldIndex(x,y+1),strength*0.84);
}

@compute @workgroup_size(128)
fn reset(@builtin(global_invocation_id) invocation: vec3u) {
  let index = invocation.x;
  if (index>=FIRE_CELL_COUNT) { return; }
  nextField[index] = vec4f(0.0,1.0,0.0,0.0);
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
  let theta = (f32(y)+0.5)*3.14159265359/f32(FIRE_HEIGHT);
  let latitudeStep = 3.14159265359/f32(FIRE_HEIGHT);
  let latitudeSine = max(sin(theta),0.0001);
  // Finite-volume spherical diffusion. Longitude shrinks toward the poles;
  // zero-area polar boundaries carry no heat across an artificial seam.
  let longitudeWeight = min(12.0,1.0/max(0.08,latitudeSine*latitudeSine));
  let northWeight = max(0.0,sin(theta-latitudeStep*0.5))/latitudeSine;
  let southWeight = max(0.0,sin(theta+latitudeStep*0.5))/latitudeSine;
  let west = previousField[fieldIndex(x-1,y)].x;
  let east = previousField[fieldIndex(x+1,y)].x;
  let north = previousField[fieldIndex(x,y-1)].x;
  let south = previousField[fieldIndex(x,y+1)].x;
  let totalWeight = longitudeWeight*2.0+northWeight+southWeight;
  let neighbourHeat = (longitudeWeight*(west+east)+northWeight*north+southWeight*south)/totalWeight;
  // Exponential relaxation is bounded even on a slow phone or at a pole.
  let diffused = mix(state.x,neighbourHeat,1.0-exp(-dt*totalWeight*1.20));
  let seed = f32(atomicLoad(&seedHeat[index]))/65535.0;
  let temperature = max(diffused,seed*smoothstep(0.012,0.08,state.y));
  let dryness = mix(0.82,1.16,random(index*193u+3187u));
  let preheat = smoothstep(0.14,0.46,temperature);
  let fuelAvailable = smoothstep(0.01,0.20,state.y);
  let consumed = min(state.y,dt*0.16*dryness*preheat*fuelAvailable);
  let fuel = max(0.0,state.y-consumed);
  // Fuel-driven heat sustains the moving fire front; spent cells cannot
  // reignite. Char remains attached to the plant identity after cooling.
  var heat = clamp((temperature+consumed*9.0)*exp(-dt*(0.48+0.22*(1.0-fuel))),0.0,1.0);
  if (heat<0.00008 && seed<=0.0) { heat=0.0; }
  let charred = clamp(max(state.z,(1.0-fuel)*1.035),0.0,1.0);
  let smokeProduced = consumed*2.8+dt*heat*(1.0-fuel)*0.045;
  var smoke = clamp(state.w*exp(-dt*0.255)+smokeProduced,0.0,1.0);
  if (smoke<0.00008 && heat<=0.0) { smoke=0.0; }
  nextField[index] = vec4f(heat,fuel,charred,smoke);
}
`;

/**
 * A persistent 64 × 32 spherical fuel field; vec4 = heat/fuel/char/smoke.
 * `plants` is the renderer's GPU viewParticles buffer after projection.
 * `igniter` x/y use canvas UV coordinates (top-left origin), default radius
 * 36 CSS pixels. Pass a real unscaled frame delta; pass zero while paused.
 */
export async function createFireSimulation(device, { uniforms, plants, maxParticles = 48000 }) {
  const stateBytes = FIRE_CELL_COUNT * 16;
  const fieldUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const stateBuffer = device.createBuffer({ label:'Fire · persistent heat/fuel/char/smoke',size:stateBytes,usage:fieldUsage });
  const scratch = device.createBuffer({ label:'Fire · next state',size:stateBytes,usage:fieldUsage });
  const seeds = device.createBuffer({ label:'Fire · projected ignition seeds',size:FIRE_CELL_COUNT*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST });
  const fireUniform = device.createBuffer({ label:'Fire · simulation controls',size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const ownBuffers = [stateBuffer,scratch,seeds,fireUniform];
  let destroyed = false;
  let pendingReset = false;
  let remaining = 0;
  let combustionTime = 0;
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
    const layout = device.createBindGroupLayout({label:'Fire · field layout',entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:256}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:64}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage',minBindingSize:64}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage',minBindingSize:stateBytes}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:stateBytes}},
      {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:FIRE_CELL_COUNT*4}},
    ]});
    const group = device.createBindGroup({label:'Fire · field bindings',layout,entries:[
      {binding:0,resource:{buffer:uniforms}}, {binding:1,resource:{buffer:fireUniform}},
      {binding:2,resource:{buffer:plants}}, {binding:3,resource:{buffer:stateBuffer}},
      {binding:4,resource:{buffer:scratch}}, {binding:5,resource:{buffer:seeds}},
    ]});
    const module = device.createShaderModule({label:'Fire · surface combustion',code:simulationWGSL});
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter(message=>message.type==='error');
    if (errors.length) throw new Error(`Fire simulation: ${errors.map(message=>message.message).join('; ')}`);
    const pipelineLayout = device.createPipelineLayout({bindGroupLayouts:[layout]});
    const [ignitePipeline,advancePipeline,resetPipeline] = await Promise.all(['ignite','advance','reset'].map(entryPoint=>
      device.createComputePipelineAsync({label:`Fire · ${entryPoint}`,layout:pipelineLayout,compute:{module,entryPoint}})));

    return {
      stateBuffer,
      get active() { return remaining>0; },
      encode(encoder, {dt=0,time=0,igniter=null,count=maxParticles,reset=false} = {}) {
        if (destroyed) return;
        if (reset) this.clear();
        const step = Number.isFinite(dt) ? Math.min(Math.max(dt,0),1/15) : 0;
        const x = Number(igniter?.x), y = Number(igniter?.y);
        const ignition = Boolean(igniter?.active) && Number.isFinite(x) && Number.isFinite(y)
          && x>=0 && x<=1 && y>=0 && y<=1 && step>0;
        if (!pendingReset && (!step || (!ignition && remaining<=0))) return;
        if (ignition && !pendingReset) remaining=60;
        floats.set([Number.isFinite(x)?x:0,Number.isFinite(y)?y:0,ignition?1:0,step],0);
        floats.set([combustionTime,Number.isFinite(time)?time:0,pendingReset?1:0,
          Math.min(96,Math.max(8,Number(igniter?.radius)||36))],4);
        integers.set([Math.min(maxParticles,Math.max(0,Math.floor(count))),FIRE_WIDTH,FIRE_HEIGHT,0],8);
        device.queue.writeBuffer(fireUniform,0,controls);
        // Seeds are frame-local and are never read back to JavaScript.
        encoder.clearBuffer(seeds);
        const pass = encoder.beginComputePass({label:'Fire · surface combustion'});
        pass.setBindGroup(0,group);
        if (pendingReset) {
          pass.setPipeline(resetPipeline);
          pass.dispatchWorkgroups(Math.ceil(FIRE_CELL_COUNT/128));
          pendingReset=false;
        } else {
          if (ignition && integers[8]>0) {
            pass.setPipeline(ignitePipeline);
            pass.dispatchWorkgroups(Math.ceil(integers[8]/256));
          }
          pass.setPipeline(advancePipeline);
          pass.dispatchWorkgroups(Math.ceil(FIRE_CELL_COUNT/128));
          combustionTime+=step;
          remaining=Math.max(0,remaining-step);
        }
        pass.end();
        // Keep a stable public buffer, so all plant/flame bind groups remain
        // valid while the private next-state buffer gives race-free diffusion.
        encoder.copyBufferToBuffer(scratch,0,stateBuffer,0,stateBytes);
      },
      clear() {
        if (destroyed) return;
        pendingReset=true;
        remaining=0;
        combustionTime=0;
      },
      // Optional diagnostics only. The renderer never waits for this result;
      // overlapping reads are dropped and the small staging buffer is reused.
      async readStats() {
        if (destroyed || statsPending) return null;
        statsPending=true;
        let buffer;
        try {
          buffer=statsReadback ||= device.createBuffer({
            label:'Fire · asynchronous field diagnostics',size:stateBytes,
            usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,
          });
          const encoder=device.createCommandEncoder({label:'Fire · read field diagnostics'});
          encoder.copyBufferToBuffer(stateBuffer,0,buffer,0,stateBytes);
          device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ,0,stateBytes);
          if (destroyed) return null;
          const values=new Float32Array(buffer.getMappedRange(0,stateBytes));
          let heat=0, fuel=0, burned=0, smoke=0, activeCells=0;
          for (let i=0;i<FIRE_CELL_COUNT;i++) {
            const offset=i*4;
            heat+=values[offset];
            fuel+=values[offset+1];
            burned+=values[offset+2];
            smoke+=values[offset+3];
            if (values[offset]>0.12) activeCells++;
          }
          return {
            burnedFraction:burned/FIRE_CELL_COUNT,
            heatAverage:heat/FIRE_CELL_COUNT,
            activeCells,
            smokeAverage:smoke/FIRE_CELL_COUNT,
            fuelAverage:fuel/FIRE_CELL_COUNT,
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
