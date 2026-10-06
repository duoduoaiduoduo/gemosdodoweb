import * as THREE from './gemos-still-base/vendor/three.module.js';
import {buildComputer} from './gemos-still-base/computer.js';
import {createStudio} from './gemos-still-base/studio.js';

export function createClueScene(stage){
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.1;stage.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#15131e');scene.fog=new THREE.FogExp2('#15131e',.029);
 const studio=createStudio(renderer);scene.environment=studio.environment;scene.environmentIntensity=.5;
 const camera=new THREE.PerspectiveCamera(32,1,.1,100),target=new THREE.Vector3(0,.25,-.45);
 let azimuth=.43,elevation=.23,distance=10.8,fitDistance=10.8,zoomFactor=1,active=true,frameId=0,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,time=0;
 const glass=new THREE.MeshPhysicalMaterial({color:'#d8dbe1',roughness:.08,metalness:.1,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.6});
 const grain=new THREE.TextureLoader().load('./gemos-still-base/baked/abs-height.png');grain.wrapS=grain.wrapT=THREE.RepeatWrapping;
 const computer=buildComputer(glass,grain);scene.add(computer.group);
 const upper=new THREE.Group();upper.name='Separable display box';computer.group.add(upper);
 computer.group.updateMatrixWorld(true);
 for(const child of [...computer.group.children]){if(child===upper)continue;const bounds=new THREE.Box3().setFromObject(child);if(bounds.max.y>-.84)upper.attach(child);}
 scene.add(new THREE.HemisphereLight('#ffffff','#544752',1.05));
 for(const [p,c,intensity] of [[[-4,7,6],'#fff1da',2.2],[[4,3,0],'#b6c7ff',.8]]){const light=new THREE.DirectionalLight(c,intensity);light.position.set(...p);scene.add(light);}
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#25212f',roughness:.86}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.77;scene.add(floor);
 const grid=new THREE.GridHelper(40,40,'#79618d','#494153');grid.position.y=-1.765;grid.material.transparent=true;grid.material.opacity=.11;scene.add(grid);
 const halo=new THREE.Mesh(new THREE.RingGeometry(2.35,2.365,96),new THREE.MeshBasicMaterial({color:'#a185bd',transparent:true,opacity:.2,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.set(0,-1.762,-.45);scene.add(halo);
 let points=null,photoWidth=2.75,photoHeight=2.2,hotspot={x:.32,y:.66,radius:.22},animation=null;
 const marker=new THREE.Mesh(new THREE.RingGeometry(.13,.145,48),new THREE.MeshBasicMaterial({color:'#d9c1ff',transparent:true,opacity:.8,depthTest:false}));marker.material.depthTest=true;marker.renderOrder=10;upper.add(marker);
 const modelBounds=new THREE.Box3().setFromObject(computer.group);
 function fitCamera(){
  const back=new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),back).normalize(),up=new THREE.Vector3().crossVectors(back,right);
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5),tanX=tanY*camera.aspect;
  fitDistance=0;const fill=camera.aspect<.8?.68:.76;
  for(const x of [modelBounds.min.x,modelBounds.max.x])for(const y of [modelBounds.min.y,modelBounds.max.y])for(const z of [modelBounds.min.z,modelBounds.max.z]){const v=new THREE.Vector3(x,y,z).sub(target);fitDistance=Math.max(fitDistance,v.dot(back)+Math.max(Math.abs(v.dot(right))/tanX,Math.abs(v.dot(up))/tanY)/fill);}
 }
 function setCamera(){distance=fitDistance*zoomFactor;camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(azimuth)*Math.cos(elevation)*distance);camera.lookAt(target);}
 function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();fitCamera();setCamera();if(active)render();}
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
 let last=performance.now();
 function loop(now){
  frameId=0;if(!active&&!animation)return;
  frameId=requestAnimationFrame(loop);if(document.hidden)return;
  const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt;
  if(points)points.material.uniforms.time.value=time;marker.material.opacity=.65+Math.sin(time*2)*.2;
  if(animation){
   const t=Math.min(1,(now-animation.start)/animation.duration),ease=v=>{const k=THREE.MathUtils.clamp(v,0,1);return k*k*(3-2*k);};
   const rise=ease(t/.32),travel=ease((t-.32)/.43),settle=ease((t-.75)/.25);
   upper.position.set(travel*4.2,rise*1.35-settle*.85,-travel*1.4);upper.rotation.y=-travel*.18;
   if(t>=1){const resolve=animation.resolve;animation=null;upper.position.set(0,0,0);upper.rotation.y=0;resolve();}
  }
  if(active)render();
 }
 frameId=requestAnimationFrame(loop);
 const pointers=new Map();let gestureSpan=0;
 const span=()=>{const a=[...pointers.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
 stage.addEventListener('pointerdown',e=>{if(e.button!==0||animation)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gestureSpan=span();stage.setPointerCapture(e.pointerId);});
 stage.addEventListener('pointermove',e=>{const prev=pointers.get(e.pointerId);if(!prev||animation)return;const dx=e.clientX-prev.x,dy=e.clientY-prev.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){azimuth-=dx*.006;elevation=Math.max(.05,Math.min(.9,elevation+dy*.004));}else if(pointers.size===2){const next=span();if(gestureSpan>5&&next>5)zoomFactor=Math.max(.65,Math.min(1.65,zoomFactor*gestureSpan/next));gestureSpan=next;}setCamera();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{pointers.delete(e.pointerId);gestureSpan=span();});
 stage.addEventListener('wheel',e=>{e.preventDefault();if(animation)return;zoomFactor=Math.max(.65,Math.min(1.65,zoomFactor*Math.exp(e.deltaY*.001)));setCamera();},{passive:false});
 return {setPhoto,setActive(value){active=!!value;last=performance.now();if(active){resize();if(!frameId)frameId=requestAnimationFrame(loop);}else if(!animation&&frameId){cancelAnimationFrame(frameId);frameId=0;}},setHotspot(value){hotspot={...value};mark();},setPhase(phase){if(points)points.material.uniforms.phase.value=phase;marker.material.color.set(['#d9c1ff','#89c7ff','#a5e5b7'][phase]);},setEnabled(value){marker.visible=value;if(points)points.material.uniforms.enabled.value=value?1:0;},setPaused(value){paused=value;},reset(){azimuth=.43;elevation=.23;zoomFactor=1;fitCamera();setCamera();},capture(){render();return renderer.domElement.toDataURL('image/png');},captureBox(){
 const visibility=computer.group.children.map(child=>[child,child.visible]);
 const cameraPosition=camera.position.clone(),oldTarget=target.clone(),oldAspect=camera.aspect;
 const oldSize=renderer.getSize(new THREE.Vector2()),oldRatio=renderer.getPixelRatio();
 const decorations=[floor,grid,halo].map(node=>[node,node.visible]);
 for(const [child]of visibility)if(child!==upper)child.visible=false;
 for(const [node]of decorations)node.visible=false;
 renderer.setPixelRatio(1);renderer.setSize(1200,900,false);
 camera.aspect=4/3;camera.updateProjectionMatrix();target.set(0,.84,-.9);camera.position.set(2.6,2.2,6.7);camera.lookAt(target);
 if(points)points.material.uniforms.pixelRatio.value=1;
 try{render();return renderer.domElement.toDataURL('image/png');}
 finally{for(const [child,visible]of visibility)child.visible=visible;for(const [node,visible]of decorations)node.visible=visible;renderer.setPixelRatio(oldRatio);renderer.setSize(oldSize.x,oldSize.y,false);camera.aspect=oldAspect;camera.updateProjectionMatrix();target.copy(oldTarget);camera.position.copy(cameraPosition);camera.lookAt(target);if(points)points.material.uniforms.pixelRatio.value=oldRatio;render();}
 },lift(){if(animation)return Promise.reject(Error('请等盒子收藏完成'));pointers.clear();if(!frameId)frameId=requestAnimationFrame(loop);return new Promise(resolve=>{animation={start:performance.now(),duration:matchMedia('(prefers-reduced-motion:reduce)').matches?200:1900,resolve};});}};
}

export function createCollectiveScene(stage,onSelect=()=>{}){
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;stage.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#15131e');scene.fog=new THREE.FogExp2('#15131e',.035);scene.add(new THREE.HemisphereLight('#f3e9ff','#383039',2));
 const light=new THREE.DirectionalLight('#ffead4',3);light.position.set(-4,7,8);scene.add(light);
 const camera=new THREE.PerspectiveCamera(36,1,.1,100),assembly=new THREE.Group();scene.add(assembly);
 let angle=-.22,elevation=.18,targetY=.4,range=8,active=false,hovered=null,zoom=1;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#25212f',roughness:.86}));floor.rotation.x=-Math.PI/2;floor.position.y=-.53;scene.add(floor);
 const grid=new THREE.GridHelper(40,40,'#79618d','#494153');grid.position.y=-.525;grid.material.transparent=true;grid.material.opacity=.11;scene.add(grid);
 const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
 function render(){if(!active)return;assembly.rotation.y=angle;fitRange();camera.position.set(0,targetY+range*zoom*Math.sin(elevation),range*zoom*Math.cos(elevation));camera.lookAt(0,targetY,0);renderer.render(scene,camera);}
 function fitRange(){
  if(!assembly.children.length){range=8;targetY=.4;return;}
  assembly.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(assembly);
  targetY=(bounds.min.y+bounds.max.y)/2;const target=new THREE.Vector3(0,targetY,0),back=new THREE.Vector3(0,Math.sin(elevation),Math.cos(elevation)),up=new THREE.Vector3(0,Math.cos(elevation),-Math.sin(elevation));
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5),tanX=tanY*camera.aspect;range=4;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new THREE.Vector3(x,y,z).sub(target);range=Math.max(range,v.dot(back)+Math.max(Math.abs(v.x)/tanX,Math.abs(v.dot(up))/tanY)/.72);}
 }
 function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
 new ResizeObserver(resize).observe(stage);
 function hit(event){const rect=stage.getBoundingClientRect();if(!rect.width||!rect.height)return null;pointerNdc.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);camera.updateMatrixWorld();assembly.updateMatrixWorld(true);raycaster.setFromCamera(pointerNdc,camera);for(const item of raycaster.intersectObjects(assembly.children,true)){let node=item.object;while(node&&node!==assembly){if(node.userData.record)return node;node=node.parent;}}return null;}
 const pointers=new Map();let start=null,gestureSpan=0;
 const span=()=>{const a=[...pointers.values()];return a.length===2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
 stage.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===1)start={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};else if(start)start.moved=true;gestureSpan=span();stage.setPointerCapture(event.pointerId);});
 stage.addEventListener('pointermove',event=>{const prev=pointers.get(event.pointerId);if(prev){const dx=event.clientX-prev.x,dy=event.clientY-prev.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)start.moved=true;if(pointers.size===1){angle+=dx*.007;elevation=Math.max(.06,Math.min(.65,elevation+dy*.003));}else if(pointers.size===2){const next=span();if(gestureSpan>5&&next>5)zoom=Math.max(.65,Math.min(1.7,zoom*gestureSpan/next));gestureSpan=next;}render();}else if(event.pointerType==='mouse'){const next=hit(event);if(next!==hovered){if(hovered)hovered.scale.setScalar(1);hovered=next;if(hovered)hovered.scale.setScalar(1.035);stage.style.cursor=hovered?'pointer':'grab';render();}}});
 stage.addEventListener('pointerup',event=>{const selected=start?.id===event.pointerId&&!start.moved&&pointers.size===1?hit(event):null;pointers.delete(event.pointerId);start=null;gestureSpan=span();if(selected)onSelect(selected.userData.record);});
 for(const event of ['pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{pointers.delete(e.pointerId);start=null;gestureSpan=span();});
 stage.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.7,zoom*Math.exp(e.deltaY*.001)));render();},{passive:false});
 return {setActive(value){active=!!value;if(active)resize();},setRecords(records){
  hovered=null;for(const group of [...assembly.children]){assembly.remove(group);group.traverse(node=>{node.geometry?.dispose();node.material?.map?.dispose();node.material?.dispose();});}
  const subset=records.slice(0,48),columns=Math.max(1,Math.min(8,Math.ceil(Math.sqrt(subset.length*1.6)))),rows=Math.ceil(subset.length/columns);
  targetY=Math.max(.2,(rows-1)*.51);range=Math.max(5,columns*.82,rows*1.4);if(stage.clientWidth/stage.clientHeight<.8)range=Math.max(range,columns*1.9);
  subset.forEach((record,i)=>{
   const group=new THREE.Group();group.userData.record=record;group.position.set((i%columns-(columns-1)/2)*1.05,Math.floor(i/columns)*1.02,(Math.floor(i/columns)%2)*-.18);group.rotation.y=((i*17)%5-2)*.025;
   for(const [w,h,p] of [[.88,.07,[0,.44,.16]],[.88,.07,[0,-.44,.16]],[.07,.84,[-.405,0,.16]],[.07,.84,[.405,0,.16]]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.32),new THREE.MeshStandardMaterial({color:'#c9c0b2',roughness:.5}));mesh.position.set(...p);group.add(mesh);}
   const tex=new THREE.TextureLoader().load(record.photoDataUrl||record.photoUrl,loaded=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d'),im=loaded.image,side=Math.min(im.width,im.height);context.drawImage(im,(im.width-side)/2,(im.height-side)/2,side,side,0,0,256,256);loaded.image=canvas;loaded.needsUpdate=true;render();});tex.colorSpace=THREE.SRGBColorSpace;
   const photo=new THREE.Mesh(new THREE.PlaneGeometry(.77,.78),new THREE.MeshBasicMaterial({map:tex}));photo.position.z=.02;group.add(photo);
   group.add(new THREE.Mesh(new THREE.BoxGeometry(.88,.95,.5),new THREE.MeshPhysicalMaterial({color:'#d4c3eb',metalness:.05,roughness:.18,transparent:true,opacity:.09,depthWrite:false})));assembly.add(group);
  });resize();
 },render};
}
