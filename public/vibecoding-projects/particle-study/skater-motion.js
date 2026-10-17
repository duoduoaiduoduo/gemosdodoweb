// Anatomical pose targets for the skater rig: Y up, +Z travel.
// Bone targets are absolute. Twist follows the shortest rest-axis rotation,
// around the resulting head-to-tail axis, in radians.
export const PUSH_DURATION = 1.15;
export const PUSH_CONTACT_START = 0.28;
export const PUSH_CONTACT_END = 0.45;
export const PUSH_CONTACT_WINDOW = Object.freeze([PUSH_CONTACT_START, PUSH_CONTACT_END]);

const PI = Math.PI;
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length = a => Math.hypot(...a);
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const finite = (x,fallback=0) => Number.isFinite(x)?x:fallback;
const mix = (a,b,t) => a+(b-a)*t;
const unit = (v,fallback=[0,1,0]) => length(v)>1e-9?mul(v,1/length(v)):[...fallback];
const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const perpendicular = (v,axis) => sub(v,mul(axis,dot(v,axis)));
function axisRotation(v,axis,angle) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return add(add(mul(v,c),mul(cross(axis,v),s)),mul(axis,dot(axis,v)*(1-c)));
}
function fromTo(a,b) {
  a=unit(a);b=unit(b);
  const cosine=clamp(dot(a,b),-1,1),axis=cross(a,b),sine=length(axis);
  if(sine>1e-8){const n=mul(axis,1/sine),angle=Math.atan2(sine,cosine);return v=>axisRotation(v,n,angle);}
  if(cosine>0)return v=>[...v];
  const n=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,0,1]));
  return v=>axisRotation(v,n,PI);
}
function rotation(pitch=0,yaw=0,roll=0) {
  const sx=Math.sin(pitch),cx=Math.cos(pitch),sy=Math.sin(yaw),cy=Math.cos(yaw),sz=Math.sin(roll),cz=Math.cos(roll);
  return v=>{
    const y=v[1]*cx-v[2]*sx,z=v[1]*sx+v[2]*cx;
    const x=v[0]*cy+z*sy,zz=-v[0]*sy+z*cy;
    return [x*cz-y*sz,x*sz+y*cz,zz];
  };
}

// Monotone Hermite interpolation keeps the foot arcs smooth without dipping
// below a contact plane or overshooting the sideways step.
function curve(keys,x) {
  if(x<=keys[0][0])return keys[0][1];
  if(x>=keys[keys.length-1][0])return keys[keys.length-1][1];
  let i=0;while(x>keys[i+1][0])i++;
  const slope=j=>{
    if(j===0||j===keys.length-1)return 0;
    const h0=keys[j][0]-keys[j-1][0],h1=keys[j+1][0]-keys[j][0];
    const d0=(keys[j][1]-keys[j-1][1])/h0,d1=(keys[j+1][1]-keys[j][1])/h1;
    if(d0*d1<=0)return 0;
    const w0=2*h1+h0,w1=h1+2*h0;
    return (w0+w1)/(w0/d0+w1/d1);
  };
  const a=keys[i],b=keys[i+1],h=b[0]-a[0],t=(x-a[0])/h,t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*h*slope(i)+(-2*t3+3*t2)*b[1]+(t3-t2)*h*slope(i+1);
}
function solveIK(root,target,upper,lower,pole) {
  const delta=sub(target,root),rawDistance=length(delta),axis=unit(delta,[0,-1,0]);
  const distance=clamp(rawDistance,Math.abs(upper-lower)+1e-5,(upper+lower)*.985);
  const end=add(root,mul(axis,distance));
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const bend=unit(perpendicular(pole,axis),unit(perpendicular([1,0,.1],axis),[0,0,1]));
  const radius=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {joint:add(add(root,mul(axis,along)),mul(bend,radius)),end,reach:rawDistance/(upper+lower)};
}

