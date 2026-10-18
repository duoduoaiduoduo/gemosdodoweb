import { createChaosRide } from './chaos-ride.js?v=flower-ratio-v17';
import { RIDE_HEIGHT_SCALE } from './ride-space.js?v=flower-ratio-v17';
import { createSkaterModel, RIDER_VERTEX_STRIDE } from './character-model.js?v=flower-ratio-v17';
import { computeWGSL, projectionWGSL, accumulateWGSL, historyWGSL, compositeWGSL } from './shaders.js?v=fire-v19';
import { geometryWGSL, renderWGSL, shadowWGSL, riderRenderWGSL, riderShadowWGSL, FLOWER_ROOT_STRIDE, CRUST_VERTEX_COUNT, CRUST_INDICES } from './botanical-renderer.js?v=fire-v19';
import { createFireSimulation } from './fire-simulation.js?v=fire-v19';
import { createFireVisuals } from './fire-visuals.js?v=fire-v19';
import { GRASS_VERTEX_COUNT, FLOWER_VERTEX_COUNT, GRASS_INDICES, FLOWER_INDICES } from './botanical.js?v=flower-ratio-v17';
import { DEFAULT_PARAMETERS as INITIAL } from './parameters.js?v=mobile-controls-v18';

// Keep the focus slider's existing calibration in the skating camera.
const RIDE_FOCUS_REFERENCE = -0.48;
const MAX_PARTICLES = 48000;
const QUALITY_COUNTS = { high: MAX_PARTICLES, normal: 28000, low: 18000 };
const LENS_COUNTS = { high: 24, normal: 12, low: 8 };
const MAX_LENS = 24;
const STILL_SAMPLES = 512;
const APERTURE_RADIUS = 0.11;
const FLOAT_STRIDE = 64; // Dynamic uniform offsets must align to 256 bytes.
const MAX_MESH_VERTICES = MAX_PARTICLES*GRASS_VERTEX_COUNT+Math.ceil(MAX_PARTICLES/FLOWER_ROOT_STRIDE)*FLOWER_VERTEX_COUNT+CRUST_VERTEX_COUNT;

function lensSample(index) {
  const a = ((index + 0.5) * 0.7548776662466927) % 1;
  const b = ((index + 0.5) * 0.5698402909980532) % 1;
  const x = 2 * a - 1, y = 2 * b - 1;
  let radius, angle;
  if (Math.abs(x) > Math.abs(y)) { radius = x; angle = Math.PI / 4 * y / x; }
  else { radius = y; angle = Math.PI / 2 - Math.PI / 4 * x / y; }
  // Independent sensor jitter integrates each pixel's area along with the pupil.
  const jx = ((index + 0.5) * 0.438579021) % 1 - 0.5;
  const jy = ((index + 0.5) * 0.328173571) % 1 - 0.5;
  return [radius * Math.cos(angle) * APERTURE_RADIUS, radius * Math.sin(angle) * APERTURE_RADIUS, jx, jy];
}

const vAdd = (a,b) => a.map((x,i)=>x+b[i]);
const vSub = (a,b) => a.map((x,i)=>x-b[i]);
const vScale = (a,s) => a.map(x=>x*s);
const vDot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
const vCross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vUnit = a => vScale(a,1/Math.max(1e-12,Math.hypot(...a)));
const vMix = (a,b,t) => a.map((x,i)=>x+(b[i]-x)*t);
function macroCamera(time,parameters) {
  const yaw=parameters.yaw+(time-4)*.105, pitch=parameters.pitch-.08+Math.sin(time*.11)*.08;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
  const right=[cy,0,sy], up=[sx*sy,cx,-sx*cy], back=[-cx*sy,sx,cx*cy];
  return {position:vScale(back,3.58/parameters.zoom),target:[0,0,0],up,right,back};
}
function viewCamera(macro,ride,blend,distance) {
  const position=vMix(macro.position,ride?.position||macro.position,blend);
  const target=vMix(macro.target,ride?.target||macro.target,blend);
  const upHint=vUnit(vMix(macro.up,ride?.up||macro.up,blend));
  const back=vUnit(vSub(position,target));
  let right=vUnit(vCross(upHint,back));
  if (Math.hypot(...right)<.01) right=macro.right;
  const up=vUnit(vCross(back,right));
  return {position,target,right,up,back,rows:[...right,-vDot(right,position),...up,-vDot(up,position),...back,distance-vDot(back,position)]};
}

