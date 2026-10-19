import { sharedWGSL } from './shaders.js?v=fire-v27a';
import { fireFieldWGSL } from './fire-simulation.js?v=fire-v27a';

const BLADES_PER_ROOT = 5;
const WORKGROUP_SIZE = 128;
const SUMMARY_SCALE = 4095;

// The threshold uses the same progress coordinate as botanicalBurnPhase.
// Positive offsets keep fragmentation behind the carbonisation front: living
// midribs cannot disappear merely because their tips have caught fire. This
// spatial pattern never changes with time, so a crack opens rather than swims.
// No bindings are declared here; shadows, scene depth and radiance share it.
export const leafAshWGSL = /* wgsl */ `
fn leafAshThreshold(tValue: f32, wValue: f32, seed: f32, part: f32) -> f32 {
  let t=clamp(tValue,0.0,1.0);
  let w=clamp(wValue,-1.0,1.0);
  let thinSurface=part<0.5 || (part>1.5 && part<2.5) || part>3.5;
  let marginAdvance=select(0.0,0.095*pow(abs(w),4.0),thinSurface);
  let axialDelay=select(0.96,0.86,part>1.5 && part<2.5);
  let charThreshold=((1.0-t)*axialDelay+0.10-marginAdvance)/1.36;
  // Crosswise cracks break elongated strips into flakes, while the central
  // fibre survives slightly longer. Broad, stable lobes avoid noisy stipple.
  let split=0.5+0.5*sin(t*38.0+seed*31.7+sin(w*3.4+seed*23.1)*1.85);
  let scallop=0.5+0.5*sin(t*17.6-w*6.1+seed*77.3);
  let midrib=select(0.0,exp(-abs(w)*9.0)*0.025,thinSurface);
  return clamp(charThreshold+0.045+split*0.043+scallop*0.020+midrib,0.015,0.97);
}
fn leafAshSigned(erosion: f32, t: f32, w: f32, seed: f32, part: f32) -> f32 {
  if ((part>5.5 && part<8.5) || part>8.5) { return 1.0; }
  if (erosion<=0.00001) { return 1.0; }
  if (erosion>=0.99) { return -1.0; }
  return leafAshThreshold(t,w,seed,part)-clamp(erosion,0.0,1.0);
}
fn leafAshCoverage(erosion: f32, t: f32, w: f32, seed: f32, part: f32) -> f32 {
  return smoothstep(-0.009,0.009,leafAshSigned(erosion,t,w,seed,part));
}
`;

