import * as THREE from './vendor/three.module.js';
// Dense, correlated sheets of grains form rolling fluid and bright foam crests.
export function makeTide(mobile){
 const count=mobile?34000:105000,a=new Float32Array(count*3);let seed=42;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<count*3;i++)a[i]=rand();
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(a,3));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},swirl:{value:0},fade:{value:1},pixels:{value:700}},vertexShader:`
 uniform float time,swirl,pixels;varying vec3 color;varying float strength;
 float wave(vec2 p,float t){return sin(p.x*2.8+t)*.42+sin(p.y*4.8-p.x*1.6-t*.82)*.24+sin(p.x*6.+p.y*5.+t*.7)*.095;}
 void main(){vec3 s=position;float t=time*.67;vec2 uv=(s.xz-.5)*vec2(2.84,1.15);
 // Domain warping bends the wave ridges into a connected, moving flow field.
 vec2 q=uv+vec2(sin(uv.y*4.+t*.8),cos(uv.x*2.4-t*.7))*.19;
 float h=wave(q,t),curl=sin(q.x*3.3+q.y*4.-t*1.3);float layer=mix(s.y*3.,.92+s.y*.08,step(.18,s.y));
 vec3 water=vec3(uv.x+.055*sin(q.y*8.+t),-.36+layer*(.92+h)+.05*sin(q.y*9.+q.x*5.+t),uv.y+.035*cos(q.x*7.-t));
 float theta=s.x*6.283185+t*(.9+swirl*.8)+s.y*2.6+.30*sin(s.z*9.-t);
 float r=.18+1.23*sqrt(s.z),ridge=sin(theta*2.+s.z*5.-t);
 vec3 vortex=vec3(cos(theta)*r,-.38+layer*(1.42+.50*ridge)+.16*sin(theta+s.z*8.+t),sin(theta)*r*.41);
 vec3 p=mix(water,vortex,swirl);p.x=clamp(p.x,-1.46,1.46);p.z=clamp(p.z,-.63,.63);p.y=clamp(p.y,-.45,2.08);
 float crest=smoothstep(.40,.96,s.y)*smoothstep(-.25,.62,mix(h+curl*.17,ridge,swirl));
 float glints=pow(max(0.,sin(s.x*193.+s.z*127.)),10.);
 color=mix(vec3(.065,.027,.23),vec3(.53,.31,1.),smoothstep(.20,.92,s.y));color=mix(color,vec3(1.0,.88,1.0),crest);
 strength=mix(.12,.48,smoothstep(.15,.95,s.y))+crest*.55+glints*.14;
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(pixels*.011*(.65+s.y*.25)/-mv.z,1.,3.0);
 }`,fragmentShader:`uniform float fade;varying vec3 color;varying float strength;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(color*2.2,exp(-d*d*3.5)*strength*fade);}`});
 const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;
 return {mesh,update(t,vortex,opacity,pixels){material.uniforms.time.value=t;material.uniforms.swirl.value=vortex;material.uniforms.fade.value=opacity;material.uniforms.pixels.value=pixels;mesh.visible=opacity>.001;}};
}
