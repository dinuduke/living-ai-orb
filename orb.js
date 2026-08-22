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
  const palette=[.94,.97,.015,.035,.065,.10];
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

window.dispatchEvent(new CustomEvent('living-ai-orb-ready'));
if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=()=>{};
})();

// Live-electricity layer for the Vaporwave grid background.
(()=>{
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const layer=document.createElement('canvas');
  layer.id='energyGrid';
  layer.setAttribute('aria-hidden','true');
  layer.style.cssText='position:fixed;inset:0;z-index:1;width:100vw;height:100vh;pointer-events:none;opacity:.76;mix-blend-mode:screen;filter:saturate(1.14);';
  const anchor=document.querySelector('.grid,.grid-floor');
  if(anchor?.parentNode)anchor.insertAdjacentElement('afterend',layer);else document.body.prepend(layer);
  const c=layer.getContext('2d',{alpha:true});
  const palette=[{rgb:'0,255,255',hex:'#00ffff'},{rgb:'255,0,255',hex:'#ff00ff'},{rgb:'255,153,0',hex:'#ff9900'}];
  let w=1,h=1,dpr=1,step=56,last=performance.now(),raf=0,visible=!document.hidden;
  let hs=[],vs=[],bursts=[];const cooldown=new Map();
  const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function makeH(i=0){const rows=Math.max(5,Math.floor(h/step)),dir=Math.random()>.28?1:-1,len=rnd(step*2.4,step*5.4);return{id:`h${Date.now()}${i}${Math.random()}`,axis:'h',y:Math.floor(rnd(1,rows-1))*step,pos:dir>0?-len:w+len,dir,speed:rnd(72,142),len,width:rnd(.7,1.6),color:pick(palette),phase:rnd(0,Math.PI*2),strength:rnd(.48,.88)}}
  function makeV(i=0){const cols=Math.max(6,Math.floor(w/step)),dir=Math.random()>.22?1:-1,len=rnd(step*2.2,step*4.7);return{id:`v${Date.now()}${i}${Math.random()}`,axis:'v',x:Math.floor(rnd(1,cols-1))*step,pos:dir>0?-len:h+len,dir,speed:rnd(56,118),len,width:rnd(.7,1.45),color:pick(palette),phase:rnd(0,Math.PI*2),strength:rnd(.45,.82)}}
  function seed(){const n=w<640?2:3;hs=Array.from({length:n},(_,i)=>makeH(i));vs=Array.from({length:n},(_,i)=>makeV(i));hs.forEach((p,i)=>p.pos=rnd(-p.len,w+p.len)+i*step);vs.forEach((p,i)=>p.pos=rnd(-p.len,h+p.len)+i*step)}
  function resize(){dpr=Math.min(devicePixelRatio||1,1.5);w=Math.max(1,innerWidth);h=Math.max(1,innerHeight);layer.width=Math.floor(w*dpr);layer.height=Math.floor(h*dpr);layer.style.width=w+'px';layer.style.height=h+'px';c.setTransform(dpr,0,0,dpr,0,0);step=w<560?38:w<900?46:56;seed()}
  function range(p){return p.dir>0?[p.pos-p.len,p.pos]:[p.pos,p.pos+p.len]}
  function update(p,dt){p.pos+=p.speed*p.dir*dt;if(p.axis==='h'){if((p.dir>0&&p.pos-p.len>w+step)||(p.dir<0&&p.pos+p.len<-step))Object.assign(p,makeH())}else if((p.dir>0&&p.pos-p.len>h+step)||(p.dir<0&&p.pos+p.len<-step))Object.assign(p,makeV())}
  function drawH(p,time){const[a,b]=range(p),s=Math.max(-p.len,a),e=Math.min(w+p.len,b);if(e<=s)return;const sh=.72+.28*Math.sin(time*.003+p.phase),g=c.createLinearGradient(s,0,e,0);if(p.dir>0){g.addColorStop(0,`rgba(${p.color.rgb},0)`);g.addColorStop(.56,`rgba(${p.color.rgb},${.1*p.strength})`);g.addColorStop(.88,`rgba(${p.color.rgb},${.48*p.strength*sh})`);g.addColorStop(1,`rgba(${p.color.rgb},${.98*p.strength})`)}else{g.addColorStop(0,`rgba(${p.color.rgb},${.98*p.strength})`);g.addColorStop(.12,`rgba(${p.color.rgb},${.48*p.strength*sh})`);g.addColorStop(.44,`rgba(${p.color.rgb},${.1*p.strength})`);g.addColorStop(1,`rgba(${p.color.rgb},0)`)}c.save();c.strokeStyle=g;c.lineWidth=p.width;c.shadowColor=p.color.hex;c.shadowBlur=8+p.strength*12;c.beginPath();c.moveTo(s,p.y);c.lineTo(e,p.y);c.stroke();c.fillStyle=`rgba(${p.color.rgb},${.72*p.strength})`;c.shadowBlur=18;c.beginPath();c.arc(p.dir>0?e:s,p.y,1.1+p.width,0,Math.PI*2);c.fill();c.restore()}
  function drawV(p,time){const[a,b]=range(p),s=Math.max(-p.len,a),e=Math.min(h+p.len,b);if(e<=s)return;const sh=.7+.3*Math.sin(time*.0026+p.phase),g=c.createLinearGradient(0,s,0,e);if(p.dir>0){g.addColorStop(0,`rgba(${p.color.rgb},0)`);g.addColorStop(.58,`rgba(${p.color.rgb},${.08*p.strength})`);g.addColorStop(.9,`rgba(${p.color.rgb},${.42*p.strength*sh})`);g.addColorStop(1,`rgba(${p.color.rgb},${.92*p.strength})`)}else{g.addColorStop(0,`rgba(${p.color.rgb},${.92*p.strength})`);g.addColorStop(.1,`rgba(${p.color.rgb},${.42*p.strength*sh})`);g.addColorStop(.42,`rgba(${p.color.rgb},${.08*p.strength})`);g.addColorStop(1,`rgba(${p.color.rgb},0)`)}c.save();c.strokeStyle=g;c.lineWidth=p.width;c.shadowColor=p.color.hex;c.shadowBlur=8+p.strength*11;c.beginPath();c.moveTo(p.x,s);c.lineTo(p.x,e);c.stroke();c.fillStyle=`rgba(${p.color.rgb},${.66*p.strength})`;c.shadowBlur=16;c.beginPath();c.arc(p.x,p.dir>0?e:s,1+p.width,0,Math.PI*2);c.fill();c.restore()}
  function spark(x,y,a,b){const key=a.id+'|'+b.id,now=performance.now();if((cooldown.get(key)||0)>now)return;cooldown.set(key,now+1150);bursts.push({x,y,born:now,life:rnd(760,1320),color:Math.random()>.5?a.color:b.color,size:step*rnd(.82,1.08)});if(bursts.length>14)bursts.splice(0,bursts.length-14)}
  function intersections(){for(const a of hs){const[x0,x1]=range(a);for(const b of vs){const[y0,y1]=range(b);if(b.x>=x0&&b.x<=x1&&a.y>=y0&&a.y<=y1)spark(b.x,a.y,a,b)}}}
  function drawBurst(b,now){const p=Math.min(1,(now-b.born)/b.life),f=Math.sin(Math.PI*p);if(f<=.001)return false;const size=b.size*(1+p*.12),x=b.x-size/2,y=b.y-size/2;c.save();c.strokeStyle=`rgba(${b.color.rgb},${.38*f})`;c.lineWidth=.7+f*1.3;c.shadowColor=b.color.hex;c.shadowBlur=12+24*f;c.strokeRect(x,y,size,size);const g=c.createRadialGradient(b.x,b.y,0,b.x,b.y,step*.7);g.addColorStop(0,`rgba(${b.color.rgb},${.28*f})`);g.addColorStop(.22,`rgba(${b.color.rgb},${.11*f})`);g.addColorStop(1,`rgba(${b.color.rgb},0)`);c.fillStyle=g;c.fillRect(b.x-step,b.y-step,step*2,step*2);c.strokeStyle=`rgba(255,255,255,${.12*f})`;c.lineWidth=.8;c.beginPath();c.moveTo(b.x-step*.52,b.y);c.lineTo(b.x+step*.52,b.y);c.moveTo(b.x,b.y-step*.52);c.lineTo(b.x,b.y+step*.52);c.stroke();c.restore();return true}
  function reduced(){c.clearRect(0,0,w,h);c.save();c.globalAlpha=.13;c.lineWidth=.6;c.strokeStyle='#00ffff';for(let x=step;x<w;x+=step){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}c.strokeStyle='#ff00ff';for(let y=step;y<h;y+=step){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}c.restore()}
  function frame(now){if(!visible)return;const dt=Math.min((now-last)/1000,.045);last=now;if(reduceMotion.matches){reduced();return}c.clearRect(0,0,w,h);hs.forEach(p=>{update(p,dt);drawH(p,now)});vs.forEach(p=>{update(p,dt);drawV(p,now)});intersections();bursts=bursts.filter(b=>drawBurst(b,now));if(cooldown.size>32)cooldown.forEach((until,key)=>{if(until<now)cooldown.delete(key)});raf=requestAnimationFrame(frame)}
  function restart(){cancelAnimationFrame(raf);last=performance.now();if(reduceMotion.matches)reduced();else if(visible)raf=requestAnimationFrame(frame)}
  addEventListener('resize',resize,{passive:true});reduceMotion.addEventListener?.('change',restart);document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible)restart();else cancelAnimationFrame(raf)});resize();restart();
})();
