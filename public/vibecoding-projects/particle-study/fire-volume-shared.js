import { sharedWGSL } from './shaders.js?v=fire-v27a';
export const VOLUME_SIZE = 80;
export const SOURCE_STRIDE = 8;
export const volumeCommon = sharedWGSL + /* wgsl */ `
struct GasSettings { step: f32, clear: f32, frame: f32, injecting: f32 };
@group(0) @binding(7) var<uniform> gasSettings: GasSettings;
@group(0) @binding(8) var<uniform> previousU: Uniforms;
const GRID: u32 = ${VOLUME_SIZE}u;
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
