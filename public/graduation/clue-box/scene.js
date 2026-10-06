import * as THREE from './gemos-still-base/vendor/three.module.js';
import {buildComputer} from './gemos-still-base/computer.js';
import {createStudio} from './gemos-still-base/studio.js';

export function createClueScene(stage){
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.1;stage.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#080808');
 const studio=createStudio(renderer);scene.environment=studio.environment;scene.environmentIntensity=.5;
 const camera=new THREE.PerspectiveCamera(32,1,.1,100),target=new THREE.Vector3(0,.25,-.45);
 let azimuth=.43,elevation=.23,distance=10.8,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,time=0;
 const glass=new THREE.MeshPhysicalMaterial({color:'#d8dbe1',roughness:.08,metalness:.1,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.6});
 const grain=new THREE.TextureLoader().load('./gemos-still-base/baked/abs-height.png');grain.wrapS=grain.wrapT=THREE.RepeatWrapping;
 const computer=buildComputer(glass,grain);scene.add(computer.group);
 const upper=new THREE.Group();upper.name='Separable display box';computer.group.add(upper);
 computer.group.updateMatrixWorld(true);
 for(const child of [...computer.group.children]){if(child===upper)continue;const bounds=new THREE.Box3().setFromObject(child);if(bounds.max.y>-.84)upper.attach(child);}
 scene.add(new THREE.HemisphereLight('#ffffff','#544752',1.05));
 for(const [p,c,intensity] of [[[-4,7,6],'#fff1da',2.2],[[4,3,0],'#b6c7ff',.8]]){const light=new THREE.DirectionalLight(c,intensity);light.position.set(...p);scene.add(light);}
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#121115',roughness:.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.77;scene.add(floor);
 let points=null,photoWidth=2.75,photoHeight=2.2,hotspot={x:.32,y:.66,radius:.22},animation=null;
 const marker=new THREE.Mesh(new THREE.RingGeometry(.13,.145,48),new THREE.MeshBasicMaterial({color:'#d9c1ff',transparent:true,opacity:.8,depthTest:false}));marker.renderOrder=10;upper.add(marker);
 function setCamera(){camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(azimuth)*Math.cos(elevation)*distance);camera.lookAt(target);}
 function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();setCamera();}
 new ResizeObserver(resize).observe(stage);resize();
 function mark(){marker.position.set((hotspot.x-.5)*photoWidth,.84+(.5-hotspot.y)*photoHeight,.58);if(points){points.material.uniforms.hotspot.value.set(hotspot.x,hotspot.y);points.material.uniforms.radius.value=hotspot.radius;}}
 async function setPhoto(src){
  const image=new Image();image.src=src;await image.decode();const cv=document.createElement('canvas');cv.width=140;cv.height=Math.max(50,Math.min(160,Math.round(140*image.naturalHeight/image.naturalWidth)));const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,cv.width,cv.height);const pixels=ctx.getImageData(0,0,cv.width,cv.height).data;
  photoWidth=2.75;photoHeight=2.75*image.naturalHeight/image.naturalWidth;if(photoHeight>2.55){photoWidth*=2.55/photoHeight;photoHeight=2.55;}
  const positions=[],colors=[],uv=[],seeds=[];
  for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const i=(y*cv.width+x)*4;if(pixels[i+3]<50)continue;const u=x/(cv.width-1),v=y/(cv.height-1),r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,l=r*.2126+g*.7152+b*.0722;positions.push((u-.5)*photoWidth,.84+(.5-v)*photoHeight,-.95+(l-.5)*.68);colors.push(r,g,b);uv.push(u,v);seeds.push(((x*17+y*31)%103)/103);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('photoUV',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,uniforms:{time:{value:time},phase:{value:0},hotspot:{value:new THREE.Vector2(hotspot.x,hotspot.y)},radius:{value:hotspot.radius},enabled:{value:1},pixelRatio:{value:renderer.getPixelRatio()}},vertexShader:`attribute vec2 photoUV;attribute float seed;uniform float time,phase,radius,enabled,pixelRatio;uniform vec2 hotspot;varying vec3 vColor;varying float vHot;void main(){float h=(1.-smoothstep(radius*.65,radius,distance(photoUV,hotspot)))*enabled;vHot=h;vec3 p=position;float motion=phase<.5?.014:phase<1.5?.13:.025;p.x+=h*sin(time*1.6+seed*12.)*motion;p.y+=h*cos(time*1.2+seed*9.)*motion;p.z+=h*sin(time*1.5+seed*16.)*motion;vec3 accent=phase<.5?vec3(.78,.55,1.):phase<1.5?vec3(.46,.76,1.):vec3(.65,.92,.73);vColor=mix(color,accent,h*(.55+.16*sin(time*2.+seed*5.)));vec4 pView=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*pView;gl_PointSize=clamp((2.3+h*2.3)*pixelRatio*8./max(3.,-pView.z),1.5,9.);}`,
  fragmentShader:`varying vec3 vColor;varying float vHot;void main(){float d=distance(gl_PointCoord,vec2(.5));if(d>.5)discard;float alpha=(1.-smoothstep(.27,.5,d))*.93;gl_FragColor=vec4(vColor*(1.+vHot*.35),alpha);}`});
  if(points){upper.remove(points);points.geometry.dispose();points.material.dispose();}points=new THREE.Points(geometry,material);upper.add(points);mark();render();
 }
 function render(){renderer.render(scene,camera);}
 let last=performance.now();function loop(now){requestAnimationFrame(loop);if(document.hidden)return;const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt;if(points)points.material.uniforms.time.value=time;marker.material.opacity=.65+Math.sin(time*2)*.2;
 if(animation){const t=Math.min(1,(now-animation.start)/animation.duration),k=t*t*(3-2*t);upper.position.set(Math.sin(k*Math.PI/2)*3.0,Math.sin(k*Math.PI)*2.4+k*.25,-k*2.3);upper.rotation.y=-k*.35;if(t>=1){const resolve=animation.resolve;animation=null;upper.position.set(0,0,0);upper.rotation.y=0;resolve();}}
 render();}requestAnimationFrame(loop);
 let pointer=null;
 stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);});
 stage.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;azimuth-=(e.clientX-pointer.x)*.006;elevation=Math.max(.05,Math.min(.9,elevation+(e.clientY-pointer.y)*.004));pointer.x=e.clientX;pointer.y=e.clientY;setCamera();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>pointer=null);
 stage.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(7,Math.min(15,distance*Math.exp(e.deltaY*.001)));setCamera();},{passive:false});
 return {setPhoto,setHotspot(value){hotspot={...value};mark();},setPhase(phase){if(points)points.material.uniforms.phase.value=phase;marker.material.color.set(['#d9c1ff','#89c7ff','#a5e5b7'][phase]);},setEnabled(value){marker.visible=value;if(points)points.material.uniforms.enabled.value=value?1:0;},setPaused(value){paused=value;},reset(){azimuth=.43;elevation=.23;distance=10.8;setCamera();},capture(){render();return renderer.domElement.toDataURL('image/png');},captureBox(){const visibility=computer.group.children.map(child=>[child,child.visible]),cameraPosition=camera.position.clone(),oldTarget=target.clone(),floorVisible=floor.visible;for(const [child]of visibility)if(child!==upper)child.visible=false;floor.visible=false;target.set(0,.84,-.9);camera.position.set(3.3,2.7,8.2);camera.lookAt(target);try{render();return renderer.domElement.toDataURL('image/png');}finally{for(const [child,visible]of visibility)child.visible=visible;floor.visible=floorVisible;target.copy(oldTarget);camera.position.copy(cameraPosition);camera.lookAt(target);render();}},lift(){if(animation)return Promise.reject(Error('请等盒子收藏完成'));return new Promise(resolve=>{animation={start:performance.now(),duration:matchMedia('(prefers-reduced-motion:reduce)').matches?200:1600,resolve};});}};
}