const simulationWGSL = sharedWGSL + fireFieldWGSL + leafAshWGSL + /* wgsl */ `
struct AshSettings {
  dt: f32,
  count: u32,
  regrowing: u32,
  reserved: u32,
};
struct AshSummary {
  eroded: atomic<u32>,
  affected: atomic<u32>,
  erosion: atomic<u32>,
  remaining: atomic<u32>,
};
@group(0) @binding(1) var<storage,read> plants: array<Particle>;
@group(0) @binding(2) var<storage,read> fireField: array<vec4f>;
@group(0) @binding(3) var<storage,read> growthField: array<vec4f>;
// Per blade: erosion front, age since char first appeared, released mass in
// this step, and the last chemical burn progress. Geometry reads the stable
// first component; detached ash only consumes the positive frame-local delta.
@group(0) @binding(4) var<storage,read_write> leafState: array<vec4f>;
@group(0) @binding(5) var<uniform> ash: AshSettings;
@group(0) @binding(6) var<storage,read_write> summary: AshSummary;
var<workgroup> partialSummary: array<vec4u,${WORKGROUP_SIZE}>;

fn ashBladeProgress(root: u32, blade: u32, damaged: f32) -> f32 {
  let resilience=mix(-0.10,0.12,random(root*91u+577u));
  let delay=mix(-0.075,0.075,random(root*53u+blade*17u+709u));
  return clamp(damaged+(resilience+delay)*4.0*damaged*(1.0-damaged),0.0,1.0);
}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn advance(@builtin(global_invocation_id) invocation: vec3u) {
  let index=invocation.x;
  if (index>=ash.count*${BLADES_PER_ROOT}u || ash.dt<=0.0) { return; }
  let root=index/${BLADES_PER_ROOT}u;
  let blade=index%${BLADES_PER_ROOT}u;
  let cell=fireCell(rideDirection(root));
  let combustion=fireField[cell];
  let growth=growthField[cell];
  let progress=ashBladeProgress(root,blade,clamp(combustion.z,0.0,1.0));
  var state=leafState[index];
  if (ash.regrowing>0u) {
    // The missing old leaf stays missing during the initial collapse. Holes
    // close only as a fresh, short shoot grows through them; no old black
    // silhouette is restored on the first frame of the regrowth sequence.
    let newMaterial=1.0-smoothstep(0.035,0.56,growth.y);
    state.x=min(state.x,newMaterial);
    state.z=0.0;
    state.w=progress*(1.0-growth.y);
    if (growth.y>0.995 || combustion.z<0.00001) { state=vec4f(0.0); }
    leafState[index]=state;
    return;
  }
  if (combustion.z<0.00001) {
    // Completed regrowth clears the field and its local progress together.
    leafState[index]=vec4f(0.0);
    return;
  }
  if (plants[root].position.w<0.0000001) {
    state.z=0.0;
    leafState[index]=state;
    return;
  }
  let brittle=random(root*143u+blade*139u+971u);
  let delay=mix(1.25,3.40,random(root*149u+blade*97u+1871u));
  let charPresent=progress>0.09;
  state.y+=select(0.0,ash.dt,charPresent);
  let ageGate=smoothstep(delay,delay+0.70,state.y);
  let almostSpent=smoothstep(0.965,0.9995,progress);
  let available=mix(max(0.0,progress-0.045),1.0,almostSpent);
  // Hot, dry fibres fracture first. Carbon already made brittle keeps slowly
  // powdering when the flame has passed, rather than leaving a permanent
  // black hedge. The available mass remains capped by genuine fuel damage.
  let warmth=smoothstep(0.12,0.78,combustion.x);
  let ageFatigue=smoothstep(4.0,16.0,state.y);
  let rate=(0.045+warmth*0.035+brittle*0.028+ageFatigue*0.022)*ageGate;
  let previous=state.x;
  state.x=min(1.0,previous+min(max(0.0,available-previous),ash.dt*rate));
  state.z=max(0.0,state.x-previous);
  state.w=progress;
  leafState[index]=state;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn summarize(@builtin(global_invocation_id) invocation: vec3u,
             @builtin(local_invocation_index) local: u32) {
  let index=invocation.x;
  var values=vec4u(0u);
  if (index<ash.count*${BLADES_PER_ROOT}u) {
    let state=leafState[index];
    // Analytic axial coverage is sufficient for diagnostics; the material
    // itself uses the full shared crack pattern and derivatives per pixel.
    let lost=clamp((state.x-0.09)*1.36/0.96,0.0,1.0);
    values=vec4u(select(0u,1u,state.x>0.975),select(0u,1u,state.y>0.0),
      u32(clamp(state.x,0.0,1.0)*${SUMMARY_SCALE}.0),u32((1.0-lost)*${SUMMARY_SCALE}.0));
  }
  partialSummary[local]=values;
  workgroupBarrier();
  for (var stride=${WORKGROUP_SIZE/2}u;stride>0u;stride/=2u) {
    if (local<stride) { partialSummary[local]+=partialSummary[local+stride]; }
    workgroupBarrier();
  }
  if (local==0u) {
    atomicAdd(&summary.eroded,partialSummary[0].x);
    atomicAdd(&summary.affected,partialSummary[0].y);
    atomicAdd(&summary.erosion,partialSummary[0].z);
    atomicAdd(&summary.remaining,partialSummary[0].w);
  }
}
`;

/**
 * Per-blade carbonised material, separate from temperature and living fuel.
 * Encode after fireSimulation and before botanical mesh generation. Paused
 * frames leave this buffer untouched; reset clears it and regrowth consumes
 * the previous holes only as fresh material appears.
 */