export function createSkaterMotion(restJoints) {
  const list=Array.isArray(restJoints)?restJoints:restJoints?.joints;
  if(!Array.isArray(list))throw new TypeError('Skater motion requires a rest-joint array');
  const rest=new Map(list.map(j=>[j.name,{...j,head:[...j.head],tail:[...j.tail]}]));
  const required=['hips','spine','chest','neck','head',...['L','R'].flatMap(s=>['upper_arm','forearm','hand','thigh','shin','foot'].map(n=>`${n}.${s}`))];
  for(const name of required){
    const j=rest.get(name);
    if(!j||![...j.head,...j.tail].every(Number.isFinite)||length(sub(j.tail,j.head))<1e-6)
      throw new TypeError(`Missing or invalid skater rest joint: ${name}`);
  }
  const boneLength=name=>length(sub(rest.get(name).tail,rest.get(name).head));
  const pelvis=rest.get('hips');
  const limbs={};
  for(const side of ['L','R'])limbs[side]={
    thigh:boneLength(`thigh.${side}`),shin:boneLength(`shin.${side}`),
    upperArm:boneLength(`upper_arm.${side}`),forearm:boneLength(`forearm.${side}`),
    sign:Math.sign(rest.get(`thigh.${side}`).head[0]-pelvis.head[0])||(side==='L'?-1:1),
  };
  const legLength=(limbs.L.thigh+limbs.L.shin+limbs.R.thigh+limbs.R.shin)*.5;
  const modelUnit=clamp(legLength/.61,.78,1.18);
  const soleRestY=.13;
  const soleDeckY=.130;
  const frontX=limbs.L.sign*.025*modelUnit,rearX=limbs.R.sign*.025*modelUnit;
  const frontZ=.225*modelUnit,rearZ=-.229*modelUnit;
  const groundStrokeStart=.20*modelUnit;
  const stanceSign=-limbs.L.sign;

  function sample(options={}) {
    const time=finite(options.time),phase=clamp(finite(options.push),0,1);
    const lean=clamp(finite(options.lean),-1,1),jump=clamp(finite(options.jump),0,1);
    const speed=clamp(finite(options.speed),0,30),slope=clamp(finite(options.slope),-.8,.8);
    const scale=clamp(finite(options.scale,.30),.05,3),acceleration=clamp(finite(options.acceleration),-4,4);
    const distance=finite(options.distance),cruising=speed*speed/(speed*speed+6);
    const active=phase>0&&phase<1;
    const load=curve([[0,0],[.12,.45],[.27,1],[.45,.92],[.63,.48],[.87,.10],[1,0]],phase);
    const drive=active?Math.sin(PI*smooth(.20,.61,phase))**2:0;
    const recovery=curve([[0,0],[.45,0],[.65,1],[.86,.35],[1,0]],phase);
    const sway=(Math.sin(time*1.37)+.35*Math.sin(time*2.11+.7))*.0035*modelUnit*cruising;
    const road=Math.sin(distance*9.7+time*1.9)*.0018*modelUnit*cruising;
    const rearSign=limbs.R.sign;
    const hipYaw=stanceSign*(.48-.22*load)-.045*lean;
    const bodyRoll=-lean*.16-sway*2.5-rearSign*.025*load;
    const pelvisRotation=rotation(.055+.025*load,hipYaw,bodyRoll*.65);
    const hip=[frontX*.82*load+lean*.042*modelUnit+sway,
      soleDeckY+(rest.get('foot.L').head[1]-soleRestY)+legLength*.77-legLength*.26*load-jump*.075*modelUnit+road,
      (-.015+.054*load+.008*acceleration)*modelUnit];
    const chestPitch=.26+.13*load+jump*.075-.045*slope+clamp(acceleration*.018,-.025,.04);
    // The pushing leg goes back while its shoulder and hand move forward.
    const chestYaw=stanceSign*.19-rearSign*.13*drive+lean*.045;
    const spineRotation=rotation(chestPitch*.76,mix(hipYaw,chestYaw,.58),bodyRoll*.8);
    const chestRotation=rotation(chestPitch,chestYaw,bodyRoll);
    const headRotation=rotation(chestPitch*.34-.025,.075+Math.sin(time*.37)*.018+lean*.025,bodyRoll*.32);
    const bones={};
    const rotations=new Map();

    function setBone(name,head,tail,preferredRotation) {
      const j=rest.get(name),restAxis=unit(sub(j.tail,j.head)),axis=unit(sub(tail,head));
      const shortest=fromTo(restAxis,axis);
      const ref=unit(perpendicular(Math.abs(restAxis[1])>.85?[1,0,0]:[0,1,0],restAxis));
      const a=unit(perpendicular(shortest(ref),axis));
      const b=unit(perpendicular(preferredRotation(ref),axis),a);
      const twist=Math.atan2(dot(axis,cross(a,b)),clamp(dot(a,b),-1,1));
      bones[name]={head:[...head],tail:[...tail],twist};
      rotations.set(name,v=>axisRotation(shortest(v),axis,twist));
      return bones[name];
    }
    function rigid(name) {
      if(bones[name])return bones[name];
      const j=rest.get(name);
      if(!j)return null;
      const parent=rest.get(j.parentName),posedParent=parent?rigid(parent.name):null;
      const rotate=parent?rotations.get(parent.name):pelvisRotation;
      const origin=posedParent?posedParent.head:hip,restOrigin=parent?parent.head:pelvis.head;
      return setBone(name,add(origin,rotate(sub(j.head,restOrigin))),add(origin,rotate(sub(j.tail,restOrigin))),rotate);
    }
    function attachedHead(name) {
      const j=rest.get(name),parent=rest.get(j.parentName);
      if(!parent)return add(hip,pelvisRotation(sub(j.head,pelvis.head)));
      const posed=rigid(parent.name),rotate=rotations.get(parent.name);
      return add(posed.head,rotate(sub(j.head,parent.head)));
    }
    function oriented(name,rotate) {
      const j=rest.get(name),head=attachedHead(name);
      return setBone(name,head,add(head,rotate(sub(j.tail,j.head))),rotate);
    }
    setBone('hips',hip,add(hip,pelvisRotation(sub(pelvis.tail,pelvis.head))),pelvisRotation);
    oriented('spine',spineRotation);oriented('chest',chestRotation);
    oriented('neck',headRotation);oriented('head',headRotation);

    // Ankle targets are derived from an approximate sole, not from an
    // arbitrary shoe centre. Toe-off can therefore pitch without penetration.
    function footTarget(side,anchor,yaw,pitch=0,roll=0) {
      const j=rest.get(`foot.${side}`),rotate=rotation(pitch,yaw,roll);
      const ankleHeight=Math.max(.025,j.head[1]-soleRestY);
      let head=add(anchor,rotate([0,ankleHeight,0]));
      const toe=sub(j.tail,j.head),shoeLength=Math.max(.10,Math.hypot(toe[0],toe[2]));
      const solePoints=[[0,-ankleHeight,-shoeLength*.37],[0,-ankleHeight,shoeLength*1.05],[-.036*modelUnit,-ankleHeight,0],[.036*modelUnit,-ankleHeight,0]];
      const low=Math.min(...solePoints.map(p=>head[1]+rotate(p)[1]));
      head[1]+=Math.max(0,anchor[1]-low);
      return {head,tail:add(head,rotate(sub(j.tail,j.head))),rotate,anchor:[...anchor]};
    }
    const front=footTarget('L',[frontX,soleDeckY,frontZ],stanceSign*.87,.005,0);
    const contactPhase=clamp((phase-PUSH_CONTACT_START)/(PUSH_CONTACT_END-PUSH_CONTACT_START),0,1);
    const hasTravel=Number.isFinite(options.pushTravel);
    const travel=hasTravel?Math.max(0,options.pushTravel)/scale:contactPhase*.62*modelUnit;
    const contactZ=clamp(groundStrokeStart-travel,-.46*modelUnit,groundStrokeStart);
    const hasContactAnchor=options.contactLocal?.length===3&&Array.from(options.contactLocal).every(Number.isFinite);
    const contactAnchor=hasContactAnchor?Array.from(options.contactLocal):[rearSign*.215*modelUnit,.002,contactZ];
    let rearAnchor,rearYaw,rearPitch;
    if(phase<PUSH_CONTACT_START){
      const outside=curve([[0,0],[.12,.64],[.23,1],[.28,1]],phase);
      rearAnchor=[mix(rearX,rearSign*.215*modelUnit,outside),
        curve([[0,soleDeckY],[.11,.21*modelUnit],[.20,.10*modelUnit],[.28,.002]],phase),
        curve([[0,rearZ],[.11,-.18*modelUnit],[.23,.29*modelUnit],[.28,groundStrokeStart]],phase)];
      rearYaw=stanceSign*mix(1.12,.07,smooth(.05,.25,phase));
      rearPitch=curve([[0,0],[.11,-.12],[.23,-.09],[.28,0]],phase);
    }else if(phase<=PUSH_CONTACT_END){
      rearAnchor=[...contactAnchor];
      rearYaw=stanceSign*.07;
      rearPitch=.30*smooth(.63,1,contactPhase);
    }else{
      const returnPhase=(phase-PUSH_CONTACT_END)/(1-PUSH_CONTACT_END);
      const backSweep=curve([[0,0],[.20,1],[.58,.20],[1,0]],returnPhase)*.045*modelUnit;
      rearAnchor=[mix(contactAnchor[0],rearX,smooth(.08,.88,returnPhase)),
        curve([[0,contactAnchor[1]],[.18,contactAnchor[1]+.113*modelUnit],
          [.53,Math.max(contactAnchor[1],soleDeckY)+.12*modelUnit],
          [.80,soleDeckY+.055*modelUnit],[1,soleDeckY]],returnPhase),
        mix(contactAnchor[2],rearZ,smooth(.15,1,returnPhase))-backSweep];
      rearYaw=stanceSign*mix(.07,1.12,smooth(.10,.88,returnPhase));
      rearPitch=curve([[0,.30],[.20,.16],[.50,-.18],[.85,-.035],[1,0]],returnPhase);
    }
    // The actual hip and ankle geometry determines when a stroke unloads.
    // The leg solver never stretches its bind-pose segment lengths.
    let rear=footTarget('R',rearAnchor,rearYaw,rearPitch);
    const rearHip=add(hip,pelvisRotation(sub(rest.get('thigh.R').head,pelvis.head)));
    const rearReach=length(sub(rear.head,rearHip))/(limbs.R.thigh+limbs.R.shin);
    const release=smooth(.91,.985,rearReach);
    const inContact=phase>=PUSH_CONTACT_START&&phase<=PUSH_CONTACT_END&&jump<.02;
    const contactWeight=inContact?(1-release)*smooth(0,.075,contactPhase)*(1-smooth(.93,1,contactPhase)):0;
    // A supplied three-dimensional anchor is already the controller's fixed
    // world contact expressed in this board frame. Never move that contact
    // vertically while the controller is holding it; reach unloads its force.
    const toeRelease=hasContactAnchor?0:release*smooth(.245,.295,phase)*(1-smooth(.45,.65,phase));
    if(toeRelease>0){
      rearAnchor[1]+=.055*modelUnit*toeRelease;
      rear=footTarget('R',rearAnchor,rearYaw,rearPitch+.20*toeRelease);
    }
    const targets={L:front,R:rear};
    let maxLegReach=0;
    for(const side of ['L','R']){
      const thigh=rest.get(`thigh.${side}`),root=add(hip,pelvisRotation(sub(thigh.head,pelvis.head)));
      // Pole vectors remain anatomical when the shoes turn sideways.
      const kneePole=unit([limbs[side].sign*.16,.025,1]);
      const target=targets[side],ik=solveIK(root,target.head,limbs[side].thigh,limbs[side].shin,kneePole);
      maxLegReach=Math.max(maxLegReach,ik.reach);
      setBone(`thigh.${side}`,root,ik.joint,pelvisRotation);
      setBone(`shin.${side}`,ik.joint,ik.end,pelvisRotation);
      const correction=sub(ik.end,target.head);
      setBone(`foot.${side}`,ik.end,add(target.tail,correction),target.rotate);
    }

    // Arms balance the moving leg rather than repeating its phase. The
    // recovery follows a later envelope than the pelvis and chest.
    for(const side of ['L','R']){
      const limb=limbs[side],root=attachedHead(`upper_arm.${side}`),armLength=limb.upperArm+limb.forearm;
      const counter=side==='R'?1:-.68;
      const flick=Math.sin(time*1.51+(side==='L'?.5:1.7))*.006*cruising;
      const local=[limb.sign*armLength*(.55+.055*jump+.025*recovery),
        armLength*(-.76+.085*jump+counter*.075*drive+limb.sign*lean*.09),
        armLength*(-.105+counter*.25*drive-counter*.07*recovery)+flick];
      const wrist=add(root,chestRotation(local));
      const pole=chestRotation([limb.sign*.46,-.08,-1]);
      const ik=solveIK(root,wrist,limb.upperArm,limb.forearm,pole);
      setBone(`upper_arm.${side}`,root,ik.joint,chestRotation);
      setBone(`forearm.${side}`,ik.joint,ik.end,chestRotation);
      rigid(`hand.${side}`);
    }
    for(const j of list)rigid(j.name);
    const strokeForce=inContact?Math.sin(PI*contactPhase)*contactWeight:0;
    return {bones,metrics:{
      rearFootContact:contactWeight>.12,contactWeight,strokeForce,earlyRelease:inContact?release:0,
      pushPhase:phase,pushDuration:PUSH_DURATION,contactStart:PUSH_CONTACT_START,contactEnd:PUSH_CONTACT_END,
      frontWeight:.56+.34*load,rearReach,maxLegReach,
      anchorUnreachable:rearReach>.985,contactAnchorProvided:hasContactAnchor,
      rearFootAnchor:[...rearAnchor],frontFootAnchor:[frontX,soleDeckY,frontZ],
      pelvis:[...hip],chestPitch,contactTravel:travel*scale,
    }};
  }
  return {sample};
}