export async function createRenderer(canvas, { onReady, onError, onStats, initialTime = 0 } = {}) {
  const parameters = { ...INITIAL };
  const ride = createChaosRide();
  let rideState = ride.getState(), currentCamera;
  let lightingYaw=parameters.yaw, lightingPitch=parameters.pitch, lightingTween=null;
  const startTime = Number.isFinite(initialTime) ? Math.max(0, Math.min(60, initialTime)) : 0;
  const diagnostic = { renderer: 'webgpu', ready: false, frame: 0, time: startTime, particleCount: MAX_PARTICLES, fps: 0, errors: [], paused: false };
  window.__particleState = diagnostic;
  let device, context, animationId, resizeObserver, skaterModel, fireSimulation, fireVisuals;
  const igniter={x:0.5,y:0.5,active:false};
  let fireStats={burnedFraction:0,heatAverage:0,activeCells:0,smokeAverage:0,fuelAverage:1},fireGeneration=0,fireStatsDirty=false;
  const clearCombustion=()=>{igniter.active=false;fireGeneration++;fireStatsDirty=true;fireStats={burnedFraction:0,heatAverage:0,activeCells:0,smokeAverage:0,fuelAverage:1};fireSimulation.clear();};
  let disposed = false, paused = false, simulationTime = startTime, lastTimestamp = 0;
  let initializeParticles = true, geometryDirty = true, resetFilm = true, totalFilmSamples = 0, filmWrite = 0, displayIndex = 0;
  let geometryRevision = 0;
  let sceneTexture, sumTexture, depthTexture, heatTexture, filmTextures = [];
  let uniforms, sampleUniforms, particles, viewParticles, meshVertices, meshIndices, sunTexture, riderVertices;
  const captures = [];
  const captureFrame = (event) => { if (typeof event.detail === 'function') captures.push(event.detail); };
  canvas.addEventListener('capture-frame', captureFrame);
  const reportError = (error) => {
    if (disposed) return;
    const message = error?.message || String(error);
    diagnostic.errors.push(message);
    canvas.dataset.errors = JSON.stringify(diagnostic.errors);
    onError?.(message);
    console.error('[WebGPU particle study]', error);
  };
  const destroyTargets = () => {
    for (const target of [sceneTexture, sumTexture, depthTexture, heatTexture, ...filmTextures]) target?.destroy();
  };

  try {
    if (!navigator.gpu) throw new Error('当前浏览器没有开放 WebGPU。请用支持 WebGPU 的 Chrome 或 Edge 打开。');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('未能取得 WebGPU 适配器。');
    device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (event) => reportError(event.error));
    device.lost.then((info) => { if (!disposed) reportError('GPU 设备连接中断：' + info.message); });
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('无法建立 WebGPU 画布。');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    canvas.dataset.renderer = 'webgpu';
    canvas.dataset.errors = JSON.stringify(diagnostic.errors);
    canvas.dataset.optics = 'physical-aperture-v4';
    canvas.dataset.palette = 'meadow-v7';
    canvas.dataset.geometry = 'continuous-unfolded-meadow-v13';
    canvas.dataset.lighting = 'sun-shadow-transmission-v9';
    canvas.dataset.lifecycle = 'continuous-radius-v3';

    const shaderCodes = [computeWGSL, projectionWGSL, renderWGSL, accumulateWGSL, historyWGSL, compositeWGSL, geometryWGSL, shadowWGSL, riderRenderWGSL, riderShadowWGSL];
    const modules = shaderCodes.map((code, i) => device.createShaderModule({code, label: ['Plant root motion', 'View coordinates', 'Sunlit botanical film', 'Linear aperture integration', 'Stationary film integration', 'Film response', 'Curved botanical meshes', 'Sunlight shadow map', 'Same-body rider', 'Rider sunlight shadow'][i]}));
    for (const info of await Promise.all(modules.map((module) => module.getCompilationInfo()))) {
      for (const message of info.messages) {
        if (message.type === 'error') throw new Error('WGSL ' + message.lineNum + ':' + message.linePos + ' ' + message.message);
        if (message.type === 'warning') console.warn(message.message);
      }
    }
    uniforms = device.createBuffer({size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    sampleUniforms = device.createBuffer({size: MAX_LENS * 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    particles = device.createBuffer({size: MAX_PARTICLES * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
    viewParticles = device.createBuffer({size: MAX_PARTICLES * 64, usage: GPUBufferUsage.STORAGE});
    fireSimulation=await createFireSimulation(device,{uniforms,plants:viewParticles,maxParticles:MAX_PARTICLES});
    fireVisuals=await createFireVisuals(device,{sampleUniforms,plants:viewParticles,fireState:fireSimulation.stateBuffer,format:'rgba16float',depthFormat:'depth32float',maxLens:MAX_LENS});
    skaterModel = await createSkaterModel(device);
    ride.setPoseSampler(skaterModel.samplePose);
    riderVertices = skaterModel.vertices;
    canvas.dataset.character = 'textured-anatomical-gpu-skin-v16';
    canvas.dataset.riderBones = String(skaterModel.boneCount);
    meshVertices = device.createBuffer({size: MAX_MESH_VERTICES * 32, usage: GPUBufferUsage.STORAGE});
    const indices = new Uint16Array(GRASS_INDICES.length+FLOWER_INDICES.length+CRUST_INDICES.length);
    indices.set(GRASS_INDICES); indices.set(FLOWER_INDICES,GRASS_INDICES.length); indices.set(CRUST_INDICES,GRASS_INDICES.length+FLOWER_INDICES.length);
    meshIndices = device.createBuffer({size: Math.ceil(indices.byteLength/4)*4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(meshIndices,0,indices);
    sunTexture = device.createTexture({size:[2048,2048],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
    const sunSampler = device.createSampler({compare:'less-equal',minFilter:'linear',magFilter:'linear'});

    const uniformEntry = (visibility, dynamic = false) => ({binding: 0, visibility, buffer: {type: 'uniform', minBindingSize: 256, hasDynamicOffset: dynamic}});
    const storageEntry = (binding, visibility, type) => ({binding, visibility, buffer: {type}});
    const computeLayout = device.createBindGroupLayout({entries: [uniformEntry(GPUShaderStage.COMPUTE), storageEntry(1, GPUShaderStage.COMPUTE, 'storage')]});
    const projectLayout = device.createBindGroupLayout({entries: [uniformEntry(GPUShaderStage.COMPUTE), storageEntry(1, GPUShaderStage.COMPUTE, 'read-only-storage'), storageEntry(2, GPUShaderStage.COMPUTE, 'storage')]});
    const geometryLayout = device.createBindGroupLayout({entries: [uniformEntry(GPUShaderStage.COMPUTE),storageEntry(1,GPUShaderStage.COMPUTE,'read-only-storage'),storageEntry(2,GPUShaderStage.COMPUTE,'storage'),storageEntry(3,GPUShaderStage.COMPUTE,'read-only-storage')]});
    const characterEntries = [{binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float',viewDimension:'2d-array'}},
      {binding:5,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}, storageEntry(6,GPUShaderStage.VERTEX,'read-only-storage')];
    const shadowLayout = device.createBindGroupLayout({entries: [uniformEntry(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT),storageEntry(1,GPUShaderStage.VERTEX,'read-only-storage'),...characterEntries]});
    const renderLayout = device.createBindGroupLayout({entries: [uniformEntry(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, true), storageEntry(1, GPUShaderStage.VERTEX, 'read-only-storage'),
      {binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},...characterEntries]});
    const makePostLayout = (textures) => device.createBindGroupLayout({entries: [
      uniformEntry(GPUShaderStage.FRAGMENT),
      ...Array.from({length: textures}, (_, i) => ({binding: i + 1, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: 'unfilterable-float'}})),
    ]});
    const accumulateLayout = makePostLayout(1), historyLayout = makePostLayout(2), compositeLayout = makePostLayout(2);
    const makePipelineLayout = (layout) => device.createPipelineLayout({bindGroupLayouts: [layout]});
    const computeGroup = device.createBindGroup({layout: computeLayout, entries: [{binding: 0, resource: {buffer: uniforms}}, {binding: 1, resource: {buffer: particles}}]});
    const projectGroup = device.createBindGroup({layout: projectLayout, entries: [{binding: 0, resource: {buffer: uniforms}}, {binding: 1, resource: {buffer: particles}}, {binding: 2, resource: {buffer: viewParticles}}]});
    const geometryGroup = device.createBindGroup({layout:geometryLayout,entries:[{binding:0,resource:{buffer:uniforms}},{binding:1,resource:{buffer:viewParticles}},{binding:2,resource:{buffer:meshVertices}},{binding:3,resource:{buffer:fireSimulation.stateBuffer}}]});
    const characterResources=[{binding:4,resource:skaterModel.texture.createView({dimension:'2d-array'})},{binding:5,resource:skaterModel.sampler},{binding:6,resource:{buffer:skaterModel.jointBuffer}}];
    const shadowGroup = device.createBindGroup({layout:shadowLayout,entries:[{binding:0,resource:{buffer:uniforms}},{binding:1,resource:{buffer:meshVertices}},...characterResources]});
    const renderGroup = device.createBindGroup({layout: renderLayout, entries: [{binding: 0, resource: {buffer: sampleUniforms, offset: 0, size: 256}}, {binding: 1, resource: {buffer: meshVertices}},
      {binding:2,resource:sunTexture.createView()},{binding:3,resource:sunSampler},...characterResources]});

    const makePostPipeline = (module, layout, target, blend) => device.createRenderPipelineAsync({
      layout: makePipelineLayout(layout), vertex: {module, entryPoint: 'vertex'}, fragment: {module, entryPoint: 'fragment', targets: [{format: target, ...(blend ? {blend} : {})}]},
      primitive: {topology: 'triangle-list'},
    });
    const additive = {color: {srcFactor: 'one', dstFactor: 'one', operation: 'add'}, alpha: {srcFactor: 'one', dstFactor: 'one', operation: 'add'}};
    const riderVertexLayout = [{arrayStride:RIDER_VERTEX_STRIDE,attributes:[{shaderLocation:0,format:'float32x3',offset:0},{shaderLocation:1,format:'float32x3',offset:12},{shaderLocation:2,format:'float32x3',offset:24},{shaderLocation:3,format:'float32',offset:36},
      {shaderLocation:4,format:'float32x2',offset:40},{shaderLocation:5,format:'float32',offset:48},{shaderLocation:6,format:'float32',offset:52},{shaderLocation:7,format:'uint16x4',offset:56},{shaderLocation:8,format:'float32x4',offset:64}]}];
    const [computePipeline, projectPipeline, scenePipeline, accumulatePipeline, historyPipeline, compositePipeline, geometryPipeline, shadowPipeline, riderPipeline, riderShadowPipeline] = await Promise.all([
      device.createComputePipelineAsync({layout: makePipelineLayout(computeLayout), compute: {module: modules[0], entryPoint: 'update'}}),
      device.createComputePipelineAsync({layout: makePipelineLayout(projectLayout), compute: {module: modules[1], entryPoint: 'project'}}),
      device.createRenderPipelineAsync({layout: makePipelineLayout(renderLayout), vertex: {module: modules[2], entryPoint: 'vertex'}, fragment: {module: modules[2], entryPoint: 'sceneFragment', targets: [{format: 'rgba16float'}]},
        primitive: {topology: 'triangle-list', cullMode: 'none'}, depthStencil: {format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less'}}),
      makePostPipeline(modules[3], accumulateLayout, 'rgba16float', additive),
      makePostPipeline(modules[4], historyLayout, 'rgba16float'),
      makePostPipeline(modules[5], compositeLayout, format),
      device.createComputePipelineAsync({layout:makePipelineLayout(geometryLayout),compute:{module:modules[6],entryPoint:'generate'}}),
      device.createRenderPipelineAsync({layout:makePipelineLayout(shadowLayout),vertex:{module:modules[7],entryPoint:'shadowVertex'},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}}),
      device.createRenderPipelineAsync({layout:makePipelineLayout(renderLayout),vertex:{module:modules[8],entryPoint:'riderVertex',buffers:riderVertexLayout},fragment:{module:modules[8],entryPoint:'sceneFragment',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}}),
      device.createRenderPipelineAsync({layout:makePipelineLayout(shadowLayout),vertex:{module:modules[9],entryPoint:'riderShadowVertex',buffers:riderVertexLayout},fragment:{module:modules[9],entryPoint:'riderShadowFragment',targets:[]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}}),
    ]);
    let width = 0, height = 0, dpr = 1, fpsStart = performance.now(), fpsFrames = 0;
    let accumulateGroup, historyGroups, compositeGroups;
    const postGroup = (layout, textures) => device.createBindGroup({layout, entries: [{binding: 0, resource: {buffer: uniforms}}, ...textures.map((texture, i) => ({binding: i + 1, resource: texture.createView()}))]});
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const resolutionCap = paused || parameters.speed === 0 ? 2 : (parameters.quality === 'high' ? 1.25 : 1);
      dpr = Math.min(window.devicePixelRatio || 1, resolutionCap);
      const newWidth = Math.max(2, Math.round(rect.width * dpr)), newHeight = Math.max(2, Math.round(rect.height * dpr));
      if (newWidth === width && newHeight === height) return;
      width = newWidth; height = newHeight; canvas.width = width; canvas.height = height;
      destroyTargets();
      const texture = (label) => device.createTexture({label, size: [width, height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING});
      sceneTexture = texture('One lens ray view'); sumTexture = texture('Current frame aperture integral');
      filmTextures = [texture('Stationary film A'), texture('Stationary film B')];
      depthTexture = device.createTexture({size: [width, height], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT});
      heatTexture=device.createTexture({label:'Buoyant heat refraction',size:[Math.max(2,Math.ceil(width/2)),Math.max(2,Math.ceil(height/2))],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
      accumulateGroup = postGroup(accumulateLayout, [sceneTexture]);
      historyGroups = [postGroup(historyLayout, [sumTexture, filmTextures[1]]), postGroup(historyLayout, [sumTexture, filmTextures[0]])];
      compositeGroups = filmTextures.map((film) => postGroup(compositeLayout, [film,heatTexture]));
      resetFilm = true; totalFilmSamples = 0; filmWrite = 0; displayIndex = 0;
      diagnostic.width = width; diagnostic.height = height;
    };
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
    const uniformData = new Float32Array(64), sampleData = new Float32Array(MAX_LENS * FLOAT_STRIDE);
    let framePending = false;

    const render = (timestamp) => {
      if (disposed) return;
      animationId = requestAnimationFrame(render);
      if (framePending) return;
      const elapsed = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.05) : 0; lastTimestamp = timestamp;
      const simulationStationary = paused || parameters.speed === 0;
      if (!simulationStationary) simulationTime += elapsed * parameters.speed;
      rideState = ride.update(paused ? 0 : elapsed,{time:simulationTime,params:parameters});
      const rideBlend = Math.max(0,Math.min(1,rideState.blend||0));
      const stationary = simulationStationary && !(rideBlend>0 && !paused) && !((fireSimulation.active || igniter.active) && !paused);
      if (!stationary) totalFilmSamples = 0;
      if (lightingTween) {
        const previousYaw=lightingYaw,previousPitch=lightingPitch;
        lightingTween.elapsed+=paused ? 0 : elapsed;
        const phase=Math.min(1,lightingTween.elapsed/1.8), weight=phase*phase*(3-2*phase);
        lightingYaw=lightingTween.fromYaw+(lightingTween.toYaw-lightingTween.fromYaw)*weight;
        lightingPitch=lightingTween.fromPitch+(lightingTween.toPitch-lightingTween.fromPitch)*weight;
        if (lightingYaw!==previousYaw || lightingPitch!==previousPitch) geometryDirty=true;
        if (phase===1) lightingTween=null;
      } else { lightingYaw=parameters.yaw;lightingPitch=parameters.pitch; }
      const macro = macroCamera(simulationTime,parameters);
      const cameraDistance = 3.58/parameters.zoom;
      currentCamera = viewCamera(macro,rideState.camera,rideBlend,cameraDistance);
      const focusPoint = vAdd(rideState.position||[0,0,0],vScale(rideState.up||[0,1,0],.20));
      const riderFocus = Math.max(.04,vDot(vSub(currentCamera.position,focusPoint),currentCamera.back)+(parameters.focusPosition-RIDE_FOCUS_REFERENCE)*.18);
      const focusDistance = (cameraDistance+parameters.focusPosition)*(1-rideBlend)+riderFocus*rideBlend;
      const pupilScale = (APERTURE_RADIUS*(1-rideBlend)+.024*rideBlend)/APERTURE_RADIUS;
      const space=rideState.space;
      const unfold=Math.max(0,Math.min(1,space?.unfold||0));
      let riderVertexCount=0;
      if ((rideState.visibility||0)>.0001) {
        skaterModel.update(rideState);
        riderVertexCount=skaterModel.vertexCount;
      }
      if (resetFilm) { totalFilmSamples = 0; resetFilm = false; }
      const count = QUALITY_COUNTS[parameters.quality] || MAX_PARTICLES;
      const flowerCount = Math.ceil(count/FLOWER_ROOT_STRIDE);
      const uniqueVertexCount = count*GRASS_VERTEX_COUNT+flowerCount*FLOWER_VERTEX_COUNT+CRUST_VERTEX_COUNT;
      const coverageScale = Math.sqrt(MAX_PARTICLES / count);
      const lensCount = (rideBlend>.01 || fireSimulation.active) && !stationary ? ({high:12,normal:8,low:8}[parameters.quality]||12) : (LENS_COUNTS[parameters.quality]||MAX_LENS);
      const needsIntegral = !stationary || totalFilmSamples < STILL_SAMPLES || initializeParticles;
      const historyWeight = totalFilmSamples ? lensCount / (totalFilmSamples + lensCount) : 1;
      uniformData.set([width, height, simulationTime, count, parameters.turbulence, parameters.dispersion, parameters.pointSize * coverageScale, parameters.zoom,
        lightingYaw, lightingPitch, dpr, focusDistance, rideBlend, 1 / lensCount, 1, initializeParticles ? -1 : (simulationStationary ? 0 : elapsed),
        historyWeight, 0, 0, 0]);
      uniformData.set(currentCamera.rows,20);
      uniformData.set([...(space?.domainRight||[1,0,0]),space?.baseRadius||.93],32);
      uniformData.set([...(space?.domainForward||[0,0,1]),3.0],36);
      uniformData.set([...(space?.domainNormal||[0,1,0]),parameters.flowerRatio],40);
      uniformData.set([...(space?.worldRight||[1,0,0]),0],44);
      uniformData.set([...(space?.worldForward||[0,0,1]),0],48);
      uniformData.set([...(space?.worldUp||[0,1,0]),RIDE_HEIGHT_SCALE],52);
      uniformData.set([...(space?.origin||[0,0,0]),unfold],56);
      uniformData.set([...(rideState.position||[0,0,0]),rideState.visibility||0],60);
      device.queue.writeBuffer(uniforms, 0, uniformData);
      const encoder = device.createCommandEncoder({label: 'Physical aperture film'});
      if (needsIntegral) {
        for (let i = 0; i < lensCount; i++) {
          sampleData.set(uniformData, i * FLOAT_STRIDE);
          const pupil=lensSample((stationary ? totalFilmSamples : 0)+i);
          pupil[0]*=pupilScale; pupil[1]*=pupilScale;
          sampleData.set(pupil,i*FLOAT_STRIDE+16);
        }
        device.queue.writeBuffer(sampleUniforms, 0, sampleData);
        const updateGeometry = !stationary || geometryDirty || initializeParticles;
        if (updateGeometry) {
          const compute = encoder.beginComputePass(); compute.setPipeline(computePipeline); compute.setBindGroup(0, computeGroup); compute.dispatchWorkgroups(Math.ceil(count / 256));
          compute.setPipeline(projectPipeline); compute.setBindGroup(0, projectGroup); compute.dispatchWorkgroups(Math.ceil(count / 256)); compute.end();
          fireSimulation.encode(encoder,{dt:paused?0:elapsed,time:simulationTime,count,igniter});
          const geometry=encoder.beginComputePass();geometry.setPipeline(geometryPipeline);geometry.setBindGroup(0,geometryGroup);geometry.dispatchWorkgroups(Math.ceil(uniqueVertexCount/128));geometry.end();
          geometryDirty = false;
          canvas.dataset.geometryRevision = String(++geometryRevision);
        }
        if (updateGeometry || riderVertexCount || rideBlend>0) {
          const shadow = encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:sunTexture.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
          shadow.setPipeline(shadowPipeline); shadow.setBindGroup(0,shadowGroup); shadow.setIndexBuffer(meshIndices,'uint16');
          shadow.drawIndexed(GRASS_INDICES.length,count,0,0,0);
          shadow.drawIndexed(FLOWER_INDICES.length,flowerCount,GRASS_INDICES.length,0,count);
          if(unfold>.25) shadow.drawIndexed(CRUST_INDICES.length,1,GRASS_INDICES.length+FLOWER_INDICES.length,0,count+flowerCount);
          if(unfold>.35) shadow.drawIndexed(GRASS_INDICES.length,count,0,0,count+flowerCount+1);
          if(unfold>.35) shadow.drawIndexed(FLOWER_INDICES.length,flowerCount*(parameters.flowerRatio>1 ? 5 : 2),GRASS_INDICES.length,0,2*count+flowerCount+1);
          if (riderVertexCount) { shadow.setPipeline(riderShadowPipeline);shadow.setBindGroup(0,shadowGroup);shadow.setVertexBuffer(0,riderVertices);shadow.setIndexBuffer(skaterModel.indexBuffer,'uint32');shadow.drawIndexed(skaterModel.indexCount); }
          shadow.end();
        }
        for (let i = 0; i < lensCount; i++) {
          const scene = encoder.beginRenderPass({colorAttachments: [{view: sceneTexture.createView(), clearValue: {r: 0, g: 0, b: 0, a: 0}, loadOp: 'clear', storeOp: 'store'}],
            depthStencilAttachment: {view: depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard'}});
          scene.setPipeline(scenePipeline); scene.setBindGroup(0, renderGroup, [i * 256]); scene.setIndexBuffer(meshIndices,'uint16');
          scene.drawIndexed(GRASS_INDICES.length,count,0,0,0);
          scene.drawIndexed(FLOWER_INDICES.length,flowerCount,GRASS_INDICES.length,0,count);
          if(unfold>.25) scene.drawIndexed(CRUST_INDICES.length,1,GRASS_INDICES.length+FLOWER_INDICES.length,0,count+flowerCount);
          if(unfold>.35) scene.drawIndexed(GRASS_INDICES.length,count,0,0,count+flowerCount+1);
          if(unfold>.35) scene.drawIndexed(FLOWER_INDICES.length,flowerCount*(parameters.flowerRatio>1 ? 5 : 2),GRASS_INDICES.length,0,2*count+flowerCount+1);
          if (riderVertexCount) {scene.setPipeline(riderPipeline);scene.setBindGroup(0,renderGroup,[i*256]);scene.setVertexBuffer(0,riderVertices);scene.setIndexBuffer(skaterModel.indexBuffer,'uint32');scene.drawIndexed(skaterModel.indexCount);}
          if(fireSimulation.active)fireVisuals.draw(scene,{sampleIndex:i,count});
          scene.end();
          const sum = encoder.beginRenderPass({colorAttachments: [{view: sumTexture.createView(), clearValue: {r: 0, g: 0, b: 0, a: 0}, loadOp: i === 0 ? 'clear' : 'load', storeOp: 'store'}]});
          sum.setPipeline(accumulatePipeline); sum.setBindGroup(0, accumulateGroup); sum.draw(3); sum.end();
        }
        const history = encoder.beginRenderPass({colorAttachments: [{view: filmTextures[filmWrite].createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 0}}]});
        history.setPipeline(historyPipeline); history.setBindGroup(0, historyGroups[filmWrite]); history.draw(3); history.end();
        displayIndex = filmWrite; filmWrite = 1 - filmWrite;
        totalFilmSamples = stationary ? totalFilmSamples + lensCount : 0;
        initializeParticles = false;
      }
      const heat=encoder.beginRenderPass({colorAttachments:[{view:heatTexture.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
      if(fireSimulation.active)fireVisuals.drawHeat(heat,{sampleIndex:0,count});heat.end();
      const output = encoder.beginRenderPass({colorAttachments: [{view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 1}}]});
      output.setPipeline(compositePipeline); output.setBindGroup(0, compositeGroups[displayIndex]); output.draw(3); output.end();
      device.queue.submit([encoder.finish()]);
      if (needsIntegral) {
        framePending = true; const submitted = performance.now();
        device.queue.onSubmittedWorkDone().then(() => { if (!disposed) { diagnostic.gpuLatencyMs = performance.now() - submitted; canvas.dataset.gpuLatency = diagnostic.gpuLatencyMs.toFixed(1); } framePending = false; }).catch((error) => { framePending = false; if (!disposed) reportError(error); });
      }
      if (captures.length && (!stationary || totalFilmSamples >= STILL_SAMPLES)) {
        const callbacks = captures.splice(0);
        canvas.toBlob((blob) => callbacks.forEach((callback) => callback(blob)), 'image/png');
      }
      diagnostic.frame++; diagnostic.time = simulationTime; diagnostic.particleCount = count; diagnostic.paused = paused;
      canvas.dataset.frame = String(diagnostic.frame); canvas.dataset.time = simulationTime.toFixed(3); canvas.dataset.particleCount = String(count); canvas.dataset.paused = String(paused);
      canvas.dataset.flowerCount = String(flowerCount); canvas.dataset.flowerRatio = parameters.flowerRatio.toFixed(2); canvas.dataset.meshVertices = String(uniqueVertexCount);
      canvas.dataset.lensSamples = String(stationary ? totalFilmSamples : lensCount);
      canvas.dataset.focusDistance = focusDistance.toFixed(3); canvas.dataset.unfold=unfold.toFixed(4);
      canvas.dataset.ridePush = (rideState.push||0).toFixed(4);
      canvas.dataset.fireActive=String(fireSimulation.active);
      canvas.dataset.igniterActive=String(igniter.active);
      canvas.dataset.strokeForce = (rideState.strokeForce||0).toFixed(4);
      Object.assign(canvas.dataset,{riding:String(Boolean(rideState.active)),transitioning:String(Boolean(rideState.transitioning)),rideBlend:rideBlend.toFixed(4),rideDistance:(rideState.distance||0).toFixed(4),rideSpeed:(rideState.speed||0).toFixed(4),airborne:String(Boolean(rideState.airborne)),jumps:String(rideState.jumps||0),riderVertices:String(riderVertexCount),riderPosition:JSON.stringify(rideState.position||null),riderUp:JSON.stringify(rideState.up||null),cameraPosition:JSON.stringify(currentCamera.position),cameraTarget:JSON.stringify(currentCamera.target),worldBody:'original-continuous-particles',rideSteer:(rideState.steer||0).toFixed(3),surfaceLayer:String(rideState.supportLayer||0),surfaceCoverage:(rideState.supportCoverage??1).toFixed(3),outerCoverage:(rideState.outerCoverage??1).toFixed(3),supportBlend:(rideState.shellBlend||0).toFixed(3)});
      fpsFrames++;
      if (timestamp - fpsStart >= 750) {
        diagnostic.fps = Math.round(fpsFrames * 1000 / (timestamp - fpsStart)); canvas.dataset.fps = String(diagnostic.fps); diagnostic.parameters = { ...parameters };
        const generation=fireGeneration;
        if(fireSimulation.active || fireStats.burnedFraction>0 || fireStatsDirty)fireSimulation.readStats().then(stats=>{if(stats&&!disposed&&generation===fireGeneration){fireStats=stats;fireStatsDirty=false;canvas.dataset.burnedFraction=stats.burnedFraction.toFixed(4);canvas.dataset.fireHeat=stats.heatAverage.toFixed(4);canvas.dataset.fireCells=String(stats.activeCells);canvas.dataset.fuel=stats.fuelAverage.toFixed(4);}});
        canvas.dataset.burnedFraction=fireStats.burnedFraction.toFixed(4);
        onStats?.({fps: diagnostic.fps, particleCount: count, time: simulationTime, paused, fireActive:fireSimulation.active, burnedFraction:fireStats.burnedFraction, riding:Boolean(rideState.active),transitioning:Boolean(rideState.transitioning),rideBlend,distance:rideState.distance||0,speed:rideState.speed||0,airborne:Boolean(rideState.airborne),jumps:rideState.jumps||0}); fpsFrames = 0; fpsStart = timestamp;
      }
    };
    diagnostic.ready = true; animationId = requestAnimationFrame(render); onReady?.({renderer: 'webgpu', particleCount: MAX_PARTICLES});
    return {
      setIgniter(value){Object.assign(igniter,{x:Math.max(0,Math.min(1,Number(value.x)||0)),y:Math.max(0,Math.min(1,Number(value.y)||0)),active:Boolean(value.active)});if(igniter.active)resetFilm=true;},
      clearFire(){clearCombustion();geometryDirty=true;resetFilm=true;},
      enterRide() { ride.enter({time:simulationTime,params:parameters});resetFilm=true; },
      exitRide() { ride.exit();resetFilm=true; },
      setInput(input) { ride.setInput(input); },
      jump() { ride.jump();resetFilm=true; },
      setParameters(partial) {
        const previousParameters = { ...parameters }, allowed = new Set(Object.keys(INITIAL));
        for (const [key, value] of Object.entries(partial)) {
          if (!allowed.has(key)) continue;
          if (key === 'quality') { if (QUALITY_COUNTS[value]) parameters.quality = value; }
          else if (Number.isFinite(Number(value))) parameters[key] = Number(value);
        }
        parameters.speed = Math.min(3, Math.max(0, parameters.speed)); parameters.zoom = Math.min(1.7, Math.max(0.65, parameters.zoom));
        parameters.turbulence = Math.min(2.4, Math.max(0, parameters.turbulence)); parameters.dispersion = Math.min(2, Math.max(0, parameters.dispersion)); parameters.pointSize = Math.min(2.6, Math.max(0.35, parameters.pointSize));
        parameters.focusPosition = Math.min(1.2, Math.max(-1.2, parameters.focusPosition));
        parameters.flowerRatio = Math.min(2, Math.max(0, parameters.flowerRatio));
        const changed = Object.keys(INITIAL).some((key) => parameters[key] !== previousParameters[key]);
        if (changed) resetFilm = true;
        if (['yaw','pitch','turbulence','dispersion','pointSize','quality','flowerRatio'].some((key) => parameters[key] !== previousParameters[key])) geometryDirty = true;
        if (['quality','speed'].some((key) => parameters[key] !== previousParameters[key])) resize();
        if ((paused || parameters.speed === 0) && ['turbulence','dispersion','pointSize','quality'].some((key) => parameters[key] !== previousParameters[key])) initializeParticles = true;
        diagnostic.parameters = { ...parameters };
      },
      setPaused(value) { const next = Boolean(value); if (next !== paused) resetFilm = true; paused = next; diagnostic.paused = paused; resize(); },
      reset() { ride.reset();clearCombustion();Object.assign(parameters, INITIAL); lightingTween=null;lightingYaw=parameters.yaw;lightingPitch=parameters.pitch; simulationTime = 0; paused = false; initializeParticles = true; geometryDirty = true; resetFilm = true; resize(); diagnostic.parameters = { ...parameters }; },
      getState() { return { ...parameters, paused, time: simulationTime, particleCount: QUALITY_COUNTS[parameters.quality], fps: diagnostic.fps, riding:Boolean(rideState.active),transitioning:Boolean(rideState.transitioning),rideBlend:rideState.blend||0,distance:rideState.distance||0,speed:rideState.speed||0,airborne:Boolean(rideState.airborne),jumps:rideState.jumps||0 }; },
      destroy() { disposed = true; cancelAnimationFrame(animationId); resizeObserver.disconnect(); canvas.removeEventListener('capture-frame', captureFrame);fireVisuals.destroy();fireSimulation.destroy();destroyTargets(); sunTexture.destroy(); for (const buffer of [uniforms,sampleUniforms,particles,viewParticles,meshVertices,meshIndices]) buffer.destroy(); skaterModel.destroy(); context.unconfigure(); device.destroy(); },
    };
  } catch (error) {
    reportError(error); resizeObserver?.disconnect(); canvas.removeEventListener('capture-frame', captureFrame);fireVisuals?.destroy();fireSimulation?.destroy();
    destroyTargets(); sunTexture?.destroy(); for (const buffer of [uniforms,sampleUniforms,particles,viewParticles,meshVertices,meshIndices]) buffer?.destroy(); skaterModel?.destroy(); device?.destroy(); throw error;
  }
}
