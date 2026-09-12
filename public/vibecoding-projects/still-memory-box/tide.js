import * as THREE from './vendor/three.module.js';
export function makeTide(mobile){
 const count=mobile?7000:18000,a=new Float32Array(count*3);let seed=42;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<count*3;i++)a[i]=rand();
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(a,3));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},swirl:{value:0},fade:{value:1},pixels:{value:700}},vertexShader:`uniform float time,swirl,pixels;varying vec3 color;varying float strength;
 void main(){vec3 s=position;float angle=s.x*6.283185+time*(.35+swirl*1.1)+s.y*swirl*4.;float r=sqrt(s.z)*1.42;vec3 water=vec3((s.x-.5)*2.92,.15+s.y*.75+sin(s.x*8.+time*.9)*.12+cos(s.z*9.+time*.7)*.10,(s.z-.5)*1.22);vec3 vortex=vec3(cos(angle)*r,-.43+s.y*2.53+sin(angle*2.+time)*.08,sin(angle)*r*.43);vec3 p=mix(water,vortex,swirl);color=.52+.48*cos(6.28318*(s.y+s.x*.35+vec3(0.,.33,.67)));strength=.45+s.z*.55;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(pixels*.012*(.45+s.y*.65)/-mv.z,1.,5.);}`,fragmentShader:`uniform float fade;varying vec3 color;varying float strength;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(color*1.65,exp(-d*d*3.)*strength*fade*.85);}`});
 const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;
 return {mesh,update(t,vortex,opacity,pixels){material.uniforms.time.value=t;material.uniforms.swirl.value=vortex;material.uniforms.fade.value=opacity;material.uniforms.pixels.value=pixels;mesh.visible=opacity>.001;}};
}
