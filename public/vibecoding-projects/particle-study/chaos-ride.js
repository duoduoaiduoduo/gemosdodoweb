import { surfacePoint } from './chaos-surface.js?v=flower-ratio-v17';
import { PUSH_DURATION, PUSH_CONTACT_START, PUSH_CONTACT_END } from './skater-motion.js?v=flower-ratio-v17';
import { clamp, add, sub, mul, dot, cross, unit, mix, tangent, smoothstep, response, rotateAbout, emptyRideSpace, sampleRideSurface, fitBoardContact, surfaceUnderPoint } from './ride-space.js?v=flower-ratio-v17';

const turnX = (p,a) => { const c=Math.cos(a),s=Math.sin(a); return [p[0],c*p[1]-s*p[2],s*p[1]+c*p[2]]; };
const turnY = (p,a) => { const c=Math.cos(a),s=Math.sin(a); return [c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]]; };

export function createChaosRide() {
  let requested=false, initialized=false, progress=0, input=0, steer=0;
  let direction=[0,.4,.916515139], heading=[0,.916515139,-.4];
  let ground=[0,.4,.916515139], up=[0,1,0], forward=[0,0,1];
  let cameraPosition=[0,1,2], cameraTarget=[...ground], cameraUp=[0,1,0];
  let space=emptyRideSpace(), elapsed=0, distance=0, worldSpeed=0, lastTime=0, lastParams={};
  let airHeight=0, verticalSpeed=0, jumps=0, landing=0, automaticTurn=0;
  let poseSampler=null,pushElapsed=-1,pushCooldown=0,pushTravel=0,contactWorld=null,contactLocal=null,acceleration=0,strokeForce=0,pushUnloading=false;
  const state={blend:0,active:false,transitioning:false,visibility:0,scale:.30,
    distance:0,speed:0,airborne:false,jumps:0,elapsed:0,time:0,steer:0,lean:0,bank:0,jump:0,
    position:[...ground],up:[...up],forward:[...forward],right:[1,0,0],
    camera:{position:[...cameraPosition],target:[...cameraTarget],up:[...cameraUp]},space,
    focusDistance:1,landing:0,jumpHeight:0,coverage:1,outerCoverage:1,innerCoverage:1,
    shellBlend:0,supportLayer:0,supportCoverage:1,push:0,motion:0,pushTravel:0,contactLocal:null,acceleration:0,strokeForce:0};
  const contactTime=(t,p) => Math.max(0,t-.08*(Number.isFinite(p.speed)?p.speed:1));
  const sample=(d,t,p) => sampleRideSurface(d,contactTime(t,p),p,space);

  function initialize(time,params) {
    const yaw=(params.yaw||0)+(time-4)*.105;
    const pitch=(params.pitch||0)-.08+Math.sin(time*.11)*.08;
    const inverse=v=>turnY(turnX(v,-pitch),-yaw);
    const visible=unit(inverse([0,.40,.916515139]));
    direction=[...visible]; heading=tangent(inverse([0,.916515139,-.40]),direction);
    let best=surfacePoint(direction,contactTime(time,params),params),score=best.coverage;
    const side=unit(cross(direction,heading));
    // Pick a living entry tuft before approach; all subsequent movement is
    // continuous in the same domain, including when the original pores open.
    for(let i=0;i<16&&score<.6;i++) {
      const a=i*2.39996323,r=.07+.10*i/15;
      const d=unit(add(visible,add(mul(heading,Math.cos(a)*r),mul(side,Math.sin(a)*r))));
      const candidate=surfacePoint(d,contactTime(time,params),params),s=candidate.coverage-r*.3;
      if(s>score){direction=d;best=candidate;score=s;}
    }
    heading=tangent(heading,direction);
    let worldForward=unit([heading[0],0,heading[2]],[0,0,-1]);
    if(Math.hypot(heading[0],heading[2])<.1) worldForward=unit([inverse([0,0,-1])[0],0,inverse([0,0,-1])[2]],[0,0,-1]);
    space={domainRight:unit(cross(direction,heading)),domainForward:[...heading],domainNormal:[...direction],
      worldRight:unit(cross([0,1,0],worldForward)),worldForward,worldUp:[0,1,0],
      origin:[...best.position],baseRadius:Math.hypot(...best.position),unfold:0};
    ground=[...best.position];up=[...best.normal];forward=tangent(heading,up);
    cameraPosition=add(add(ground,mul(forward,-.42)),[0,.16,0]);
    cameraTarget=add(ground,[0,.14,0]);cameraUp=[0,1,0];
    airHeight=0;verticalSpeed=0;worldSpeed=0;automaticTurn=0;landing=0;
    pushElapsed=-1;pushCooldown=0;pushTravel=0;contactWorld=null;contactLocal=null;acceleration=0;strokeForce=0;pushUnloading=false;
    initialized=true;
  }

  function publish() {
    state.blend=smoothstep(0,1,progress);
    state.active=requested||progress>0;state.transitioning=progress>0&&progress<1;
    state.distance=distance;state.speed=worldSpeed*4;state.airborne=airHeight>.0001||verticalSpeed>0;
    state.jumps=jumps;state.position=add(ground,mul(up,.008+airHeight));
    state.up=[...up];state.forward=[...forward];state.right=unit(cross(up,forward));
    // The full-size boy is revealed by optics and grass, never by scaling him.
    state.visibility=smoothstep(.68,.84,progress);state.scale=.30;
    state.camera={position:[...cameraPosition],target:[...cameraTarget],up:[...cameraUp]};
    state.focusDistance=Math.hypot(...sub(cameraPosition,cameraTarget));
    state.elapsed=elapsed;state.time=lastTime;state.steer=steer;
    state.lean=-steer*.56+automaticTurn*.06;state.bank=state.lean;
    state.landing=landing;state.jumpHeight=airHeight;
    state.jump=clamp(airHeight/.073+landing*.18,0,1);
    state.push=pushElapsed>=0?clamp(pushElapsed/PUSH_DURATION,0,1):0;
    state.pushTravel=pushTravel;state.contactLocal=contactLocal?[...contactLocal]:null;
    state.acceleration=acceleration;state.strokeForce=strokeForce;
    state.motion=clamp(worldSpeed/1.05,0,1);state.space=space;
    return state;
  }
  function enter({time=lastTime,params=lastParams}={}) {
    lastTime=time;lastParams=params;
    if(!initialized||progress===0) initialize(time,params);
    requested=true;return publish();
  }
  function exit(){requested=false;input=0;return publish();}
  function setInput({steer:value=0}={}){input=clamp(Number.isFinite(value)?value:0,-1,1);}
  function jump(){
    if(!requested||progress<.94||airHeight>.0001||verticalSpeed>0) return false;
    verticalSpeed=.50;jumps++;landing=0;pushElapsed=-1;contactWorld=null;contactLocal=null;pushUnloading=false;return true;
  }
  function reset(){
    requested=false;initialized=false;progress=0;input=0;steer=0;
    elapsed=0;distance=0;jumps=0;airHeight=0;verticalSpeed=0;worldSpeed=0;landing=0;
    pushElapsed=-1;pushCooldown=0;pushTravel=0;contactWorld=null;contactLocal=null;acceleration=0;strokeForce=0;pushUnloading=false;
    space=emptyRideSpace();return publish();
  }
  function update(delta,{time=lastTime,params=lastParams}={}) {
    const dt=clamp(Number.isFinite(delta)?delta:0,0,.05);
    lastTime=Number.isFinite(time)?time:lastTime;lastParams=params;
    if(!initialized){if(!requested&&progress===0)return publish();initialize(lastTime,params);}
    progress=clamp(progress+(requested?dt/6.2:-dt/2.6),0,1);
    space.unfold=smoothstep(.28,.84,progress);
    if(!requested&&progress===0){worldSpeed=0;space.unfold=0;return publish();}
    elapsed+=dt;steer+=(input-steer)*response(dt,.16);
    pushCooldown+=dt;
    if(pushElapsed>=0){
      const unloading=pushUnloading&&pushElapsed/PUSH_DURATION<PUSH_CONTACT_END;
      pushElapsed+=dt*(unloading?4:1);
      if(pushElapsed>=PUSH_DURATION){pushElapsed=-1;pushCooldown=0;contactWorld=null;contactLocal=null;pushUnloading=false;}
    }else if(requested&&progress>.91&&airHeight===0&&((worldSpeed<.83&&pushCooldown>1.9)||pushCooldown>4.5)){
      pushElapsed=0;pushTravel=0;contactWorld=null;contactLocal=null;pushUnloading=false;
    }
    const phase=pushElapsed>=0?pushElapsed/PUSH_DURATION:0;
    const contactPhase=phase>=PUSH_CONTACT_START&&phase<=PUSH_CONTACT_END&&pushElapsed>=0&&airHeight===0;
    const pose=poseSampler?.({time:elapsed,push:phase,lean:-steer*.56,jump:state.jump,speed:worldSpeed*4,
      distance,pushTravel,contactLocal,scale:.30,acceleration});
    if(contactPhase&&(pose?.metrics.earlyRelease||0)>.30)pushUnloading=true;
    strokeForce=contactPhase&&!pushUnloading?(pose?.metrics.strokeForce||0):0;
    if(contactPhase&&!pushUnloading&&!contactWorld&&pose){
      const foot=pose.metrics.rearFootAnchor,right=unit(cross(up,forward));
      contactWorld=add(add(ground,mul(up,.008)),add(add(mul(right,foot[0]*.30),mul(up,foot[1]*.30)),mul(forward,foot[2]*.30)));
      const footGround=surfaceUnderPoint({point:contactWorld,direction,time:contactTime(lastTime,params),params,space});
      if(footGround.converged)contactWorld[1]=footGround.position[1]+.002;
    }
    const previousSpeed=worldSpeed;
    if(requested&&progress>.91){
      // The rear foot supplies the impulse. Coasting loses speed between
      // strokes, so the pose and forward motion tell the same physical story.
      worldSpeed=clamp(worldSpeed+(5.2*strokeForce-.10-.025*worldSpeed*worldSpeed)*dt,.34,1.12);
    }else{
      const desiredSpeed=requested ? .92*smoothstep(.57,1,progress) : .60*progress;
      worldSpeed+=(desiredSpeed-worldSpeed)*response(dt,.65);
    }
    acceleration=dt>0?(worldSpeed-previousSpeed)/dt:acceleration;
    if(contactPhase&&!pushUnloading)pushTravel+=worldSpeed*dt;
    // A broad continuous return arc keeps the endless ride inside this chart.
    // There is no coordinate wrap or contact-point teleport.
    const radius=Math.acos(clamp(dot(direction,space.domainNormal),-1,1));
    const inward=tangent(space.domainNormal,direction);
    const turnAngle=Math.atan2(dot(cross(heading,inward),direction),dot(heading,inward));
    const edgeWeight=smoothstep(.72,1.30,radius);
    const turnTarget=clamp(turnAngle*edgeWeight,-1.05,1.05);
    automaticTurn+=(turnTarget-automaticTurn)*response(dt,.8);
    const steeringRoom=1-.65*smoothstep(1.25,2.00,radius);
    heading=unit(rotateAbout(heading,direction,(-steer*.72*steeringRoom+automaticTurn)*dt));
    const now=sample(direction,lastTime,params);
    const probe=sample(unit(add(direction,mul(heading,.012))),lastTime,params);
    const metric=clamp(Math.hypot(...sub(probe.position,now.position))/.012,.55,5.5);
    direction=unit(add(direction,mul(heading,worldSpeed*dt/metric)));
    heading=tangent(heading,direction);
    const contact=sample(direction,lastTime,params);
    ground=mix(ground,contact.position,response(dt,.035));
    // Average the moving fold over the board footprint, keeping the horizon
    // level even when individual roots and grass blades sway beneath it.
    const front=sample(unit(add(direction,mul(heading,.034))),lastTime,params);
    const rear=sample(unit(add(direction,mul(heading,-.034))),lastTime,params);
    const targetUp=unit(add(add(contact.normal,front.normal),rear.normal),up);
    up=unit(mix(up,targetUp,response(dt,.24)),up);
    const along=tangent(sub(front.position,rear.position),up);
    forward=tangent(mix(forward,along,response(dt,.17)),up);
    if(space.unfold>.60){
      const contactFit=fitBoardContact({direction,time:contactTime(lastTime,params),params,space,
        position:ground,forward,normal:up,normalWeight:response(dt,.08)});
      if(contactFit.converged){ground=contactFit.position;up=contactFit.normal;forward=contactFit.forward;}
    }
    if(contactPhase&&!pushUnloading&&contactWorld){
      const origin=add(ground,mul(up,.008)),delta=sub(contactWorld,origin),right=unit(cross(up,forward));
      contactLocal=[dot(delta,right)/.30,dot(delta,up)/.30,dot(delta,forward)/.30];
    }
    if(airHeight>0||verticalSpeed>0){
      verticalSpeed-=1.70*dt;airHeight+=verticalSpeed*dt;
      if(airHeight<=0){airHeight=0;verticalSpeed=0;landing=1;}
    }
    landing*=Math.exp(-dt/.20);distance+=worldSpeed*dt*4;
    const follow=smoothstep(.56,.96,progress);
    const behind=.32+follow*.59,lift=.105+follow*.205;
    const cameraHeading=unit([forward[0],0,forward[2]],space.worldForward);
    const cameraSide=unit(cross(space.worldUp,cameraHeading));
    // Account for translational spring lag so speed does not pull the camera
    // a quarter of a metre farther away and shrink the reference composition.
    const prediction=worldSpeed*follow;
    const desiredCamera=add(add(add(ground,mul(cameraHeading,-behind+prediction*.24)),mul(cameraSide,.16*follow)),[0,lift+airHeight*.35,0]);
    const desiredTarget=add(add(ground,[0,.13+follow*.105+airHeight*.65,0]),mul(cameraHeading,.12+prediction*.18));
    cameraPosition=mix(cameraPosition,desiredCamera,response(dt,.24));
    cameraTarget=mix(cameraTarget,desiredTarget,response(dt,.18));
    if(space.unfold>.60){
      const cameraGround=surfaceUnderPoint({point:cameraPosition,direction,time:contactTime(lastTime,params),params,space});
      if(cameraGround.converged) cameraPosition[1]=Math.max(cameraPosition[1],cameraGround.position[1]+.12);
      // The rendered camera is still a macro/close-up blend during entry and
      // exit. Constrain that actual lens path too, then feed the correction
      // through the same spring so it decays continuously as the chart closes.
      const blend=smoothstep(0,1,progress);
      if(blend>.01&&blend<.9999){
        const yaw=(params.yaw||0)+(lastTime-4)*.105;
        const pitch=(params.pitch||0)-.08+Math.sin(lastTime*.11)*.08;
        const outside=turnY(turnX([0,0,3.58/(params.zoom||1)],-pitch),-yaw);
        const lens=mix(outside,cameraPosition,blend);
        const lensGround=surfaceUnderPoint({point:lens,direction,time:contactTime(lastTime,params),params,space});
        if(lensGround.converged) cameraPosition[1]+=Math.max(0,lensGround.position[1]+.12-lens[1])/blend;
      }
    }
    cameraUp=unit(mix(cameraUp,space.worldUp,response(dt,.4)));
    state.coverage=contact.coverage;state.outerCoverage=contact.coverage;state.innerCoverage=1;
    state.supportCoverage=1;state.supportLayer=0;state.shellBlend=0;
    return publish();
  }
  function setPoseSampler(sample){poseSampler=typeof sample==='function'?sample:null;}
  return{enter,exit,setInput,jump,reset,update,setPoseSampler,getState:()=>state};
}
