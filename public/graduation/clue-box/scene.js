import * as THREE from './gemos-still-base/vendor/three.module.js';
import {buildComputer} from './gemos-still-base/computer.js';
import {createStudio} from './gemos-still-base/studio.js';
import {MemoryGaussians} from './renderer/gaussian.js';

/** Local photo card, real Gaussian model and object-first workshop controls. */
export function createClueScene(stage,callbacks={}){
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.1;stage.append(renderer.domElement);
 renderer.domElement.style.touchAction='none';renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','线索盒三维工作台：点照片卡选照片，点热点推进，抓住盒子边框拖入收藏位置。键盘 P 选照片，H 推进热点，C 收藏，A 打开收藏，方向键旋转，加减键缩放。');
 const scene=new THREE.Scene();scene.background=new THREE.Color('#15131e');scene.fog=new THREE.FogExp2('#15131e',.029);
 const studio=createStudio(renderer);scene.environment=studio.environment;scene.environmentIntensity=.5;
 const camera=new THREE.PerspectiveCamera(32,1,.1,100),target=new THREE.Vector3(.35,.25,-.45);
 let azimuth=.43,elevation=.23,fitDistance=10.8,zoomFactor=1,active=true,frameId=0,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,time=0,disposed=false;
 const glass=new THREE.MeshPhysicalMaterial({color:'#d8dbe1',roughness:.08,metalness:.1,transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.6});
 const grain=new THREE.TextureLoader().load(new URL('./gemos-still-base/baked/abs-height.png',import.meta.url).href);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;
 const computer=buildComputer(glass,grain);scene.add(computer.group);
 const upper=new THREE.Group();upper.name='Separable display box';computer.group.add(upper);
 computer.group.updateMatrixWorld(true);
 const grabSurfaces=[];
 for(const child of [...computer.group.children]){
  if(child===upper)continue;
  const bounds=new THREE.Box3().setFromObject(child);
  if(bounds.max.y>-.84){upper.attach(child);if(child!==computer.glass)grabSurfaces.push(child);}
 }
 computer.glass.renderOrder=3;
 scene.add(new THREE.HemisphereLight('#ffffff','#544752',1.05));
 for(const [p,c,intensity]of [[[-4,7,6],'#fff1da',2.2],[[4,3,0],'#b6c7ff',.8]]){const light=new THREE.DirectionalLight(c,intensity);light.position.set(...p);scene.add(light);}
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#25212f',roughness:.86}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.77;scene.add(floor);
 const grid=new THREE.GridHelper(40,40,'#79618d','#494153');grid.position.y=-1.765;grid.material.transparent=true;grid.material.opacity=.11;scene.add(grid);
 const halo=new THREE.Mesh(new THREE.RingGeometry(2.35,2.365,96),new THREE.MeshBasicMaterial({color:'#a185bd',transparent:true,opacity:.2,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.set(0,-1.762,-.45);scene.add(halo);
 const props=new THREE.Group();scene.add(props);
 function label(text,width=1.6){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const ctx=cv.getContext('2d');
  ctx.fillStyle='#ded0eb';ctx.font='32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
  const map=new THREE.CanvasTexture(cv);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
 }
 const photoCard=new THREE.Group();photoCard.name='真实照片卡 / 点击选择照片';photoCard.position.set(-2.65,.15,1.02);photoCard.rotation.y=.12;props.add(photoCard);
 const cardBacking=new THREE.Mesh(new THREE.BoxGeometry(1.43,1.67,.06),new THREE.MeshStandardMaterial({color:'#d9ceba',roughness:.67}));photoCard.add(cardBacking);
 const cardFace=new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.2),new THREE.MeshBasicMaterial({color:'#83708f',side:THREE.DoubleSide}));cardFace.position.set(0,.09,.038);photoCard.add(cardFace);
 const cardLabel=label('＋ 选择照片',1.23);cardLabel.position.set(0,-.65,.04);photoCard.add(cardLabel);
 const cardStand=new THREE.Mesh(new THREE.BoxGeometry(.85,.12,.7),new THREE.MeshStandardMaterial({color:'#847388',roughness:.65}));cardStand.position.set(-2.65,-1.54,1.02);props.add(cardStand);
 const cardStem=new THREE.Mesh(new THREE.BoxGeometry(.065,.76,.06),new THREE.MeshStandardMaterial({color:'#847388'}));cardStem.position.set(-2.65,-1.07,1.02);props.add(cardStem);
 const archive=new THREE.Group();archive.name='共同收藏入口 / 盒子放置处';archive.position.set(4.35,-.78,-.45);props.add(archive);
 const tray=new THREE.Mesh(new THREE.BoxGeometry(3.72,.15,3.6),new THREE.MeshStandardMaterial({color:'#51415d',roughness:.55,metalness:.1}));tray.position.set(0,-.08,-.3);archive.add(tray);
 const trayEdges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.72,.18,3.6)),new THREE.LineBasicMaterial({color:'#bda2d8',transparent:true,opacity:.65}));trayEdges.position.copy(tray.position);archive.add(trayEdges);
 const trayLeg=new THREE.Mesh(new THREE.BoxGeometry(.13,.83,.13),new THREE.MeshStandardMaterial({color:'#776782'}));trayLeg.position.set(0,-.57,-.3);archive.add(trayLeg);
 const archiveLabel=label('收藏 / 把盒子放在这里',2.48);archiveLabel.position.set(0,-.26,1.56);archive.add(archiveLabel);
 const archivePortal=new THREE.Mesh(new THREE.BoxGeometry(1.16,.72,.16),new THREE.MeshStandardMaterial({color:'#6c517d',roughness:.4}));archivePortal.position.set(0,.26,-2.14);archive.add(archivePortal);
 const portalLabel=label('打开收藏 ↗',1.08);portalLabel.position.set(0,.26,-2.047);archive.add(portalLabel);
 const handle=new THREE.Mesh(new THREE.BoxGeometry(1.1,.1,.15),new THREE.MeshStandardMaterial({color:'#9e80b4',roughness:.4}));handle.position.set(0,2.4,.1);upper.add(handle);grabSurfaces.push(handle);
 const grabLabel=label('抓住盒子',.92);grabLabel.position.set(0,2.55,.16);upper.add(grabLabel);
 let model=null,photoMesh=null,photoTexture=null,photoWidth=2.75,photoHeight=2.2,photoEpoch=0,hotspot={x:.32,y:.66,radius:.22},phase=0,enabled=true,animation=null,parked=false,collectable=false,stepStarted=false;
 const marker=new THREE.Mesh(new THREE.RingGeometry(.12,.145,48),new THREE.MeshBasicMaterial({color:'#d9c1ff',transparent:true,opacity:.8,depthTest:true,depthWrite:false,side:THREE.DoubleSide}));marker.renderOrder=5;upper.add(marker);
 const contentHit=new THREE.Mesh(new THREE.PlaneGeometry(3.08,2.74),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide}));contentHit.position.set(0,.84,.785);upper.add(contentHit);
 const terminalBounds=new THREE.Box3().setFromObject(computer.group),fitBounds=terminalBounds.clone();fitBounds.expandByObject(props);
 const resolution=new THREE.Vector2(),inverseBox=new THREE.Matrix4();
 const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),dragPlane=new THREE.Plane(),grabOffset=new THREE.Vector3(),planePoint=new THREE.Vector3();
 const pointers=new Map();let gesture=null,gestureSpan=0,interactionEnabled=true;
 function emit(name,...args){if(typeof callbacks[name]==='function')callbacks[name](...args);}
 function fitCamera(){
  const back=new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),back).normalize(),up=new THREE.Vector3().crossVectors(back,right);
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5),tanX=tanY*camera.aspect;fitDistance=0;
  for(const x of [fitBounds.min.x,fitBounds.max.x])for(const y of [fitBounds.min.y,fitBounds.max.y])for(const z of [fitBounds.min.z,fitBounds.max.z]){const v=new THREE.Vector3(x,y,z).sub(target);fitDistance=Math.max(fitDistance,v.dot(back)+Math.max(Math.abs(v.dot(right))/tanX,Math.abs(v.dot(up))/tanY)/.79);}
 }
 function setCamera(){const distance=fitDistance*zoomFactor;camera.position.set(target.x+Math.sin(azimuth)*Math.cos(elevation)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(azimuth)*Math.cos(elevation)*distance);camera.lookAt(target);}
 function updateModel(sync=false){
  if(!model)return;scene.updateMatrixWorld(true);inverseBox.copy(upper.matrixWorld).invert();
  model.material.uniforms.clipFrame.value.copy(inverseBox);model.material.uniforms.time.value=time;
  renderer.getDrawingBufferSize(resolution);if(sync)model.sortSynchronously(camera);model.update(camera,resolution);
 }
 function render(sync=false){if(disposed)return;updateModel(sync);upper.updateMatrixWorld(true);const parentRotation=upper.getWorldQuaternion(new THREE.Quaternion()).invert();marker.quaternion.copy(parentRotation).multiply(camera.quaternion);renderer.render(scene,camera);}
 function resize(){if(disposed)return;const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;
  const portrait=camera.aspect<.8;
  // Keep the complete desk legible in a portrait viewport: its virtual
  // collection tray sits above the terminal rather than widening the scene.
  archive.scale.setScalar(portrait?.64:1);archive.position.set(portrait?.45:4.35,portrait?3.35:-.78,portrait?-1.2:-.45);
  photoCard.scale.setScalar(portrait?.65:1);photoCard.position.set(portrait?-2.03:-2.65,.15,1.02);
  cardStand.position.x=cardStem.position.x=photoCard.position.x;
  scene.fog.density=portrait?.014:.029;fitBounds.copy(terminalBounds);props.updateMatrixWorld(true);fitBounds.expandByObject(props);
  if(parked)upper.position.copy(collectionPosition());
  camera.updateProjectionMatrix();fitCamera();setCamera();if(active)render();}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);
 function mark(){
  marker.position.set((hotspot.x-.5)*photoWidth,.84+(.5-hotspot.y)*photoHeight,.79);marker.visible=enabled;
  marker.scale.setScalar(Math.max(.7,Math.min(1.6,hotspot.radius*5)));
  if(model){model.updateMatrix();marker.position.copy(model.hotspotPosition(hotspot).applyMatrix4(model.matrix));model.material.uniforms.hotspot.value.set(hotspot.x,hotspot.y);model.material.uniforms.hotspotRadius.value=hotspot.radius;model.material.uniforms.hotspotEnabled.value=enabled?1:0;}
  if(photoMesh){photoMesh.material.uniforms.hotspot.value.set(hotspot.x,hotspot.y);photoMesh.material.uniforms.radius.value=hotspot.radius;photoMesh.material.uniforms.enabled.value=enabled?1:0;}
 }
 function setPhase(value){phase=Math.max(0,Math.min(2,Math.round(Number(value)||0)));marker.material.color.set(['#d9c1ff','#89c7ff','#a5e5b7'][phase]);if(model)model.material.uniforms.phase.value=phase;if(photoMesh)photoMesh.material.uniforms.phase.value=phase;render();}
 function setHotspot(value){hotspot={x:THREE.MathUtils.clamp(Number(value.x)||0,0,1),y:THREE.MathUtils.clamp(Number(value.y)||0,0,1),radius:THREE.MathUtils.clamp(Number(value.radius)||.22,.05,.45)};mark();render();}
 function clearModel(){if(model){upper.remove(model);model.dispose();model=null;}stage.dataset.modelKind='photo';}
 function clearPhotoPlane(){if(photoMesh){upper.remove(photoMesh);photoMesh.geometry.dispose();photoMesh.material.dispose();photoMesh=null;}}
 async function setPhoto(src){
  const epoch=++photoEpoch,im=new Image();im.src=src;await im.decode();if(epoch!==photoEpoch||disposed)return;
  const nextTexture=new THREE.Texture(im);nextTexture.colorSpace=THREE.SRGBColorSpace;nextTexture.needsUpdate=true;
  clearModel();clearPhotoPlane();collectable=false;stepStarted=false;handle.material.color.set('#7f7189');cardFace.material.map=nextTexture;cardFace.material.color.set('#ffffff');cardFace.material.needsUpdate=true;
  const aspect=im.naturalWidth/im.naturalHeight,cardAspect=1.25/1.2;cardFace.scale.set(Math.min(1,aspect/cardAspect),Math.min(1,cardAspect/aspect),1);
  if(photoTexture)photoTexture.dispose();photoTexture=nextTexture;
  photoWidth=2.75;photoHeight=photoWidth/aspect;if(photoHeight>2.55){photoWidth*=2.55/photoHeight;photoHeight=2.55;}
  // A real flat photograph stays flat. It is never converted from brightness
  // into invented depth, and is clearly separate from the inference model.
  const material=new THREE.ShaderMaterial({transparent:false,side:THREE.DoubleSide,uniforms:{photo:{value:photoTexture},hotspot:{value:new THREE.Vector2()},radius:{value:.22},enabled:{value:1},phase:{value:phase}},vertexShader:'varying vec2 vUV;void main(){vUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform sampler2D photo;uniform vec2 hotspot;uniform float radius,enabled,phase;varying vec2 vUV;void main(){vec3 color=texture2D(photo,vUV).rgb;float h=(1.-smoothstep(radius*.65,radius,distance(vec2(vUV.x,1.-vUV.y),hotspot)))*enabled;vec3 accent=phase<.5?vec3(.78,.55,1.):phase<1.5?vec3(.46,.76,1.):vec3(.65,.92,.73);gl_FragColor=vec4(mix(color,accent,h*.2),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`});
  photoMesh=new THREE.Mesh(new THREE.PlaneGeometry(photoWidth,photoHeight),material);photoMesh.position.set(0,.84,-.64);upper.add(photoMesh);mark();render();
 }
 function setModel(buffer,options={}){
  if(disposed)throw new Error('工作台已关闭。');const next=new MemoryGaussians(buffer);
  const bounds=next.fullBounds,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.x+size.y+size.z)||Math.min(size.x,size.y)<=0){next.dispose();throw new Error('三维模型坐标不完整。');}
  // One scale factor preserves the source covariance and proportions; the
  // modelView matrix supplies S*C*S^T, including the display-box transform.
  const scale=Math.min(3.02/Math.max(size.x,.01),2.64/Math.max(size.y,.01),3.22/Math.max(size.z,.01));
  next.scale.setScalar(scale);next.position.copy(center).multiplyScalar(-scale).add(new THREE.Vector3(0,.84,-.98));
  next.material.uniforms.photoBounds.value.set(bounds.min.x,bounds.min.y,bounds.max.x,bounds.max.y);
  next.material.uniforms.hasPhotoUV.value=options.photoUV||options.hasPhotoUV?1:0;
  next.material.uniforms.clipMin.value.set(-1.54,-.53,-2.66);next.material.uniforms.clipMax.value.set(1.54,2.21,.66);
  next.material.uniforms.phase.value=phase;clearModel();clearPhotoPlane();model=next;upper.add(model);
  photoWidth=size.x*scale;photoHeight=size.y*scale;stage.dataset.modelKind='gaussian';mark();render(true);
  stepStarted=false;
  return {count:model.count,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},photoUV:!!next.material.uniforms.hasPhotoUV.value};
 }
 function home(){upper.position.set(0,0,0);upper.rotation.set(0,0,0);parked=false;tray.material.color.set('#51415d');render();}
 function releasePointers(){for(const id of pointers.keys())if(renderer.domElement.hasPointerCapture(id))renderer.domElement.releasePointerCapture(id);pointers.clear();gesture=null;gestureSpan=0;stage.style.cursor='grab';}
 function animateTo(position,duration=450){
  if(animation)return Promise.reject(new Error('请等盒子移动完成'));releasePointers();
  return new Promise(resolve=>{animation={start:performance.now(),duration:paused?120:duration,from:upper.position.clone(),to:position.clone(),fromRotation:upper.rotation.y,toRotation:position.x>2?-.12:0,resolve};schedule();});
 }
 function returnBox(){if(animation){const resolve=animation.resolve;animation=null;resolve(false);}releasePointers();home();}
 function collectionPosition(){return new THREE.Vector3(archive.position.x,archive.position.y+.79,archive.position.z-.22*archive.scale.z);}
 function lift(){if(!collectable)return Promise.reject(new Error('请先生成三维场景并确认适配的科普主题'));if(parked)return Promise.resolve();if(gesture?.mode==='drag')return Promise.reject(new Error('请先放开盒子'));return animateTo(collectionPosition(),paused?200:1100).then(completed=>{if(completed)parked=true;});}
 function dropReady(){const destination=collectionPosition();return Math.abs(upper.position.x-destination.x)<Math.max(.9,1.65*archive.scale.x)&&Math.abs(upper.position.z-destination.z)<2.2&&Math.abs(upper.position.y-destination.y)<2.3;}
 function setRay(event){const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return false;ndc.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);scene.updateMatrixWorld(true);camera.updateMatrixWorld();raycaster.setFromCamera(ndc,camera);return true;}
 function hit(event){
  if(!setRay(event))return null;
  const first=(objects,recursive=true)=>raycaster.intersectObjects(objects,recursive)[0];
  if(enabled){const selected=first([marker]);if(selected)return {role:'step',point:selected.point};}
  if(first([photoCard]))return {role:'photo'};
  if(first([archivePortal,portalLabel]))return {role:'archive'};
  const rim=first(grabSurfaces);if(rim)return {role:'grab',point:rim.point};
  const content=first([contentHit]);if(content){const local=upper.worldToLocal(content.point.clone());return {role:'hotspot',uv:{x:THREE.MathUtils.clamp((local.x/photoWidth)+.5,0,1),y:THREE.MathUtils.clamp(.5-(local.y-.84)/photoHeight,0,1)}};}
  if(first([tray,archiveLabel]))return {role:'archive'};return null;
 }
 function span(){const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
 function pointerDown(event){
  if(!active||!interactionEnabled||animation||(event.pointerType==='mouse'&&event.button!==0))return;
  renderer.domElement.focus({preventScroll:true});event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
  if(pointers.size===1){const selected=hit(event);gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,selected,mode:selected?.role==='grab'?'drag':'orbit'};
   if(gesture.mode==='drag'){const world=upper.getWorldPosition(new THREE.Vector3());dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),world);if(raycaster.ray.intersectPlane(dragPlane,planePoint))grabOffset.copy(planePoint).sub(world);stage.style.cursor='grabbing';}
  }else if(gesture){
   // A second touch always becomes camera pinch, never a simultaneous box drag.
   if(gesture.mode==='drag'){home();}gesture.mode='pinch';gesture.moved=true;
  }
  gestureSpan=span();
 }
 function pointerMove(event){
  const previous=pointers.get(event.pointerId);
  if(!previous){if(event.pointerType==='mouse'&&active&&interactionEnabled&&!animation){const role=hit(event)?.role;stage.style.cursor=role==='grab'?'grab':role?'pointer':'grab';}return;}
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(!gesture)return;if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>7)gesture.moved=true;
  if(pointers.size===2){const next=span();if(gestureSpan>5&&next>5)zoomFactor=THREE.MathUtils.clamp(zoomFactor*gestureSpan/next,.65,1.65);gestureSpan=next;setCamera();}
  else if(pointers.size===1&&gesture.mode==='drag'){
   if(!gesture.moved)return;setRay(event);if(raycaster.ray.intersectPlane(dragPlane,planePoint)){const world=planePoint.clone().sub(grabOffset);upper.position.copy(computer.group.worldToLocal(world));upper.position.x=THREE.MathUtils.clamp(upper.position.x,-2.8,6.3);upper.position.y=THREE.MathUtils.clamp(upper.position.y,-.25,5.7);upper.position.z=THREE.MathUtils.clamp(upper.position.z,-3.3,2.6);upper.rotation.y=0;parked=false;tray.material.color.set(dropReady()?'#9271ab':'#51415d');}
  }else if(pointers.size===1&&gesture.mode==='orbit'&&gesture.moved){azimuth-=dx*.006;elevation=THREE.MathUtils.clamp(elevation+dy*.004,.05,.9);setCamera();}
  render();
 }
 function pointerEnd(event){
  if(!pointers.has(event.pointerId))return;
  const ended=gesture,pointerCount=pointers.size;pointers.delete(event.pointerId);gestureSpan=span();
  if(pointerCount===2){if(gesture){gesture.mode='orbit';gesture.moved=true;gesture.id=[...pointers.keys()][0];}return;}
  gesture=null;if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
  if(event.type==='pointercancel'||event.type==='lostpointercapture'){if(ended?.mode==='drag')home();return;}
  if(ended?.mode==='drag'&&ended.moved){
   if(!collectable){emit('onHint','请先生成三维场景并确认适配的科普主题，再收藏盒子。');void animateTo(new THREE.Vector3(),300);return;}
   if(dropReady()){upper.position.copy(collectionPosition());upper.rotation.y=-.12;parked=true;tray.material.color.set('#51415d');render();emit('onCollect');}
   else void animateTo(new THREE.Vector3(),300);return;
  }
  if(!ended||ended.moved)return;const selected=hit(event);
  if(selected?.role!==ended.selected?.role)return;
  if(selected?.role==='photo')emit('onPhoto');
  else if(selected?.role==='archive')emit('onArchive');
  else if(selected?.role==='step'&&enabled)advanceStep();
  else if(selected?.role==='hotspot'&&enabled){
   const picked=model?model.pick(ndc,camera):selected.uv;if(!picked)return;
   setHotspot({...hotspot,x:picked.x,y:picked.y});emit('onHotspot',{...hotspot});setPhase(0);stepStarted=true;emit('onStep',phase);
  }
 }
 function advanceStep(){setPhase(stepStarted?(phase+1)%3:0);stepStarted=true;emit('onStep',phase);}
 function keyDown(event){
  if(!active||!interactionEnabled||animation||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.target.closest?.('input,textarea,select,button,a,[contenteditable="true"]'))return;
  const key=event.key.toLowerCase();
  if(key==='p')emit('onPhoto');else if(key==='a')emit('onArchive');else if(key==='h'&&enabled)advanceStep();
  else if(key==='c'){if(collectable)emit('onCollect');else emit('onHint','请先生成三维场景并确认适配的科普主题，再收藏盒子。');}
  else if(key==='arrowleft')azimuth+=.1;else if(key==='arrowright')azimuth-=.1;else if(key==='arrowup')elevation=THREE.MathUtils.clamp(elevation+.05,.05,.9);else if(key==='arrowdown')elevation=THREE.MathUtils.clamp(elevation-.05,.05,.9);else if(key==='+'||key==='=')zoomFactor=Math.max(.65,zoomFactor*.9);else if(key==='-')zoomFactor=Math.min(1.65,zoomFactor*1.1);else return;
  event.preventDefault();setCamera();render();
 }
 function wheel(event){if(!active||!interactionEnabled||animation||gesture?.mode==='drag')return;event.preventDefault();zoomFactor=THREE.MathUtils.clamp(zoomFactor*Math.exp(event.deltaY*.001),.65,1.65);setCamera();render();}
 function blur(){if(gesture?.mode==='drag')home();releasePointers();}
 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,pointerEnd);
 canvas.addEventListener('wheel',wheel,{passive:false});stage.addEventListener('keydown',keyDown);window.addEventListener('blur',blur);
 let last=performance.now();
 function schedule(){if(!disposed&&!frameId)frameId=requestAnimationFrame(loop);}
 function loop(now){
  frameId=0;if(disposed||(!active&&!animation))return;schedule();
  if(document.hidden){last=now;return;}const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt;
  marker.material.opacity=paused?.8:.7+Math.sin(time*2)*.12;
  if(animation){const t=Math.min(1,(now-animation.start)/animation.duration),ease=t*t*(3-2*t);upper.position.lerpVectors(animation.from,animation.to,ease);upper.position.y+=Math.sin(t*Math.PI)*.85;upper.rotation.y=THREE.MathUtils.lerp(animation.fromRotation,animation.toRotation,ease);if(t>=1){const resolve=animation.resolve;upper.position.copy(animation.to);animation=null;resolve(true);}}
  if(active)render();
 }
 function captureBox(){
  const base=computer.group.children.filter(child=>child!==upper).map(child=>[child,child.visible]),decorations=[floor,grid,halo,props,grabLabel,handle,contentHit].map(node=>[node,node.visible]);
  const position=camera.position.clone(),quaternion=camera.quaternion.clone(),aspect=camera.aspect,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
  const boxPosition=upper.position.clone(),boxQuaternion=upper.quaternion.clone();
  for(const [node]of [...base,...decorations])node.visible=false;upper.position.set(0,0,0);upper.rotation.set(0,0,0);
  renderer.setPixelRatio(1);renderer.setSize(1200,900,false);camera.aspect=4/3;camera.updateProjectionMatrix();camera.position.set(2.6,2.2,6.7);camera.lookAt(0,.84,-.9);
  try{render(true);return canvas.toDataURL('image/png');}
  finally{for(const [node,visible]of [...base,...decorations])node.visible=visible;upper.position.copy(boxPosition);upper.quaternion.copy(boxQuaternion);renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);camera.aspect=aspect;camera.updateProjectionMatrix();camera.position.copy(position);camera.quaternion.copy(quaternion);render(true);}
 }
 mark();resize();schedule();
 return {
  setPhoto,setModel,setHotspot,getHotspot(){return {...hotspot};},setPhase,
  hasPhotoUV(){return !!model?.material.uniforms.hasPhotoUV.value;},getHotspotMode(){return model?.material.uniforms.hasPhotoUV.value?'photo-uv':'scene-projection';},
  setEnabled(value){enabled=!!value;if(!enabled)stepStarted=false;mark();render();},setPaused(value){paused=!!value;},
  setCollectable(value){collectable=!!value;handle.material.color.set(collectable?'#b09bcc':'#7f7189');if(!collectable&&gesture?.mode==='drag')blur();render();},
  setInteractionEnabled(value){interactionEnabled=!!value;if(!interactionEnabled)blur();},
  setActive(value){active=!!value;last=performance.now();if(active){resize();schedule();}else{blur();if(!animation&&frameId){cancelAnimationFrame(frameId);frameId=0;}}},
  reset(){returnBox();azimuth=.43;elevation=.23;zoomFactor=1;fitCamera();setCamera();render();},returnBox,
  capture(){render(true);return canvas.toDataURL('image/png');},captureBox,lift,
  getState(){return {phase,hotspot:{...hotspot},hasPhotoUV:!!model?.material.uniforms.hasPhotoUV.value,hotspotMode:model?.material.uniforms.hasPhotoUV.value?'photo-uv':'scene-projection',modelKind:model?'gaussian':'photo',modelCount:model?.count||0,parked,collectable,dragging:gesture?.mode==='drag',position:upper.position.toArray()};},
  dispose(){if(disposed)return;returnBox();disposed=true;cancelAnimationFrame(frameId);resizeObserver.disconnect();window.removeEventListener('blur',blur);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.removeEventListener(name,pointerEnd);canvas.removeEventListener('wheel',wheel);stage.removeEventListener('keydown',keyDown);clearModel();clearPhotoPlane();photoTexture?.dispose();scene.traverse(node=>{node.geometry?.dispose();const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials)if(material){if(material.map!==photoTexture)material.map?.dispose();material.dispose();}});grain.dispose();renderer.dispose();canvas.remove();}
 };
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
