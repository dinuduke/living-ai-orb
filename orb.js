(()=>{
const canvas=document.getElementById('orb');
const ctx=canvas.getContext('2d',{alpha:true});
const statusEl=document.getElementById('status');
const textEl=document.getElementById('text');
const speakBtn=document.getElementById('speak');
const stopBtn=document.getElementById('stop');
const micBtn=document.getElementById('mic');
const shiftBtn=document.getElementById('shift');

let DPR=Math.min(devicePixelRatio||1,2),W=1,H=1,CX=0,CY=0,R=1,t=0,last=performance.now();
let speaking=false,speechEnergy=0,micEnergy=0,hue=.96,hueTarget=.96,nextHue=0,morph=0,morphTarget=0,nextMorph=0;
let audioCtx=null,analyser=null,micStream=null,micData=null,micEnabled=false;

const pointer={x:0,y:0,inside:false,down:false,strength:0,clickPulse:0};
const COUNT=1900,points=[],phi=Math.PI*(3-Math.sqrt(5));

for(let i=0;i<COUNT;i++){
  const y=1-i/(COUNT-1)*2;
  const r=Math.sqrt(Math.max(0,1-y*y));
  const th=phi*i;
  points.push({x:Math.cos(th)*r,y,z:Math.sin(th)*r,seed:Math.random()*1000});
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,n)=>a+(b-a)*n;
const smooth=x=>x*x*(3-2*x);

function hsv(h,s,v){
  h=((h%1)+1)%1;
  const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),u=v*(1-(1-f)*s);
  return [[v,u,p],[q,v,p],[p,v,u],[p,q,v],[u,p,v],[v,p,q]][i%6].map(n=>Math.round(n*255));
}
function resize(){
  const r=canvas.getBoundingClientRect();
  W=Math.max(1,Math.floor(r.width*DPR)); H=Math.max(1,Math.floor(r.height*DPR));
  canvas.width=W; canvas.height=H; CX=W/2; CY=H/2; R=Math.min(W,H)*.31;
}
addEventListener('resize',resize); resize();

function pos(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/Math.max(r.width,1),y:(e.clientY-r.top)*canvas.height/Math.max(r.height,1)};
}
canvas.addEventListener('pointerenter',e=>Object.assign(pointer,pos(e),{inside:true}));
canvas.addEventListener('pointermove',e=>Object.assign(pointer,pos(e),{inside:true}));
canvas.addEventListener('pointerleave',()=>{pointer.inside=false;pointer.down=false});
canvas.addEventListener('pointerdown',e=>{
  Object.assign(pointer,pos(e),{inside:true,down:true,clickPulse:1});
  setNextHue(t); setNextMorph(t);
  try{canvas.setPointerCapture(e.pointerId)}catch{}
});
canvas.addEventListener('pointerup',e=>{
  pointer.down=false;
  try{canvas.releasePointerCapture(e.pointerId)}catch{}
});

function rotate(p,ax,ay,az){
  let {x,y,z}=p,c=Math.cos(ax),s=Math.sin(ax);
  [y,z]=[y*c-z*s,y*s+z*c];
  c=Math.cos(ay);s=Math.sin(ay);[x,z]=[x*c+z*s,-x*s+z*c];
  c=Math.cos(az);s=Math.sin(az);[x,y]=[x*c-y*s,x*s+y*c];
  return {x,y,z};
}
function setNextHue(now){
  const palette=[.94,.97,.015,.035,.065,.10,.48,.54,.60,.72,.78];
  hueTarget=palette[Math.floor(Math.random()*palette.length)];
  nextHue=now+10+Math.random()*10;
}
function setNextMorph(now){
  morphTarget=morphTarget>.5?0:1;
  nextMorph=now+(speaking?3.8:7.5)+Math.random()*(speaking?2.8:4);
}
function micLevel(){
  if(!analyser||!micData)return 0;
  analyser.getByteTimeDomainData(micData);
  let s=0;
  for(const v of micData){const x=(v-128)/128;s+=x*x}
  return clamp(Math.sqrt(s/micData.length)*5,0,1);
}

