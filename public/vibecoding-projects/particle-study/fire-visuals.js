import { sharedWGSL } from './shaders.js?v=fire-v19';

// Every source is attached to an existing root. The spherical combustion field
// survives camera changes and the continuous transition into the meadow.
const EMITTER_STRIDE = 64;
const MAX_EMITTERS = 750;
const FLAME_TONGUES = 3;
const SMOKE_PUFFS = 2;
const EMBERS = 3;

export const fireVisualWGSL = sharedWGSL + /* wgsl */ `
@group(0) @binding(1) var<storage, read> plants: array<Particle>;
@group(0) @binding(2) var<storage, read> fireState: array<vec4f>;

struct FireSource {
  root: vec3f,
  up: vec3f,
  right: vec3f,
  wind: vec3f,
  height: f32,
  canopyHeight: f32,
  seed: f32,
  state: vec4f,
};
struct FireOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) noiseDomain: vec3f,
  @location(2) state: vec4f,
  @location(3) variation: vec4f,
};

fn fireCell(direction: vec3f) -> u32 {
  let longitude=fract(atan2(direction.z,direction.x)/6.28318530718+1.0);
  let latitude=acos(clamp(direction.y,-1.0,1.0))/3.14159265359;
  return min(63u,u32(longitude*64.0))+min(31u,u32(latitude*32.0))*64u;
}
fn fireUnit(vector: vec3f, fallback: vec3f) -> vec3f {
  return select(fallback,vector*inverseSqrt(max(dot(vector,vector),0.0000001)),dot(vector,vector)>0.000001);
}
fn source(emitter: u32) -> FireSource {
  let count=max(u32(u.viewport.w),1u);
  let identity=min(emitter*64u+hash32(emitter*47u+769u)%64u,count-1u);
  let plant=plants[identity];
  let direction=rideDirection(identity);
  var result: FireSource;
  result.root=plant.position.xyz;
  let up=normalize(mix(vec3f(0.0,1.0,0.0),u.worldUp.xyz,u.rideOrigin.w));
  result.up=normalize(up*0.80+plant.normal.xyz*0.34);
  // position.w already contains u.settings.z in the root compute shader.
  // This is exactly botanicalFrame.height; do not apply pointScale twice.
  result.height=max(plant.position.w,0.0)*mix(10.4,15.6,random(identity*37u+114u))*mix(1.0,0.7316,u.rideOrigin.w);
  let contactDelta=result.root-u.riderContact.xyz;
  let contactPlanar=contactDelta-up*dot(contactDelta,up);
  let contact=(1.0-smoothstep(0.07,0.19,length(contactPlanar)))*u.riderContact.w*u.rideOrigin.w;
  result.height*=mix(1.0,0.22,contact);
  result.seed=random(identity*79u+107u);
  let toEye=cameraWorld()-result.root;
  result.right=fireUnit(cross(result.up,toEye),u.viewRight.xyz);
  let windAngle=0.72+noise(result.root*1.8+vec3f(2.8,1.3,4.7))*2.6;
  let groundWind=vec3f(cos(windAngle),0.0,sin(windAngle));
  result.wind=normalize(mix(groundWind,u.worldRight.xyz*groundWind.x+u.worldForward.xyz*groundWind.z,u.rideOrigin.w));
  result.state=fireState[fireCell(direction)];
  let charAmount=clamp(result.state.z,0.0,1.0);
  // The botanical mesh shortens by the same amount as its fuel chars. The
  // anchoring follows those remaining blades while plume length stays separate.
  result.canopyHeight=result.height*(1.0-charAmount*charAmount*0.76);
  // Suppress roots that are absent or on the hidden inner skin.
  let innerVisibility=select(1.0,smoothstep(0.45,0.9,u.rideOrigin.w),plant.material.z>0.5);
  result.state*=smoothstep(0.00015,0.0018,plant.position.w)*innerVisibility;
  return result;
}
fn quad(vertex: u32) -> vec2f {
  let points=array<vec2f,6>(vec2f(-1.0,0.0),vec2f(1.0,0.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,0.0),vec2f(1.0,1.0));
  return points[vertex];
}
fn invisible() -> FireOutput {
  var output: FireOutput;
  output.position=vec4f(2.0,2.0,2.0,1.0);
  output.uv=vec2f(0.0);
  output.noiseDomain=vec3f(0.0);
  output.state=vec4f(0.0);
  output.variation=vec4f(0.0);
  return output;
}
fn fireFbm(p: vec3f) -> f32 {
  return noise(p)*0.60+noise(p*2.03+vec3f(5.7,-1.9,8.2))*0.27+noise(p*4.09+vec3f(-2.7,4.8,1.2))*0.13;
}

@vertex fn flameVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> FireOutput {
  let emitter=instance/3u;
  let tongue=instance%3u;
  let fire=source(emitter);
  let heat=clamp(fire.state.x,0.0,1.7);
  if(heat<0.025 || fire.height<0.0001){return invisible();}
  let q=quad(vertex);
  let seed=fire.seed*37.0+f32(tongue)*7.31;
  let randomHeight=0.52+0.77*random(emitter*113u+tongue*7u+9u);
  let pulse=0.79+0.14*sin(u.viewport.z*13.7+seed)+0.07*sin(u.viewport.z*23.1+seed*2.3);
  let height=(fire.height*1.78+0.028)*randomHeight*pulse*sqrt(heat);
  let width=(fire.height*0.32+0.006)*mix(0.68,1.12,random(emitter*73u+tongue*37u))*sqrt(heat);
  let rootSpread=fire.right*((f32(tongue)-1.0)*width*0.84);
  // Grass is burning along its leaves as well as at the soil. Raising the hot
  // pocket into the lower canopy lets real grass geometry occlude its base
  // without hiding every luminous core below the taller leaves.
  let root=fire.root+fire.up*(fire.canopyHeight*(0.20+0.20*random(emitter*43u+tongue*131u)))+rootSpread;
  // The mesh bends with a coherent breeze; the luminous core moves within it.
  let bend=fire.wind*(q.y*q.y*height*(0.20+0.09*sin(u.viewport.z*1.2+seed)));
  let lateral=(sin(q.y*6.1-u.viewport.z*8.7+seed)+0.3*sin(q.y*17.0-u.viewport.z*16.1+seed*1.3))*q.y*width*0.36;
  let position=root+fire.up*(q.y*height)+fire.right*(q.x*width+lateral)+bend;
  var output: FireOutput;
  output.position=cameraProjection(position);
  output.uv=q;
  output.noiseDomain=vec3f(seed,seed*0.43,seed*0.71);
  output.state=fire.state;
  output.variation=vec4f(width,height,seed,heat);
  return output;
}

@fragment fn flameFragment(input: FireOutput) -> @location(0) vec4f {
  let uv=input.uv;
  let t=u.viewport.z;
  let seed=input.variation.z;
  let heat=input.variation.w;
  let rise=t*(4.9+fract(seed)*2.7);
  let y=uv.y;
  // Two irregular combustion sheets fork and rejoin. Their advection travels
  // upward, and the high-frequency threshold occasionally tears tips free.
  let flow=fireFbm(vec3f(uv.x*2.6,y*5.3-rise,seed));
  let tearing=noise(vec3f(uv.x*7.5+seed,y*14.0-rise*2.1,seed*0.39));
  let spine=sin(y*8.4-rise*1.6+seed)*(0.06+y*0.19)+flow*(0.08+y*0.23);
  let branch=spine+sin(y*11.0-rise*0.77+seed*1.7)*smoothstep(0.13,0.65,y)*0.37;
  let width=max(0.018,(0.54*(1.0-y)+0.020)*(0.80+0.22*flow));
  let radialA=(uv.x-spine)/width;
  let radialB=(uv.x-branch)/(width*0.64);
  if(min(abs(radialA),abs(radialB))>1.5 || y>0.995){discard;}
  var opticalDepth=0.0;
  var temperature=0.0;
  // Four samples through the narrow cross-section approximate a small luminous
  // volume. Its alpha and emission vanish before the polygon's boundary.
  for(var step=0u;step<4u;step++){
    let z=(f32(step)+0.5)*0.5-1.0;
    let radiusSquared=min(radialA*radialA+z*z,radialB*radialB+z*z*1.20+0.16);
    let p=vec3f(uv.x*4.9+seed,y*7.7-rise,z*2.6+seed*0.23);
    let turbulence=fireFbm(p);
    let outer=1.0-smoothstep(0.08,1.06,radiusSquared+turbulence*0.44+y*0.12);
    let flameSheet=smoothstep(-0.19,0.25,0.30-y*0.49+turbulence*0.90+tearing*0.19);
    let density=outer*flameSheet;
    let thermal=clamp(1.04-radiusSquared*0.68-y*0.51+turbulence*0.24,0.0,1.0);
    opticalDepth+=density*0.235;
    temperature+=density*thermal*0.235;
  }
  let base=smoothstep(0.0,0.085+0.055*(0.5+0.5*flow),y);
  let tip=1.0-smoothstep(0.73+flow*0.13,1.0,y);
  let edge=1.0-smoothstep(0.68,0.99,abs(uv.x));
  let opacity=(1.0-exp(-opticalDepth*0.96))*base*tip*edge;
  if(opacity<0.003){discard;}
  let warmth=temperature/max(opticalDepth,0.0001);
  let red=vec3f(1.22,0.022,0.001);
  let orange=vec3f(3.1,0.39,0.012);
  let golden=vec3f(5.0,1.8,0.20);
  let core=vec3f(6.0,3.0,0.60);
  var emission=mix(red,orange,smoothstep(0.09,0.51,warmth));
  emission=mix(emission,golden,smoothstep(0.48,0.83,warmth));
  let tinyCore=exp(-radialA*radialA*18.0)*pow(max(0.0,1.0-y),2.1)*smoothstep(0.78,0.96,warmth);
  emission=mix(emission,core,tinyCore*0.78);
  emission*=mix(0.74,1.00,clamp(heat,0.0,1.0));
  // A translucent hot gas emits more radiance than it blocks. Premultiplication
  // keeps both smoke and the HDR aperture film physically composable.
  return vec4f(emission*opacity,opacity*0.66);
}

@vertex fn smokeVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> FireOutput {
  let emitter=instance/2u;
  let puff=instance%2u;
  let fire=source(emitter);
  let smoke=clamp(fire.state.w,0.0,1.8);
  if(smoke<0.02 || fire.height<0.0001){return invisible();}
  let seed=fire.seed*47.0+f32(puff)*11.73;
  let age=fract(u.viewport.z*(0.27+0.08*fract(seed))+fract(seed*0.31));
  let q=quad(vertex);
  let life=smoothstep(0.0,0.13,age)*(1.0-smoothstep(0.64,1.0,age));
  let expansion=(fire.height*0.37+0.012)*(0.7+age*2.8);
  let height=(fire.height*1.6+0.055)*(0.50+age*1.3);
  let rise=(fire.height*2.6+0.1)*age;
  let drift=fire.wind*(age*age*(fire.height*1.1+0.04));
  let curl=fire.right*(sin(age*7.0+seed)*age*(fire.height*0.22+0.007));
  let center=fire.root+fire.up*(fire.height*0.6+rise)+drift+curl;
  let position=center+u.viewRight.xyz*(q.x*expansion)+u.viewUp.xyz*((q.y-0.5)*height);
  var output: FireOutput;
  output.position=cameraProjection(position);
  output.uv=vec2f(q.x,(q.y-0.5)*2.0);
  output.noiseDomain=vec3f(seed,age*1.1-u.viewport.z*0.23,seed*0.39);
  output.state=fire.state;
  output.variation=vec4f(life,smoke,seed,age);
  return output;
}

@fragment fn smokeFragment(input: FireOutput) -> @location(0) vec4f {
  let q=input.uv;
  let radius=dot(q,q);
  if(radius>1.0){discard;}
  let p=vec3f(q*2.8,0.5)+input.noiseDomain;
  let swirl=vec2f(noise(p+vec3f(4.7,2.1,9.3)),noise(p+vec3f(1.3,8.1,3.7)));
  let curl=fireFbm(p+vec3f(swirl*0.73,0.0));
  let wisps=fireFbm(p*2.1+vec3f(swirl*1.2,0.0)+vec3f(1.7,4.1,-2.8));
  let edge=1.0-smoothstep(0.25,1.0,radius+curl*0.29);
  let cloud=smoothstep(-0.35,0.42,curl+wisps*0.35+0.05);
  let opacity=edge*cloud*input.variation.x*input.variation.y*0.16;
  if(opacity<0.002){discard;}
  // Thin warm soot catches the sky while its folded interior self-shadows.
  let transmitted=clamp(0.43+curl*0.43-q.y*0.10,0.13,0.86);
  let color=mix(vec3f(0.085,0.071,0.056),vec3f(0.34,0.31,0.265),transmitted);
  let fireLight=vec3f(0.42,0.105,0.015)*clamp(input.state.x,0.0,1.0)*(1.0-input.variation.w)*0.23;
  return vec4f((color+fireLight)*opacity,opacity);
}

@vertex fn emberVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> FireOutput {
  let emitter=instance/3u;
  let ember=instance%3u;
  let fire=source(emitter);
  let heat=clamp(fire.state.x,0.0,1.5);
  if(heat<0.12 || fire.height<0.0001){return invisible();}
  let seed=fire.seed*59.0+f32(ember)*13.17;
  let age=fract(u.viewport.z*(0.51+fract(seed)*0.42)+fract(seed*0.57));
  let life=smoothstep(0.0,0.07,age)*(1.0-smoothstep(0.42,1.0,age));
  let q=quad(vertex);
  let vertical=(fire.height*3.0+0.09)*(age*1.4-age*age*0.30);
  let wind=fire.wind*(age*age*(fire.height*0.88+0.03));
  let wobble=fire.right*(sin(seed+age*9.0)*age*(fire.height*0.18+0.004));
  let center=fire.root+fire.up*(fire.height*0.23+vertical)+wind+wobble;
  let halfWidth=clamp(fire.height*0.007,0.0005,0.0018)*(0.65+fract(seed*2.3)*0.7);
  let streak=halfWidth*(1.5+2.0*age);
  let position=center+u.viewRight.xyz*(q.x*halfWidth)+u.viewUp.xyz*((q.y-0.5)*streak*2.0);
  var output: FireOutput;
  output.position=cameraProjection(position);
  output.uv=vec2f(q.x,(q.y-0.5)*2.0);
  output.noiseDomain=vec3f(0.0);
  output.state=fire.state;
  output.variation=vec4f(life,heat,seed,age);
  return output;
}

@fragment fn emberFragment(input: FireOutput) -> @location(0) vec4f {
  let radius=dot(input.uv,input.uv);
  if(radius>1.0){discard;}
  let center=exp(-radius*4.9);
  let alpha=(1.0-smoothstep(0.03,1.0,radius))*input.variation.x*input.variation.y;
  let cooling=input.variation.w;
  let radiance=mix(vec3f(5.0,1.9,0.10),vec3f(2.1,0.075,0.003),cooling);
  return vec4f(radiance*center*alpha,alpha*0.55);
}

@vertex fn heatVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> FireOutput {
  let fire=source(instance);
  let heat=clamp(fire.state.x,0.0,1.6);
  if(heat<0.04 || fire.height<0.0001){return invisible();}
  let q=quad(vertex);
  let height=(fire.height*3.3+0.075)*sqrt(heat);
  let width=(fire.height*0.60+0.015)*(0.67+q.y*0.70)*sqrt(heat);
  let drift=fire.wind*q.y*q.y*height*0.27;
  let position=fire.root+fire.up*(fire.height*0.42+q.y*height)+fire.right*(q.x*width)+drift;
  var output: FireOutput;
  output.position=cameraProjection(position);
  output.uv=q;
  output.noiseDomain=vec3f(fire.seed*29.7,fire.seed*11.3,fire.seed*47.1);
  output.state=fire.state;
  output.variation=vec4f(heat,height,width,fire.seed);
  return output;
}

@fragment fn heatFragment(input: FireOutput) -> @location(0) vec4f {
  let q=input.uv;
  let edge=1.0-smoothstep(0.22,0.97,abs(q.x));
  let vertical=smoothstep(0.0,0.09,q.y)*(1.0-smoothstep(0.49,1.0,q.y));
  let p=vec3f(q.x*3.5,q.y*7.0-u.viewport.z*2.8,u.viewport.z*0.61)+input.noiseDomain;
  let flow=fireFbm(p);
  let small=noise(p*2.7+vec3f(9.2,3.7,1.1));
  let density=edge*vertical*(0.40+0.30*flow)*input.variation.x;
  let displacement=vec2f(noise(p+vec3f(7.9,1.7,3.2)),flow*0.70+small*0.30)*0.0045;
  return vec4f(displacement*density,density*0.22,density);
}
`;