export async function createLeafAsh(device, {
  uniforms, plants, fireState, growthBuffer, maxParticles = 48000,
} = {}) {
  const capacity=Math.max(1,Math.floor(maxParticles))*BLADES_PER_ROOT;
  const stateBuffer=device.createBuffer({
    label:'Leaf ash · persistent per-blade erosion/age/released/progress',
    size:capacity*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,
  });
  const settings=device.createBuffer({label:'Leaf ash · real-time controls',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const summary=device.createBuffer({label:'Leaf ash · reduced diagnostics',size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const owned=[stateBuffer,settings,summary];
  let destroyed=false,first=true,remaining=0,lastCount=0,statsPending=false,statsReadback=null;
  const controlBytes=new ArrayBuffer(16);
  const controlsF=new Float32Array(controlBytes);
  const controlsU=new Uint32Array(controlBytes);
  try {
    const layout=device.createBindGroupLayout({label:'Leaf ash · state layout',entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:256}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',minBindingSize:16}},
      {binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage',minBindingSize:16}},
    ]});
    const group=device.createBindGroup({label:'Leaf ash · state bindings',layout,entries:[
      {binding:0,resource:{buffer:uniforms}},
      {binding:1,resource:{buffer:plants}},
      {binding:2,resource:{buffer:fireState}},
      {binding:3,resource:{buffer:growthBuffer}},
      {binding:4,resource:{buffer:stateBuffer}},
      {binding:5,resource:{buffer:settings}},
      {binding:6,resource:{buffer:summary}},
    ]});
    const module=device.createShaderModule({label:'Leaf ash · carbon fatigue and stable fragmentation',code:simulationWGSL});
    const compilation=await module.getCompilationInfo();
    const errors=compilation.messages.filter(message=>message.type==='error');
    if (errors.length) { throw new Error(`Leaf ash: ${errors.map(message=>message.message).join('; ')}`); }
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
    const [advancePipeline,summaryPipeline]=await Promise.all(['advance','summarize'].map(entryPoint=>
      device.createComputePipelineAsync({label:`Leaf ash · ${entryPoint}`,layout:pipelineLayout,compute:{module,entryPoint}})));
    return {
      stateBuffer,
      get active() { return remaining>0; },
      encode(encoder,{dt=0,count=0,clear=false,regrowing=false,active=false}={}) {
        if (destroyed) { return; }
        const step=Number.isFinite(dt)?Math.min(1/15,Math.max(0,dt)):0;
        lastCount=Math.min(Math.floor(capacity/BLADES_PER_ROOT),Math.max(0,Math.floor(count)));
        const reset=first||clear;
        if (reset) {
          encoder.clearBuffer(stateBuffer);
          encoder.clearBuffer(summary);
          first=false;
          remaining=0;
        }
        remaining=active&&!regrowing?45:Math.max(0,remaining-step);
        controlsF[0]=reset?0:step;
        controlsU[1]=lastCount;
        controlsU[2]=regrowing?1:0;
        device.queue.writeBuffer(settings,0,controlBytes);
        if (reset||step<=0||lastCount<=0||(!remaining&&!regrowing)) { return; }
        const pass=encoder.beginComputePass({label:'Leaf ash · progressively fracture carbonised blades'});
        pass.setPipeline(advancePipeline);
        pass.setBindGroup(0,group);
        pass.dispatchWorkgroups(Math.ceil(lastCount*BLADES_PER_ROOT/WORKGROUP_SIZE));
        pass.end();
      },
      async readStats() {
        if (destroyed||statsPending) { return null; }
        statsPending=true;
        let buffer;
        const count=lastCount*BLADES_PER_ROOT;
        try {
          buffer=statsReadback ||= device.createBuffer({label:'Leaf ash · 16-byte asynchronous diagnostics',size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
          const encoder=device.createCommandEncoder({label:'Leaf ash · reduce live material diagnostics'});
          encoder.clearBuffer(summary);
          if (count>0) {
            const pass=encoder.beginComputePass({label:'Leaf ash · reduce per-blade erosion'});
            pass.setPipeline(summaryPipeline);
            pass.setBindGroup(0,group);
            pass.dispatchWorkgroups(Math.ceil(count/WORKGROUP_SIZE));
            pass.end();
          }
          encoder.copyBufferToBuffer(summary,0,buffer,0,16);
          device.queue.submit([encoder.finish()]);
          await buffer.mapAsync(GPUMapMode.READ,0,16);
          if (destroyed) { return null; }
          const values=new Uint32Array(buffer.getMappedRange(0,16));
          return {
            blades:count,erodedBlades:values[0],affectedBlades:values[1],
            erosionAverage:values[2]/Math.max(1,count*SUMMARY_SCALE),
            remainingLeafFraction:values[3]/Math.max(1,count*SUMMARY_SCALE),
          };
        } catch { return null; }
        finally { if (buffer?.mapState==='mapped') { buffer.unmap(); } statsPending=false; }
      },
      destroy() {
        if (destroyed) { return; }
        destroyed=true;
        remaining=0;
        statsReadback?.destroy();
        statsReadback=null;
        for (const buffer of owned) { buffer.destroy(); }
      },
    };
  } catch (error) {
    for (const buffer of owned) { buffer.destroy(); }
    throw error;
  }
}