function frame(now){
  const dt=Math.min((now-last)/1000,.05);
  last=now; t=now*.001;
  if(t>=nextHue)setNextHue(t);
  if(t>=nextMorph)setNextMorph(t);

  hue=lerp(hue,hueTarget,1-Math.exp(-dt*.12));
  morph=lerp(morph,morphTarget,1-Math.exp(-dt*(speaking?.48:.18)));

  if(micEnabled){
    const raw=micLevel();
    micEnergy=lerp(micEnergy,raw,1-Math.exp(-dt*(raw>micEnergy?8:2.5)));
  }else{
    micEnergy=lerp(micEnergy,0,1-Math.exp(-dt*2.1));
  }

  const synthetic=speaking?.38+.13*Math.sin(t*3)+.08*Math.sin(t*5.1+.8)+.04*Math.sin(t*7.4+1.6):0;
  speechEnergy=lerp(speechEnergy,clamp(synthetic,0,1),1-Math.exp(-dt*(speaking?2.8:1.35)));
  const energy=clamp(Math.max(speechEnergy,micEnergy),0,1);

  pointer.strength=lerp(pointer.strength,pointer.inside?(pointer.down?1:.7):0,1-Math.exp(-dt*(pointer.inside?5:2.2)));
  pointer.clickPulse=Math.max(0,pointer.clickPulse-dt*.72);

  ctx.clearRect(0,0,W,H);
  const [gr,gg,gb]=hsv(hue,.78,1);

  const rotY=t*.055,rotX=Math.sin(t*.13)*.115,rotZ=Math.sin(t*.09)*.035;
  const eased=smooth(clamp(morph,0,1));
  const horizontalWave=.5+.5*Math.sin(t*(speaking?.82:.52)-.8);
  const horizontalStretch=horizontalWave*(speaking?.34:.22);
  const morphStretch=eased*(speaking?.18:.12);
  const xScale=1+horizontalStretch+morphStretch;
  const yScale=1-horizontalStretch*.30-morphStretch*.42;
  const breath=1+Math.sin(t*.64)*(.009+energy*.012);
  const draw=[];

  for(const p of points){
    const q=rotate(p,rotX,rotY,rotZ);
    const edge=Math.pow(clamp(Math.sqrt(q.x*q.x+q.y*q.y),0,1),5.2);
    const a=Math.atan2(q.y,q.x);
    const edgeWave=Math.sin(a*5+t*.86)+.52*Math.sin(a*8-t*.62+1.2)+.24*Math.sin(a*3+t*.36);
    const voiceRipple=Math.sin(a*6+t*1.6)+.35*Math.sin(a*10-t*1.12);
    const speechBeat=speaking?speechEnergy*(.68+.2*Math.sin(t*3.15)+.12*Math.sin(t*5.35+1.1)):0;
    const waveAmount=.014+energy*.020+(speaking?.034+speechBeat*.07:0);
    const speechContour=speaking?
      Math.sin(a*4-t*2.45)*speechBeat*.024+
      Math.sin(a*7+t*1.72)*speechBeat*.012:0;

    const radialWave=
      1+
      edge*edgeWave*waveAmount+
      edge*voiceRipple*energy*(speaking?.017:.009)+
      edge*speechContour;

    const body=
      1+
      Math.sin(q.y*5.2+t*.45+p.seed*.013)*(.0035+energy*.004)+
      Math.sin(q.x*4.4-t*.38+p.seed*.009)*(.0025+energy*.003);

    const rr=R*breath*radialWave*body;
    let x=q.x*rr*xScale,y=q.y*rr*yScale,z=q.z*rr;

    x+=Math.sin(t*.42+q.y*3.2)*R*.0038;
    y+=Math.sin(t*.36+q.x*3)*R*.003;

    const persp=1/(1.88-z/(R*2.18));
    let sx=CX+x*persp,sy=CY+y*persp;
    const depth=clamp((z/R+1)*.5,0,1);
    let interaction=0;

    if(pointer.strength>.001){
      const dx=sx-pointer.x,dy=sy-pointer.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      const rad=R*(.55+pointer.clickPulse*.18);
      interaction=clamp(1-d/rad,0,1);
      interaction*=interaction;
      if(interaction>0){
        const nx=dx/d,ny=dy/d;
        const push=R*interaction*pointer.strength*(.12+pointer.clickPulse*.16);
        const swirl=R*interaction*pointer.strength*(.035+.018*Math.sin(t*1.25+p.seed));
        sx+=nx*push-ny*swirl; sy+=ny*push+nx*swirl;
        if(pointer.clickPulse>0){
          const ripple=Math.sin(d/Math.max(R,1)*23-t*5.2)*R*.022*interaction*pointer.clickPulse;
          sx+=nx*ripple; sy+=ny*ripple;
        }
      }
    }
    draw.push({sx,sy,depth,seed:p.seed,edge,interaction});
  }

  draw.sort((a,b)=>a.depth-b.depth);
  ctx.globalCompositeOperation='lighter';

  for(const p of draw){
    const xNorm=clamp((p.sx-(CX-R*1.55))/(R*3.1),0,1);
    const band=Math.sin(xNorm*6.283-t*.58);
    const broad=Math.sin(xNorm*3.1415-t*.31+1.2);
    const hh=hue+.06*band+.026*broad+.014*Math.sin(p.depth*4+t*.12);
    const sat=.64+energy*.09;

    const talkPulse=speaking?clamp(
      speechEnergy*(.76+.16*Math.sin(t*3.1)+.08*Math.sin(t*5.8+p.seed*.012)),0,1
    ):0;

    const talkEdge=speaking?Math.pow(p.edge,1.45)*(.14+talkPulse*.38):0;
    const val=.53+p.depth*.39+.055*(band*.5+.5)+talkEdge*.55;
    const [r,g,b]=hsv(hh,sat,clamp(val,0,1));

    const alpha=(.18+p.depth*.64+p.interaction*.18)*.8+talkEdge*.22;
    const size=(.70+p.depth*1.12+energy*.22+p.interaction*.82+
      pointer.clickPulse*p.interaction*.52+talkEdge*.85)*DPR;

    const talkHalo=speaking?Math.pow(p.edge,1.55)*(.28+talkPulse*.92):0;
    const halo=size*(2.55+p.interaction*.75+talkHalo*2.15);

    ctx.fillStyle=`rgba(${r},${g},${b},${alpha*(.105+p.interaction*.075+talkHalo*.11)})`;
    ctx.beginPath();ctx.arc(p.sx,p.sy,halo,0,Math.PI*2);ctx.fill();

    ctx.fillStyle=`rgba(${r},${g},${b},${Math.min(alpha+talkEdge*.28,.98)})`;
    ctx.beginPath();ctx.arc(p.sx,p.sy,size*(.58+talkEdge*.18),0,Math.PI*2);ctx.fill();
  }

  ctx.globalCompositeOperation='source-over';

  const coreR=R*.092*(1+Math.sin(t*.78)*.035+energy*.025);
  const core=ctx.createRadialGradient(CX,CY,0,CX,CY,coreR*2.9);
  core.addColorStop(0,`rgba(${gr},${gg},${gb},${.14+energy*.08})`);
  core.addColorStop(.38,`rgba(${gr},${gg},${gb},${.06+energy*.035})`);
  core.addColorStop(1,`rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle=core;
  ctx.beginPath();ctx.arc(CX,CY,coreR*2.9,0,Math.PI*2);ctx.fill();

  requestAnimationFrame(frame);
}

function speak(){
  const value=textEl.value.trim();
  if(!value||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(value);
  const voices=speechSynthesis.getVoices();
  const preferred=
    voices.find(v=>/en-IN/i.test(v.lang))||
    voices.find(v=>/en-GB/i.test(v.lang))||
    voices.find(v=>/en-US/i.test(v.lang));
  u.rate=1;u.pitch=1;
  if(preferred)u.voice=preferred;
  u.onstart=()=>{
    speaking=true;
    statusEl.textContent='speaking';
    speakBtn.classList.add('active');
    setNextHue(t);setNextMorph(t);
  };
  u.onend=u.onerror=()=>{
    speaking=false;
    statusEl.textContent=micEnabled?'listening':'idle';
    speakBtn.classList.remove('active');
  };
  speechSynthesis.speak(u);
}

async function toggleMic(){
  if(micEnabled){
    micEnabled=false;
    micBtn.classList.remove('active');
    statusEl.textContent=speaking?'speaking':'idle';
    if(micStream)micStream.getTracks().forEach(t=>t.stop());
    micStream=null;analyser=null;
    if(audioCtx){await audioCtx.close();audioCtx=null}
    return;
  }
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const source=audioCtx.createMediaStreamSource(micStream);
    analyser=audioCtx.createAnalyser();
    analyser.fftSize=512;
    analyser.smoothingTimeConstant=.74;
    source.connect(analyser);
    micData=new Uint8Array(analyser.fftSize);
    micEnabled=true;
    micBtn.classList.add('active');
    statusEl.textContent=speaking?'speaking':'listening';
  }catch(e){
    console.error(e);
    statusEl.textContent='mic denied';
  }
}

function stop(){
  if('speechSynthesis'in window)speechSynthesis.cancel();
  speaking=false;
  statusEl.textContent=micEnabled?'listening':'idle';
  speakBtn.classList.remove('active');
}

speakBtn.addEventListener('click',speak);
stopBtn.addEventListener('click',stop);
micBtn.addEventListener('click',toggleMic);
shiftBtn.addEventListener('click',()=>{setNextHue(t);setNextMorph(t)});

window.LivingAIOrb={
  speak,
  stop,
  setText:v=>textEl.value=String(v??''),
  setSpeaking:v=>{
    speaking=Boolean(v);
    statusEl.textContent=speaking?'speaking':(micEnabled?'listening':'idle');
    speakBtn.classList.toggle('active',speaking);
  },
  setPaletteShift:()=>{setNextHue(t);setNextMorph(t)}
};

setNextHue(0);
setNextMorph(0);
requestAnimationFrame(frame);

if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=()=>{};
})();

(()=>{
const grid=document.querySelector('.grid');
if(!grid||document.getElementById('energyGrid'))return;
const c=document.createElement('canvas');c.id='energyGrid';c.setAttribute('aria-hidden','true');grid.after(c);
const s=getComputedStyle(grid);Object.assign(c.style,{position:'fixed',zIndex:'1',pointerEvents:'none',left:s.left,right:s.right,bottom:s.bottom,height:s.height,transformOrigin:s.transformOrigin,transform:s.transform,maskImage:s.maskImage,webkitMaskImage:s.webkitMaskImage,opacity:innerWidth<560?'.68':'.9',mixBlendMode:'screen',filter:'saturate(1.18) brightness(1.08)'});
const x=c.getContext('2d',{alpha:true}),rm=matchMedia('(prefers-reduced-motion: reduce)'),cols=[['0,255,255','#00ffff'],['142,92,255','#8e5cff'],['255,0,255','#ff00ff']];
let W=1,H=1,D=1,step=42,raf=0,last=performance.now(),live=!document.hidden,dead=false,hs=[],vs=[],bursts=[],cool=new Map();
const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function counts(){return innerWidth<=560?[1,1]:innerWidth<=900?[2,2]:[3,2]}
function lane(axis){if(axis==='h'){const a=Math.max(1,Math.ceil(H*.40/step)),b=Math.max(a+1,Math.floor(H*.94/step));return Math.floor(rnd(a,b+.99))*step}const a=1,b=Math.max(2,Math.floor(W/step)-1);return Math.floor(rnd(a,b+.99))*step}
function pulse(axis,now=performance.now(),inside=false){const dir=Math.random()<.5?-1:1,span=axis==='h'?W:H,len=step*rnd(1.8,3.8);return{axis,lane:lane(axis),head:inside?(axis==='h'?rnd(step*1.4,Math.max(step*2,span-step*1.4)):rnd(H*.42,H*.90)):(dir>0?-len:span+len),dir,len,base:axis==='h'?rnd(88,150):rnd(72,126),freq:rnd(.00055,.0011),phase:rnd(0,6.28),shim:rnd(0,6.28),width:rnd(.95,1.45),str:rnd(.68,.96),color:pick(cols),wait:now+(inside?rnd(0,850):rnd(180,1500)),id:Math.random()}}
function seed(){const [h,v]=counts(),now=performance.now();hs=Array.from({length:h},()=>pulse('h',now,true));vs=Array.from({length:v},()=>pulse('v',now,true));bursts=[];cool.clear();[...hs,...vs].forEach((p,i)=>p.wait+=i*rnd(90,330))}
function resize(){if(dead)return;const w=Math.max(1,Math.round(c.clientWidth)),h=Math.max(1,Math.round(c.clientHeight)),d=Math.min(devicePixelRatio||1,innerWidth<640?1:1.25);if(w===W&&h===H&&d===D)return;W=w;H=h;D=d;step=parseFloat(getComputedStyle(grid).backgroundSize)||42;c.width=Math.round(W*D);c.height=Math.round(H*D);x.setTransform(D,0,0,D,0,0);seed();if(rm.matches)staticGlow()}
function speed(p,t){return p.base*clamp(1+.11*Math.sin(t*p.freq+p.phase)+.04*Math.sin(t*p.freq*2.17+p.phase*.7),.82,1.2)}
function range(p){return p.dir>0?[p.head-p.len,p.head]:[p.head,p.head+p.len]}
function update(p,dt,t){if(t<p.wait)return;p.head+=speed(p,t)*p.dir*dt;const span=p.axis==='h'?W:H,[a,b]=range(p);if(a>span+step*1.5||b<-step*1.5)Object.assign(p,pulse(p.axis,t,false))}
function draw(p,t){if(t<p.wait)return;let[a,b]=range(p),span=p.axis==='h'?W:H;a=Math.max(-p.len,a);b=Math.min(span+p.len,b);if(b<=a)return;const sh=.84+.1*Math.sin(t*.0022+p.shim)+.06*Math.sin(t*.0041+p.shim*1.7),st=p.str*sh,g=p.axis==='h'?x.createLinearGradient(a,0,b,0):x.createLinearGradient(0,a,0,b);if(p.dir>0){g.addColorStop(0,`rgba(${p.color[0]},0)`);g.addColorStop(.36,`rgba(${p.color[0]},${.07*st})`);g.addColorStop(.7,`rgba(${p.color[0]},${.26*st})`);g.addColorStop(.91,`rgba(${p.color[0]},${.72*st})`);g.addColorStop(1,`rgba(${p.color[0]},${st})`)}else{g.addColorStop(0,`rgba(${p.color[0]},${st})`);g.addColorStop(.09,`rgba(${p.color[0]},${.72*st})`);g.addColorStop(.3,`rgba(${p.color[0]},${.26*st})`);g.addColorStop(.64,`rgba(${p.color[0]},${.07*st})`);g.addColorStop(1,`rgba(${p.color[0]},0)`)}x.save();x.globalCompositeOperation='lighter';x.strokeStyle=g;x.lineWidth=p.width;x.shadowColor=p.color[1];x.shadowBlur=8+10*st;x.beginPath();p.axis==='h'?(x.moveTo(a,p.lane),x.lineTo(b,p.lane)):(x.moveTo(p.lane,a),x.lineTo(p.lane,b));x.stroke();const head=p.dir>0?b:a;x.fillStyle=`rgba(${p.color[0]},${.88*st})`;x.shadowBlur=13+10*st;x.beginPath();x.arc(p.axis==='h'?head:p.lane,p.axis==='h'?p.lane:head,1.05+p.width*.72,0,6.28);x.fill();x.restore()}
function timing(p,coord,t){if(t<p.wait)return null;const sp=speed(p,t),behind=p.dir>0?p.head-coord:coord-p.head;return behind<0||behind>p.len?null:behind/Math.max(1,sp)}
function hit(px,py,h,v,t){const key=`${h.id}|${v.id}|${px}|${py}`;if((cool.get(key)||0)>t)return;cool.set(key,t+1200);const col=Math.random()<.5?h.color:v.color;bursts.push({x:px,y:py,cx:px+(h.dir>0?0:-step),cy:py+(v.dir>0?0:-step),born:t,life:rnd(520,860),col});if(bursts.length>8)bursts.shift()}
function detect(t){for(const h of hs)for(const v of vs){const ht=timing(h,v.lane,t),vt=timing(v,h.lane,t);if(ht!==null&&vt!==null&&Math.abs(ht-vt)<=.38)hit(v.lane,h.lane,h,v,t)}}
function burst(b,t){const p=clamp((t-b.born)/b.life,0,1);if(p>=1)return false;const a=Math.sin(Math.PI*p);x.save();x.globalCompositeOperation='lighter';x.strokeStyle=`rgba(${b.col[0]},${.52*a})`;x.lineWidth=1+.75*a;x.shadowColor=b.col[1];x.shadowBlur=10+14*a;x.strokeRect(b.cx,b.cy,step,step);const r=step*(.18+.1*a),g=x.createRadialGradient(b.x,b.y,0,b.x,b.y,r);g.addColorStop(0,`rgba(255,255,255,${.3*a})`);g.addColorStop(.2,`rgba(${b.col[0]},${.26*a})`);g.addColorStop(1,`rgba(${b.col[0]},0)`);x.fillStyle=g;x.fillRect(b.x-r,b.y-r,r*2,r*2);x.restore();return true}
function staticGlow(){x.clearRect(0,0,W,H);const yy=Math.round(H*.68/step)*step,xx=Math.round(W*.54/step)*step;x.save();x.globalCompositeOperation='lighter';x.strokeStyle='rgba(0,255,255,.13)';x.shadowColor='#00ffff';x.shadowBlur=9;x.beginPath();x.moveTo(Math.max(0,xx-step),yy);x.lineTo(Math.min(W,xx+step),yy);x.stroke();x.restore()}
function render(t){if(dead||!live||rm.matches)return;const dt=Math.min((t-last)/1000,.05);last=t;x.clearRect(0,0,W,H);hs.forEach(p=>(update(p,dt,t),draw(p,t)));vs.forEach(p=>(update(p,dt,t),draw(p,t)));detect(t);bursts=bursts.filter(b=>burst(b,t));if(cool.size>28)cool.forEach((u,k)=>u<t&&cool.delete(k));raf=requestAnimationFrame(render)}
function restart(){cancelAnimationFrame(raf);last=performance.now();if(dead||!live)return;rm.matches?staticGlow():raf=requestAnimationFrame(render)}
const ro=new ResizeObserver(resize);ro.observe(c);const vis=()=>{live=!document.hidden;live?restart():cancelAnimationFrame(raf)},mot=()=>restart();document.addEventListener('visibilitychange',vis);rm.addEventListener?.('change',mot);addEventListener('pagehide',()=>{dead=true;cancelAnimationFrame(raf);ro.disconnect();document.removeEventListener('visibilitychange',vis);rm.removeEventListener?.('change',mot)},{once:true});resize();restart();
})();
