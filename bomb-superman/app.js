/* Local, offline UI and renderer. Simulation lives in game.js. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
  const atlas=new Image();atlas.src='assets/sprites.png';
  const characters=new Image();characters.src='assets/characters-directions.png';
  const punchArt=new Image();punchArt.src='assets/punch.svg';
  const gloveArt=new Image();gloveArt.src='assets/glove.svg';
  const skullArt=new Image();skullArt.src='assets/skull.svg';
  const curseArt=new Image();curseArt.src='assets/curse.svg';
  const remoteArt=new Image();remoteArt.src='assets/remote.svg';
  const lineArt=new Image();lineArt.src='assets/line.svg';
  const superArt=new Image();superArt.src='assets/super-fire.svg';
  const itemArt={punch:punchArt,glove:gloveArt,skull:skullArt,curse:curseArt,remote:remoteArt,line:lineArt,super:superArt};
  const terrain=document.createElement('canvas');terrain.width=canvas.width;terrain.height=canvas.height;
  const terrainCtx=terrain.getContext('2d');let terrainStamp='',rosterStamp='',accumulator=0;
  atlas.onload=()=>{terrainStamp='';};
  const colors=['#2583da','#e55656','#209461','#daa626','#9864cf','#2dabb8','#f58a24','#e96caf'];
  const names=['玩家一','玩家二','青叶','小金','紫电','冰蓝','流火','粉星'];
  const {W,H,DIRS,ITEM_NAMES}=BomberData;const S=60;
  $('map').innerHTML=Object.entries(BomberMaps.MAPS).map(([id,map])=>`<option value="${id}">${map.name}</option>`).join('');
  let game,keys=new Set(),soundOn=false,audio,previous=0,eventIndex=0,paintUI=0,recorded=false,deathFx=[],victoryFx=null,inventoryResume=false;
  const sounds={explode:new Audio('assets/audio/explosion.ogg'),pickup:new Audio('assets/audio/pickup.ogg'),eliminate:new Audio('assets/audio/player-down.ogg')};
  const soundPlayedAt={};
  Object.values(sounds).forEach(sound=>{sound.preload='auto';});
  let record={wins:0,rounds:0};try{record=JSON.parse(localStorage.getItem('bomb-superman-record'))||record;}catch{}
  const spriteIndexes={fire:12,bomb:13,speed:14,kick:15};
  function settings(){return{mode:$('mode').value,count:Number($('count').value),difficulty:$('difficulty').value,map:$('map').value,duration:Number($('duration').value)};}
  function newGame(start=false){game=new ArenaGame(settings());window.bomberGame=game;keys.clear();deathFx=[];victoryFx=null;accumulator=0;terrainStamp='';rosterStamp='';eventIndex=0;recorded=false;$('overlay').hidden=true;$('notice').textContent='等待开局';$('mapTag').textContent=game.map.tag;$('mapDescription').textContent=game.map.description;if(start){wakeAudio();game.start();}updateUI();canvas.focus({preventScroll:true});}
  function wakeAudio(){if(!soundOn)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();}catch{soundOn=false;}}
  function tone(freq,length=.09,type='sine',volume=.05){if(!soundOn||!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.4),audio.currentTime+length);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+length);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+length);}
  function playSound(name,volume=1){if(!soundOn)return;const now=performance.now();if(name==='explode'&&now-(soundPlayedAt[name]||0)<70)return;soundPlayedAt[name]=now;const sound=sounds[name].cloneNode();sound.volume=volume;sound.play().catch(()=>{});}
  function sprite(index,x,y,w,h=w,target=ctx){if(!atlas.complete||!atlas.naturalWidth)return;const sw=atlas.naturalWidth/4,sh=atlas.naturalHeight/4;target.drawImage(atlas,index%4*sw,Math.floor(index/4)*sh,sw,sh,x,y,w,h);}
  function character(p,x,y){
    if(!characters.complete||!characters.naturalWidth)return;
    const sw=characters.naturalWidth/4,sh=characters.naturalHeight/8;
    ctx.drawImage(characters,p.dir*sw,p.id*sh,sw,sh,x,y,58,62);
  }
  function drawDeath(fx,now){
    const elapsed=now-fx.started,x=fx.x*S,y=fx.y*S,gray=Math.min(1,elapsed/360),crumble=Math.max(0,Math.min(1,(elapsed-300)/720));
    const fade=elapsed>1900?Math.max(0,1-(elapsed-1900)/300):1;
    ctx.save();ctx.globalAlpha=fade;
    // Keep the character at full size while horizontal bands turn grey and crumble away.
    ctx.filter=`grayscale(${gray}) brightness(${1-gray*.35})`;
    for(let band=0;band<7;band++){
      const gone=crumble*8-band>1;if(gone)continue;
      ctx.save();ctx.beginPath();ctx.rect(x,y-6+band*9,60,9);ctx.clip();ctx.globalAlpha=Math.min(1,1-Math.max(0,crumble*8-band));character({id:fx.id,dir:fx.dir},x+1,y-6);ctx.restore();
    }
    ctx.filter='none';
    // Deterministic fragments fall from the dissolving body toward the forming ash pile.
    for(const dust of fx.dust){
      const t=Math.max(0,Math.min(1,(elapsed-dust.delay)/620));if(!t||t>=1)continue;
      const px=x+30+dust.fromX*(1-t)+dust.toX*t,py=y+8+dust.fromY*(1-t)+48*t-18*Math.sin(t*Math.PI);
      ctx.fillStyle=dust.shade;ctx.globalAlpha=fade*(1-t*.35);ctx.fillRect(px,py,dust.size,dust.size);
    }
    // The pile grows upward as four compact rows, giving it a clear pyramid silhouette.
    const pile=Math.max(0,Math.min(1,(elapsed-520)/600));
    if(pile>0){
      ctx.globalAlpha=fade;ctx.fillStyle='#42494455';ctx.beginPath();ctx.ellipse(x+30,y+56,25*pile,5,0,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.beginPath();ctx.rect(x+3,y+57-31*pile,54,32*pile);ctx.clip();ctx.fillStyle='#626965';ctx.beginPath();ctx.moveTo(x+5,y+56);ctx.quadraticCurveTo(x+17,y+49,x+28,y+29);ctx.quadraticCurveTo(x+31,y+25,x+34,y+31);ctx.quadraticCurveTo(x+43,y+48,x+55,y+56);ctx.closePath();ctx.fill();ctx.strokeStyle='#454b48';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      const rows=[[7,52],[5,45],[3,38],[1,31]];
      for(let row=0;row<rows.length;row++){
        const rowProgress=Math.max(0,Math.min(1,pile*4-row));if(!rowProgress)continue;
        const [count,cy]=rows[row];for(let i=0;i<count;i++){
          const cx=x+30+(i-(count-1)/2)*6;ctx.fillStyle=['#777d78','#929792','#555c58'][(i+row)%3];ctx.beginPath();ctx.arc(cx,y+cy+(1-rowProgress)*8,3.2,0,Math.PI*2);ctx.fill();
        }
      }
    }
    // Eyes appear at the summit, then roll down opposite slopes and settle beside the pile.
    const eyeT=Math.max(0,Math.min(1,(elapsed-1050)/600));
    if(elapsed>=980){
      for(const side of [-1,1]){
        const roll=eyeT*eyeT*(3-2*eyeT),ex=x+30+side*(4+15*roll),ey=y+27+24*roll-Math.sin(roll*Math.PI)*2;
        ctx.fillStyle='#f7f7ef';ctx.strokeStyle='#343b38';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(ex,ey,4.8,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle='#202523';ctx.beginPath();ctx.arc(ex+side*(1.1+roll),ey+1.2,2,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawVictory(fx,now){
    const elapsed=now-fx.started,x=fx.x*S,y=fx.y*S,active=Math.min(elapsed,3000);
    const bounce=Math.abs(Math.sin(active/720*Math.PI)),jump=12+bounce*34;
    const spin=elapsed<900?elapsed/900*Math.PI*2:Math.sin(elapsed/120)*.19;
    const stretch=1+bounce*.24,squash=1.18-bounce*.12;
    ctx.save();
    for(const bit of fx.confetti){
      const age=elapsed-bit.delay;if(age<0||age>2500)continue;
      const px=x+30+bit.dx+Math.sin(age/110+bit.phase)*8,py=y-45+(age*.075+bit.dy)%125;
      ctx.save();ctx.translate(px,py);ctx.rotate(age*.012*bit.turn);ctx.fillStyle=bit.color;ctx.fillRect(-bit.size/2,-bit.size,bit.size,bit.size*2);ctx.restore();
    }
    ctx.translate(x+30,y+50-jump);
    ctx.strokeStyle=`rgba(255,205,57,${.55+.3*Math.sin(elapsed/80)})`;ctx.lineWidth=3;
    for(let i=0;i<12;i++){const a=i*Math.PI/6+elapsed/500,r1=39+bounce*5,r2=51+bounce*8;ctx.beginPath();ctx.moveTo(Math.cos(a)*r1,Math.sin(a)*r1);ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);ctx.stroke();}
    ctx.save();ctx.rotate(spin);ctx.scale(squash,stretch);
    ctx.strokeStyle='#fff';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-17,-33);ctx.lineTo(-31,-55);ctx.moveTo(17,-33);ctx.lineTo(31,-55);ctx.stroke();
    ctx.strokeStyle=colors[fx.id];ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-17,-33);ctx.lineTo(-31,-55);ctx.moveTo(17,-33);ctx.lineTo(31,-55);ctx.stroke();
    ctx.fillStyle=colors[fx.id];ctx.strokeStyle='#fff';ctx.lineWidth=2;for(const side of [-1,1]){ctx.beginPath();ctx.arc(side*31,-55,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
    character({id:fx.id,dir:2},-29,-56);
    ctx.restore();
    ctx.translate(0,-70-bounce*3);ctx.fillStyle='#ffd23f';ctx.strokeStyle='#7d5510';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-17,9);ctx.lineTo(-15,-5);ctx.lineTo(-6,3);ctx.lineTo(0,-10);ctx.lineTo(7,3);ctx.lineTo(16,-5);ctx.lineTo(17,9);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#143b4b38';ctx.beginPath();ctx.ellipse(x+30,y+52,24-bounce*8,7-bounce*2,0,0,Math.PI*2);ctx.fill();
  }
  function startVictory(){
    const winner=game.players.find(p=>p.alive);if(!winner)return;
    const at=game.position(winner),confetti=Array.from({length:42},(_,i)=>({dx:((i*29)%111)-55,dy:(i*37)%90,delay:(i%9)*55,size:3+i%4,turn:i%2?1:-1,phase:i*.73,color:['#ffd23f','#ff6b45','#50c9a8','#6ea8ff','#f38acb'][i%5]}));
    victoryFx={id:winner.id,x:at.x,y:at.y,started:performance.now(),confetti};tone(784,.18,'triangle',.06);
  }
  function drawTerrain(){
    const stamp=`${game.options.map}:${game.options.seed}:${game.terrainVersion}:${atlas.complete}`;
    if(stamp===terrainStamp)return;terrainStamp=stamp;
    terrainCtx.imageSmoothingEnabled=true;terrainCtx.fillStyle=game.map.floor;terrainCtx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const t=game.tile(x,y),a=x*S,b=y*S;
      sprite(['ice','factory','portal','cross'].includes(game.options.map)?11:8,a,b,S,S,terrainCtx);
      terrainCtx.fillStyle=game.map.tint;terrainCtx.fillRect(a,b,S,S);
      if(t===1)sprite(9,a+1,b+1,S-2,S-2,terrainCtx);
      else if(t===2)sprite(10,a+2,b+2,S-4,S-4,terrainCtx);
    }
  }
  function drawFeatures(){
    for(const [k,f] of game.features){const x=k%W,y=Math.floor(k/W);if(game.tile(x,y)!==0)continue;const a=x*S,b=y*S;
      ctx.save();ctx.translate(a,b);
      if(f.type==='ice'){ctx.fillStyle='#d5f8ff99';ctx.fillRect(1,1,58,58);ctx.strokeStyle='#ffffffa0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,42);ctx.lineTo(42,8);ctx.moveTo(23,53);ctx.lineTo(53,23);ctx.stroke();}
      if(f.type==='speed'||f.type==='belt'){
        ctx.fillStyle=f.type==='speed'?'#e8bf347a':'#1d454bcc';ctx.fillRect(1,1,58,58);ctx.translate(30,30);ctx.rotate((f.dir??(x===7?0:1))*Math.PI/2);
        ctx.strokeStyle=f.type==='speed'?'#fff4a9':'#6ef4db';ctx.lineWidth=3;
        for(let i=-1;i<=1;i++){const shift=(game.time*(f.type==='belt'?22:12))%18;const y=i*18+shift-9;ctx.beginPath();ctx.moveTo(-11,y+6);ctx.lineTo(0,y-3);ctx.lineTo(11,y+6);ctx.stroke();}
      }
      if(f.type==='portal'){const color=f.group?'#ffb646':'#6fe8ff';ctx.fillStyle='#172c51bf';ctx.beginPath();ctx.ellipse(30,32,25,19,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(30,32,22,16,0,game.time*2,game.time*2+Math.PI*1.7);ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(30,32,12+Math.sin(game.time*3)*2,8,0,0,Math.PI*2);ctx.stroke();}
      if(f.type==='mud'){ctx.fillStyle='#4b6854c9';ctx.beginPath();ctx.roundRect(3,4,54,52,10);ctx.fill();ctx.strokeStyle='#abc88590';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(13+i*16,20+(i%2)*17,5+Math.sin(game.time*2+i)*2,2,0,0,Math.PI*2);ctx.stroke();}}
      if(f.type==='bloom'){ctx.fillStyle='#3a783faa';ctx.beginPath();ctx.roundRect(6,6,48,48,8);ctx.fill();for(const [fx,fy]of[[17,18],[40,20],[27,40]]){ctx.fillStyle='#fcecd8';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(fx+Math.cos(i*1.257)*5,fy+Math.sin(i*1.257)*5,3,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#f0b437';ctx.beginPath();ctx.arc(fx,fy,3,0,Math.PI*2);ctx.fill();}}
      if(f.type==='vent'){const phase=game.time%8,warn=phase>=6;ctx.fillStyle=warn?`rgba(245,105,35,${.4+Math.sin(game.time*13)*.2})`:'#573537';ctx.beginPath();ctx.roundRect(5,5,50,50,7);ctx.fill();ctx.strokeStyle=warn?'#ffe29c':'#ec9b56';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(13,12);ctx.lineTo(32,26);ctx.lineTo(20,39);ctx.lineTo(47,49);ctx.moveTo(32,26);ctx.lineTo(47,16);ctx.stroke();}
      ctx.restore();
    }
  }
  function draw(){
    const renderTime=game.time+(game.state==='playing'?accumulator:0),now=performance.now();
    ctx.imageSmoothingEnabled=true;drawTerrain();ctx.drawImage(terrain,0,0);drawFeatures();
    if(game.time>game.options.duration-5&&game.state==='playing'){
      const next=game.stonePath.slice(game.stoneIndex).find(([x,y])=>game.tile(x,y)!==1);
      if(next){ctx.fillStyle=`rgba(239,78,48,${.22+Math.sin(game.time*8)*.12})`;ctx.fillRect(next[0]*S,next[1]*S,S,S);}
    }
    for(const [k,type] of game.items){const x=k%W,y=Math.floor(k/W),offset=Math.sin(game.time*4+k)*2;
      if(itemArt[type]){const art=itemArt[type];if(art.complete&&art.naturalWidth)ctx.drawImage(art,x*S+3,y*S+2+offset,54,56);}
      else if(spriteIndexes[type]!==undefined)sprite(spriteIndexes[type],x*S+3,y*S+3+offset,54);
    }
    for(const b of game.bombs){let x=b.x*S,y=b.y*S;const scale=1+Math.sin((game.time-b.placed)*16)*.045;
      if(b.moveDuration&&b.airUntil<=game.time){const at=game.position(b,renderTime);x=at.x*S;y=at.y*S;}
      if(b.airUntil>game.time){const t=1-(b.airUntil-game.time)/.3;x=(b.fromX+(b.x-b.fromX)*t)*S;y=(b.fromY+(b.y-b.fromY)*t)*S-Math.sin(t*Math.PI)*65;}
      sprite(6,x+2-(scale-1)*28,y+2-(scale-1)*28,56*scale);
      if(b.remote){ctx.fillStyle='#91ffce';ctx.strokeStyle='#173f38';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+14,y+48,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }
    for(const f of game.flames){ctx.globalAlpha=Math.min(1,(f.until-game.time)*4);sprite(7,f.x*S-5,f.y*S-5,S+10);ctx.globalAlpha=1;}
    for(const p of game.players){if(!p.alive||victoryFx?.id===p.id)continue;const at=game.position(p,renderTime),x=at.x*S,y=at.y*S,t=p.moveDuration?Math.min(1,(renderTime-p.moved)/p.moveDuration):1;
      ctx.fillStyle='#143b4b42';ctx.beginPath();ctx.ellipse(x+30,y+48,18,7,0,0,Math.PI*2);ctx.fill();
      if(p.cursedUntil>game.time)ctx.globalAlpha=.6+Math.sin(game.time*14)*.3;
      character(p,x+1,y-6+(t<1?Math.sin(game.time*24)*1.2:0));ctx.globalAlpha=1;
      if(p.portalFlash&&game.time-p.portalFlash<.4){ctx.strokeStyle='#adf2ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x+30,y+30,20+(game.time-p.portalFlash)*45,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle=colors[p.id];ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x+17,y-8,27,16,4);ctx.fill();ctx.stroke();ctx.fillStyle='white';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(`${p.id+1}P`,x+30,y+4);ctx.textAlign='left';
    }
    deathFx=deathFx.filter(fx=>now-fx.started<2200);for(const fx of deathFx)drawDeath(fx,now);
    if(victoryFx&&now-victoryFx.started<3200)drawVictory(victoryFx,now);else if(victoryFx)victoryFx=null;
  }
  function renderPlayerInventory(){
    $('playerInventoryList').innerHTML=game.players.map(p=>{
      const playerName=p.ai&&p.id===1?'赤焰':names[p.id];
      const stats=[['fire','火力',game.curse(p,'weak')?1:p.super?'MAX':p.power],['bomb','炸弹',p.capacity],['boot','速度',game.curse(p,'slow')?'↓':p.speed+1]];
      const upgrades=stats.map(([icon,name,value])=>`<span class="loadout-stat" aria-label="${name} ${value}" title="${name}"><i class="item-sprite ${icon}" aria-hidden="true"></i><span>${name}<b>${value}</b></span></span>`).join('');
      const skills=[];
      if(p.kick)skills.push('<span class="loadout-skill" aria-label="脚踢" title="脚踢"><i class="item-sprite kick" aria-hidden="true"></i></span>');
      for(const type of ['super','glove','punch','line'])if(p[type])skills.push(`<span class="loadout-skill" aria-label="${ITEM_NAMES[type]}" title="${ITEM_NAMES[type]}"><img src="assets/${type==='super'?'super-fire':type}.svg" alt=""></span>`);
      if(p.remote)skills.push(`<span class="loadout-skill" aria-label="遥控 ${p.remote} 个" title="遥控"><img src="assets/remote.svg" alt=""><b>×${p.remote}</b></span>`);
      if(p.cursedUntil>game.time){const type=p.curses.length===3?'curse':'skull';skills.push(`<span class="loadout-skill" aria-label="${ITEM_NAMES[type]}" title="${ITEM_NAMES[type]}"><img src="assets/${type}.svg" alt=""></span>`);}
      return `<div class="loadout-row" role="listitem"><div class="loadout-player"><span class="portrait" style="background-image:url(assets/characters-directions.png);background-size:400% 800%;background-position:66.6667% ${p.id/7*100}%" aria-hidden="true"></span><strong>${p.id+1}P ${playerName}</strong><small>${p.alive?'存活':'淘汰'}</small></div><div class="loadout-stats">${upgrades}</div><div class="loadout-skills">${skills.join('')||'<span class="loadout-empty">无技能</span>'}</div></div>`;
    }).join('');
  }
  function updateUI(){
    const remaining=Math.max(0,Math.ceil(game.options.duration-game.time));$('timer').textContent=remaining?`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`:'石化中';
    const alive=game.players.filter(p=>p.alive);$('alive').textContent=`存活 ${alive.length}/${game.players.length}`;
    $('phase').textContent={ready:'准备就绪',playing:game.players[0].alive?'对局进行中':'已淘汰 · 观战中',paused:'已暂停',over:'本局结束'}[game.state];
    const locked=game.state==='playing'||game.state==='paused';$('settings').disabled=locked;$('start').disabled=locked;$('start').textContent=game.state==='over'?'再来一局':'开始对局';$('pause').disabled=!locked;$('pause').textContent=game.state==='paused'?'继续':'暂停';$('reset').textContent=locked?'结束对局':'重新布场';
    const p=game.players[0];$('power').textContent=game.curse(p,'weak')?1:p.super?'MAX':p.power;$('capacity').textContent=p.capacity;$('speed').textContent=game.curse(p,'slow')?'↓':p.speed+1;
    const abilities=['kick','super','glove','punch','line'].filter(k=>p[k]).map(k=>ITEM_NAMES[k]);if(p.remote)abilities.push(`遥控×${p.remote}`);if(p.cursedUntil>game.time)abilities.push(`中毒 ${Math.ceil(p.cursedUntil-game.time)}秒`);
    $('abilities').textContent=abilities.join(' · ')||$('map').selectedOptions[0].textContent;
    $('punchBadge').hidden=!p.punch;$('gloveBadge').hidden=!p.glove;
    $('rosterCount').textContent=`${game.players.length} 人`;
    const roster=game.players.map(p=>`<div class="player-row ${p.alive?'':'out'}"><span class="portrait" style="background-image:url(assets/characters-directions.png);background-size:400% 800%;background-position:66.6667% ${p.id/7*100}%"></span><div><strong>${p.id+1}P ${p.ai?(p.id===1?'赤焰':names[p.id]):names[p.id]}</strong><small>${p.ai?'电脑':'本机'}${game.options.mode==='team'?(p.team===0?' · 玩家队':' · 电脑队'):''} · ${p.kills} 击败</small></div><span class="status">${p.alive?(game.state==='ready'?'准备中':'存活'):'淘汰'}</span></div>`).join('');
    if(roster!==rosterStamp){$('roster').innerHTML=roster;rosterStamp=roster;}
    $('record').textContent=`${record.wins} 胜 / ${record.rounds} 场`;
    if(game.state==='over'&&!recorded){startVictory();recorded=true;record.rounds++;if(game.winner===game.players[0].team)record.wins++;try{localStorage.setItem('bomb-superman-record',JSON.stringify(record));}catch{}
      $('record').textContent=`${record.wins} 胜 / ${record.rounds} 场`;$('resultTitle').textContent=game.winner===null?'平局':game.options.mode==='team'?(game.winner===0?'玩家队获胜':'电脑队获胜'):`${game.winner+1}P 获胜`;$('resultNote').textContent=`对局 ${Math.floor(game.time)} 秒 · 玩家一击败 ${p.kills} 人`;$('overlay').hidden=deathFx.length>0||!!victoryFx;tone(520,.3,'triangle');
    }
    if(game.state==='over'&&recorded&&deathFx.length===0&&!victoryFx)$('overlay').hidden=false;
  }
  function input(){
    const controls=[['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'],['KeyW','KeyD','KeyS','KeyA']];
    game.players.filter(p=>!p.ai&&p.alive).forEach(p=>{const recent=[...keys].reverse().find(k=>controls[p.id].includes(k));p.intent=recent===undefined?null:controls[p.id].indexOf(recent);});
  }
  function frame(now){const dt=previous?Math.min(.10,Math.max(0,(now-previous)/1000)):0;previous=now;if(game.state==='playing'){input();accumulator+=dt;while(accumulator>=1/120&&game.state==='playing'){game.update(1/120);accumulator-=1/120;}}else accumulator=0;draw();
    while(eventIndex<game.events.length){const e=game.events[eventIndex++];if(e.type==='explode')playSound('explode',.72);if(e.type==='bomb')tone(200,.05,'sine',.02);if(e.type==='pickup'){playSound('pickup',.62);$('notice').textContent=e.text;}if(e.type==='eliminate'){playSound('eliminate',.72);const dust=Array.from({length:28},(_,i)=>({fromX:((i*17)%39)-19,fromY:((i*23)%49)-18,toX:((i*13)%43)-21,delay:260+(i%7)*65,size:2+i%3,shade:['#686e69','#858a85','#a0a49f'][i%3]}));deathFx.push({id:e.player,x:e.x,y:e.y,dir:e.dir,started:performance.now(),dust});}if(['eliminate','stone','start','end'].includes(e.type))$('notice').textContent=e.text;}
    // Events are consumed every frame; prevent an ever-growing event queue.
    game.events.length=0;eventIndex=0;
    if(now-paintUI>180){updateUI();paintUI=now;}requestAnimationFrame(frame);
  }
  function togglePause(){game.pause();keys.clear();updateUI();}
  const controlCodes=new Set(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Space','KeyZ','KeyA','KeyW','KeyD','KeyS','KeyF','KeyG','ShiftRight','KeyP','Escape']);
  window.addEventListener('keydown',e=>{
    if($('guide').open||$('playerInventory').open||['SELECT','INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(!controlCodes.has(e.code))return;e.preventDefault();
    if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)togglePause();return;}
    keys.add(e.code);if(e.repeat)return;
    const firstDirection=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].indexOf(e.code);
    if(firstDirection>=0)game.move(game.players[0],firstDirection);
    if(game.options.mode!=='solo'){const secondDirection=['KeyW','KeyD','KeyS','KeyA'].indexOf(e.code);if(secondDirection>=0)game.move(game.players[1],secondDirection);}
    if(e.code==='Space'||e.code==='KeyZ')game.place(game.players[0]);
    if(e.code==='ShiftRight'||(e.code==='KeyA'&&game.options.mode==='solo'))game.action(game.players[0]);
    if(game.options.mode!=='solo'){if(e.code==='KeyF')game.place(game.players[1]);if(e.code==='KeyG')game.action(game.players[1]);}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();if(game.state==='playing')togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(game.state==='playing')togglePause();}});
  $('start').onclick=()=>{if(game.state==='ready'){wakeAudio();game.start();updateUI();canvas.focus({preventScroll:true});}else newGame(true);};
  $('again').onclick=()=>newGame(true);$('pause').onclick=()=>{togglePause();canvas.focus({preventScroll:true});};$('reset').onclick=()=>{if(game.state==='playing'||game.state==='paused'){if(!confirm('结束当前对局并重新布场？'))return;}newGame();};
  $('settings').onchange=()=>{if($('mode').value==='team'&&$('count').value==='2')$('count').value='4';newGame();};
  $('sound').onclick=()=>{soundOn=!soundOn;$('sound').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('sound').textContent=soundOn?'♫':'♪';$('sound').style.background=soundOn?'#d3e7d8':'';wakeAudio();tone(660);};
  $('help').onclick=()=>{if(game.state==='playing')togglePause();$('guide').showModal();};$('closeHelp').onclick=()=>$('guide').close();
  $('showInventory').onclick=()=>{inventoryResume=game.state==='playing';if(inventoryResume)togglePause();renderPlayerInventory();$('playerInventory').showModal();};
  $('closeInventory').onclick=()=>$('playerInventory').close();
  $('playerInventory').onclose=()=>{if(inventoryResume&&game.state==='paused')togglePause();inventoryResume=false;canvas.focus({preventScroll:true});};
  const joystick=$('joystick'),joystickKnob=$('joystickKnob'),moveCodes=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'];
  let joystickPointer=null;
  function releaseJoystick(){moveCodes.forEach(code=>keys.delete(code));joystickPointer=null;joystickKnob.style.transform='translate(0,0)';}
  function steerJoystick(e){
    const rect=joystick.getBoundingClientRect(),dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),distance=Math.hypot(dx,dy),limit=30,scale=distance>limit?limit/distance:1;
    joystickKnob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;moveCodes.forEach(code=>keys.delete(code));
    if(distance<12)return;const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0);keys.add(moveCodes[dir]);game.move(game.players[0],dir);
  }
  joystick.onpointerdown=e=>{e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);steerJoystick(e);};
  joystick.onpointermove=e=>{if(e.pointerId===joystickPointer){e.preventDefault();steerJoystick(e);}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,releaseJoystick);
  for(const event of ['contextmenu','selectstart','dragstart'])$('touch-controls')?.addEventListener(event,e=>e.preventDefault());
  $('touchBomb').onpointerdown=e=>{e.preventDefault();game.place(game.players[0]);};$('touchAction').onpointerdown=e=>{e.preventDefault();game.action(game.players[0]);};
  atlas.onerror=()=>{$('notice').textContent='素材加载失败，请保持 assets 文件夹与游戏文件在一起。';};
  characters.onerror=()=>{$('notice').textContent='角色朝向图加载失败，请检查 assets/characters-directions.png。';};
  newGame();requestAnimationFrame(frame);
})();
