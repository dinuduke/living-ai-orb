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
