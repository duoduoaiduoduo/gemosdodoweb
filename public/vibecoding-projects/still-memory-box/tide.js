import * as THREE from './vendor/three.module.js';
// A filled particle bed with non-periodic, multi-scale turbulent surface motion.
export function makeTide(mobile){
 const count=mobile?62000:135000,a=new Float32Array(count*3);let seed=42;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<count*3;i++)a[i]=rand();
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(a,3));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:true,blending:THREE.NormalBlending,uniforms:{time:{value:0},swirl:{value:0},fade:{value:1},pixels:{value:700}},vertexShader:`
 uniform float time,swirl,pixels;varying vec3 color;varying vec3 sphereCenter;varying float sphereRadius;
 float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float field(vec3 p){return noise(p)*.60+noise(p*2.07+13.1)*.28+noise(p*4.19+7.7)*.12;}
 void main(){vec3 s=position;float t=time*.36;vec2 uv=s.xz*2.-1.;
 // Rotate a filled square cross-section: the bed remains full, including corners.
 float r=max(abs(uv.x),abs(uv.y)),angle=atan(uv.y,uv.x)+swirl*t*(1.2+s.y*.8);
 vec2 rot=vec2(cos(angle),sin(angle));rot=rot/max(abs(rot.x),abs(rot.y))*r;
 uv=mix(uv,rot,swirl);vec3 domain=vec3(uv.x*1.7,uv.y*1.6,t);
 float n=field(domain+vec3(field(domain+8.),field(domain+19.),0.)*.85);
 float detail=field(domain*1.8+vec3(6.,3.,-t*.7));
 float level=1.25+(n-.5)*1.4+(detail-.5)*.40+swirl*.2;
 // Most grains occupy the entire column; a small fraction emphasizes surface foam.
 float layer=s.y<.88?s.y/.88: .91+(s.y-.88)*.75;
 float eddy=field(vec3(uv*2.3,s.y*3.+t*.8));
 vec3 p=vec3(uv.x*1.44,-.50+layer*level,uv.y*1.56-.95);
 p.x+= (field(vec3(uv*2.,s.y*4.-t))-.5)*.18*(1.-abs(uv.x));
 p.z+= (eddy-.5)*.14*(1.-abs(uv.y));
 p.y+= (eddy-.5)*.15*sin(layer*3.14159);
 float crest=smoothstep(.74,.99,layer)*smoothstep(.38,.68,n+detail*.12);
 // Color travels with the same eddies that move the grains, throughout the bed.
 float flow=clamp((eddy-.28)*2.2+(detail-.5)*.16,0.,1.);
 vec3 submerged=mix(vec3(.09,.16,.62),vec3(.39,.12,.82),smoothstep(.08,.50,flow));
 submerged=mix(submerged,vec3(.66,.14,.53),smoothstep(.50,.88,flow));
 float ribbon=smoothstep(.56,.76,noise(domain+vec3(0.,layer*2.,-t*.35)));
 submerged=mix(submerged,vec3(.06,.43,.52),ribbon*.65);
 submerged*=.85+.15*layer;
 // Only the moving upper skin becomes pale: keep submerged colors saturated.
 color=mix(submerged,vec3(.62,.43,.96),smoothstep(.82,.98,layer));
 color=mix(color,vec3(1.,.90,1.),crest);
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(pixels*.156*(.65+s.y*.25)/-mv.z,13.2,43.2);
 sphereCenter=mv.xyz;sphereRadius=gl_PointSize*(-mv.z)/(pixels*projectionMatrix[1][1]);
 }`,fragmentShader:`
 uniform float fade;uniform mat4 projectionMatrix;
 varying vec3 color,sphereCenter;varying float sphereRadius;
 void main(){
  vec2 q=gl_PointCoord*2.-1.;q.y=-q.y;float r2=dot(q,q);if(r2>=1.)discard;
  // Analytic sphere surface, with per-fragment depth and a solid unlit color.
  vec3 N=vec3(q,sqrt(1.-r2)),surface=sphereCenter+N*sphereRadius;
  vec4 clip=projectionMatrix*vec4(surface,1.);gl_FragDepth=clip.z/clip.w*.5+.5;
  float edge=1.-smoothstep(1.-fwidth(r2),1.,r2);
  gl_FragColor=vec4(color,fade*edge);
 }`});
 const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;
 return {mesh,update(t,vortex,opacity,pixels){material.uniforms.time.value=t;material.uniforms.swirl.value=vortex;material.uniforms.fade.value=opacity;material.uniforms.pixels.value=pixels;mesh.visible=opacity>.001;}};
}