/** All resources are borrowed from the renderer; destroy does not own them. */
export async function createFireVisuals(device, {
  sampleUniforms, plants, fireState, format = 'rgba16float',
  depthFormat = 'depth32float', maxLens = 24,
}) {
  if (!sampleUniforms || !plants || !fireState) throw new Error('Fire visuals require camera, roots and combustion state.');
  const module = device.createShaderModule({label: 'World anchored fire, soot and embers', code: fireVisualWGSL});
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(message => message.type === 'error');
  if (errors.length) throw new Error(errors.map(message => `Fire WGSL ${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
  const layout = device.createBindGroupLayout({label: 'Combustion optical sample', entries: [
    {binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform', hasDynamicOffset: true, minBindingSize: 256}},
    {binding: 1, visibility: GPUShaderStage.VERTEX, buffer: {type: 'read-only-storage'}},
    {binding: 2, visibility: GPUShaderStage.VERTEX, buffer: {type: 'read-only-storage'}},
  ]});
  const pipelineLayout = device.createPipelineLayout({bindGroupLayouts: [layout]});
  const group = device.createBindGroup({layout, entries: [
    {binding: 0, resource: {buffer: sampleUniforms, offset: 0, size: 256}},
    {binding: 1, resource: {buffer: plants}},
    {binding: 2, resource: {buffer: fireState}},
  ]});
  const blend = {
    color: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
    alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
  };
  const makePipeline = (label, vertex, fragment) => device.createRenderPipelineAsync({
    label, layout: pipelineLayout,
    vertex: {module, entryPoint: vertex},
    fragment: {module, entryPoint: fragment, targets: [{format, blend}]},
    primitive: {topology: 'triangle-list', cullMode: 'none'},
    depthStencil: {format: depthFormat, depthWriteEnabled: false, depthCompare: 'less-equal'},
  });
  const [smokePipeline, flamePipeline, emberPipeline, heatPipeline] = await Promise.all([
    makePipeline('Thin advected soot', 'smokeVertex', 'smokeFragment'),
    makePipeline('Ray integrated luminous flame', 'flameVertex', 'flameFragment'),
    makePipeline('Cooling airborne embers', 'emberVertex', 'emberFragment'),
    device.createRenderPipelineAsync({
      label: 'Local refractive heat plume', layout: pipelineLayout,
      vertex: {module, entryPoint: 'heatVertex'},
      fragment: {module, entryPoint: 'heatFragment', targets: [{format, blend: {
        color: {srcFactor: 'one', dstFactor: 'one', operation: 'add'},
        alpha: {srcFactor: 'one', dstFactor: 'one', operation: 'add'},
      }}]},
      primitive: {topology: 'triangle-list', cullMode: 'none'},
    }),
  ]);
  let destroyed = false;
  return {
    draw(pass, options = {}, legacyCount) {
      if (destroyed) return;
      const sampleIndex = typeof options === 'number' ? options : options.sampleIndex || 0;
      const count = typeof options === 'number' ? legacyCount : options.count;
      const emitters = Math.min(MAX_EMITTERS, Math.ceil(Math.max(0, count || 0) / EMITTER_STRIDE));
      if (!emitters || sampleIndex < 0 || sampleIndex >= maxLens) return;
      pass.setBindGroup(0, group, [Math.floor(sampleIndex) * 256]);
      pass.setPipeline(smokePipeline); pass.draw(6, emitters * SMOKE_PUFFS);
      pass.setPipeline(flamePipeline); pass.draw(6, emitters * FLAME_TONGUES);
      pass.setPipeline(emberPipeline); pass.draw(6, emitters * EMBERS);
    },
    drawHeat(pass, {sampleIndex = 0, count = 0} = {}) {
      if (destroyed || sampleIndex < 0 || sampleIndex >= maxLens) return;
      const emitters = Math.min(MAX_EMITTERS, Math.ceil(Math.max(0, count) / EMITTER_STRIDE));
      if (!emitters) return;
      pass.setPipeline(heatPipeline);
      pass.setBindGroup(0, group, [Math.floor(sampleIndex) * 256]);
      pass.draw(6, emitters);
    },
    destroy() { destroyed = true; },
  };
}