export function createCollectiveScene(stage){
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;stage.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#0c0b0e');scene.add(new THREE.HemisphereLight('#f3e9ff','#383039',2));
 const light=new THREE.DirectionalLight('#ffead4',3);light.position.set(-4,7,8);scene.add(light);
 const camera=new THREE.PerspectiveCamera(36,1,.1,100),assembly=new THREE.Group();scene.add(assembly);let angle=-.18,targetY=.4,range=8;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#18151c',roughness:.7}));floor.rotation.x=-Math.PI/2;floor.position.y=-.53;scene.add(floor);
 function render(){assembly.rotation.y=angle;camera.position.set(0,targetY+range*.18,range);camera.lookAt(0,targetY,0);renderer.render(scene,camera);}
 function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}new ResizeObserver(resize).observe(stage);resize();
 let pointer=null;stage.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX};stage.setPointerCapture(e.pointerId);});stage.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;angle+=(e.clientX-pointer.x)*.007;pointer.x=e.clientX;render();});for(const e of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(e,()=>pointer=null);
 return {setRecords(records){for(const group of [...assembly.children]){assembly.remove(group);group.traverse(node=>{node.geometry?.dispose();if(node.material?.map)node.material.map.dispose();node.material?.dispose();});}const subset=records.slice(0,48),columns=Math.max(1,Math.min(8,Math.ceil(Math.sqrt(subset.length*1.6)))),rows=Math.ceil(subset.length/columns);targetY=Math.max(.2,(rows-1)*.49);range=Math.max(5,columns*.9,rows*1.5);
  subset.forEach((record,i)=>{const group=new THREE.Group(),x=(i%columns-(columns-1)/2)*1.05,y=Math.floor(i/columns)*1.02;group.position.set(x,y,(Math.floor(i/columns)%2)*-.18);group.rotation.y=((i*17)%5-2)*.025;const frame=new THREE.MeshStandardMaterial({color:'#c9c0b2',roughness:.55});for(const [w,h,p] of [[.88,.07,[0,.44,.16]],[.88,.07,[0,-.44,.16]],[.07,.84,[-.405,0,.16]],[.07,.84,[.405,0,.16]]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.32),frame.clone());mesh.position.set(...p);group.add(mesh);}const tex=new THREE.TextureLoader().load(record.photoDataUrl||record.photoUrl,render);tex.colorSpace=THREE.SRGBColorSpace;const photo=new THREE.Mesh(new THREE.PlaneGeometry(.77,.78),new THREE.MeshBasicMaterial({map:tex}));photo.position.z=.02;group.add(photo);const glass=new THREE.Mesh(new THREE.BoxGeometry(.88,.95,.5),new THREE.MeshPhysicalMaterial({color:'#d4c3eb',metalness:.05,roughness:.18,transparent:true,opacity:.09,depthWrite:false}));group.add(glass);assembly.add(group);});resize();},render};
}
