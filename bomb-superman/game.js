(function (root) {
  'use strict';
  const ROT = root.ROT || (typeof require === 'function' ? require('./vendor/rot.js') : null);
  const {MAPS,features}=root.BomberMaps || require('./maps.js');
  const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
  const W = 15, H = 13;
  const key = (x,y) => y*W+x;
  const spiral = () => {
    const cells=[];let left=1,right=W-2,top=1,bottom=H-2;
    while(left<=right&&top<=bottom){
      for(let x=left;x<=right;x++)cells.push([x,top]);top++;
      for(let y=top;y<=bottom;y++)cells.push([right,y]);right--;
      if(top<=bottom){for(let x=right;x>=left;x--)cells.push([x,bottom]);bottom--;}
      if(left<=right){for(let y=bottom;y>=top;y--)cells.push([left,y]);left++;}
    }
    return cells;
  };
  const ITEM_NAMES = {fire:'火焰',bomb:'炸弹',speed:'加速',kick:'脚踢',super:'超级火焰',remote:'遥控',glove:'手持手套',punch:'拳击手套',line:'串弹',skull:'骷髅',curse:'超级骷髅'};
  class ArenaGame {
    constructor(options = {}) {
      this.options = Object.assign({count:4,mode:'solo',difficulty:'normal',map:'garden',duration:180,seed:Date.now()}, options);
      this.rng = ROT.RNG.clone().setSeed(this.options.seed);
      this.time = 0; this.state = 'ready'; this.bombs = []; this.flames = []; this.items = new Map();
      this.pending = []; this.events = []; this.serial = 0; this.ring = 0; this.winner = null;
      this.stonePath=spiral();this.stoneIndex=0;this.nextStoneAt=this.options.duration;
      this.map=MAPS[this.options.map]||MAPS.garden;this.features=features(this.options.map);this.terrainVersion=0;this.bloomCycle=0;
      this.grid = Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>x===0||y===0||x===W-1||y===H-1||(!(x%2)&&!(y%2))?1:0));
      const starts = [[1,1],[13,11],[13,1],[1,11],[7,1],[7,11],[1,5],[13,5]];
      this.players = starts.slice(0,this.options.count).map(([x,y],id)=>({id,x,y,fromX:x,fromY:y,moved:-1,nextMove:0,dir:2,alive:true,ai:id>=(this.options.mode==='solo'?1:2),team:this.options.mode==='team'?(id<2?0:1):id,capacity:1,power:2,speed:0,kick:false,super:false,remote:0,glove:false,punch:false,line:false,curses:[],cursedUntil:0,lastBomb:-10,kills:0,nextThink:0}));
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
        const clear=this.players.some(p=>Math.abs(p.x-x)+Math.abs(p.y-y)<=2);
        const avenue=this.options.map==='cross'&&(x===7||y===5||y===7);
        if(!this.grid[y][x]&&!clear&&!avenue&&!this.features.has(key(x,y))&&this.rng.getUniform()<this.map.density)this.grid[y][x]=2;
      }
      this.players.forEach(p=>Object.assign(p,{moveDuration:0,intent:null,slide:null,portalUntil:0,arrived:true}));
      this.emit('ready','等待开局');
    }
    emit(type,text,extra={}) {this.events.push({type,text,...extra}); if(this.events.length>100)this.events.shift();}
    tile(x,y) {return this.grid[y]?.[x] ?? 1;}
    bombAt(x,y) {return this.bombs.find(b=>b.x===x&&b.y===y&&!b.exploded);}
    open(x,y) {return this.tile(x,y)===0&&!this.bombAt(x,y);}
    start(){if(this.state==='ready') {this.state='playing';this.emit('start','对局开始');}}
    pause(){if(this.state==='playing')this.state='paused';else if(this.state==='paused')this.state='playing';}
    curse(p,name){return p.cursedUntil>this.time&&p.curses.includes(name);}
    surface(x,y){return this.tile(x,y)===0?this.features.get(key(x,y)):undefined;}
    position(p,time=this.time){const t=p.moveDuration?Math.min(1,Math.max(0,(time-p.moved)/p.moveDuration)):1;return{x:p.fromX+(p.x-p.fromX)*t,y:p.fromY+(p.y-p.fromY)*t};}
    occupied(p){const at=this.position(p);return{x:Math.round(at.x),y:Math.round(at.y)};}
    interval(p){const type=this.surface(p.x,p.y)?.type,multiplier=type==='speed'?1.5:type==='mud'?.55:type==='ice'?1.25:1;return(this.curse(p,'slow')?.76:.44/(1+p.speed*.25))/multiplier;}
    move(p,dir){
      if(!p?.alive||this.state!=='playing'||this.time+1e-8<p.nextMove)return false;
      const [dx,dy]=DIRS[dir];p.dir=dir;
      const x=p.x+dx,y=p.y+dy,b=this.bombAt(x,y);
      if(b&&p.kick&&this.open(x+dx,y+dy)&&!this.players.some(a=>a.alive&&a.x===x+dx&&a.y===y+dy)){
        b.fromX=b.x;b.fromY=b.y;b.moved=this.time;b.moveDuration=.09;b.x+=dx;b.y+=dy;b.rolling=dir;b.rollAt=this.time+.09;b.kicker=p.id;
        this.items.delete(key(b.x,b.y));this.emit('kick','踢出炸弹');
      }
      if(!this.open(x,y))return false;
      const duration=this.interval(p),depart=this.time-p.nextMove<.02?p.nextMove:this.time;
      p.fromX=p.x;p.fromY=p.y;p.x=x;p.y=y;p.moved=depart;p.moveDuration=duration;p.nextMove=depart+duration;p.arrived=false;
      if(this.surface(x,y)?.type==='ice')p.slide=dir;else p.slide=null;
      return true;
    }
    makeBomb(p,x=this.occupied(p).x,y=this.occupied(p).y){
      if(!p.alive||this.state!=='playing'||this.curse(p,'noBomb')||!this.open(x,y)||this.bombs.filter(b=>b.owner===p.id).length>=p.capacity)return null;
      const remote=p.remote>0;if(remote)p.remote--;
      const b={id:++this.serial,x,y,owner:p.id,power:this.curse(p,'weak')?1:p.super?15:p.power,due:remote?Infinity:this.time+2,remote,placed:this.time,rolling:null,airUntil:0};
      this.bombs.push(b);this.emit('bomb','放置炸弹');return b;
    }
    place(p){
      if(!p?.alive||this.state!=='playing')return;
      const at=this.occupied(p),b=this.bombAt(at.x,at.y),double=this.time-p.lastBomb<.4;p.lastBomb=this.time;
      if(b&&b.owner===p.id&&p.glove){this.throwBomb(b,p.dir);return;}
      if(p.line&&double){const [dx,dy]=DIRS[p.dir];for(let n=1;n<W;n++){const x=at.x+dx*n,y=at.y+dy*n;if(!this.open(x,y)||!this.makeBomb(p,x,y))break;}return;}
      this.makeBomb(p);
    }
    throwBomb(b,dir){
      const [dx,dy]=DIRS[dir];
      for(let n=3;n<18;n++){
        const x=((b.x-1+dx*n)%(W-2)+(W-2))%(W-2)+1,y=((b.y-1+dy*n)%(H-2)+(H-2))%(H-2)+1;
        if(this.open(x,y)){b.fromX=b.x;b.fromY=b.y;b.x=x;b.y=y;b.airUntil=this.time+.3;b.due+=.3;b.rolling=null;this.emit('throw','抛出炸弹');return true;}
      }return false;
    }
    action(p){
      if(!p?.alive||this.state!=='playing')return;
      const remotes=this.bombs.filter(b=>b.owner===p.id&&b.remote);
      if(remotes.length){remotes.forEach(b=>this.explode(b));this.damage();this.checkEnd();return;}
      if(p.punch){const [dx,dy]=DIRS[p.dir],at=this.occupied(p),b=this.bombAt(at.x+dx,at.y+dy);if(b){this.throwBomb(b,p.dir);return;}}
      this.bombs.filter(b=>b.kicker===p.id).forEach(b=>b.rolling=null);
    }
    blast(b){
      const cells=[[b.x,b.y]];
      for(const [dx,dy] of DIRS)for(let n=1;n<=b.power;n++){
        const x=b.x+dx*n,y=b.y+dy*n,t=this.tile(x,y);if(t===1)break;
        cells.push([x,y]);if(t===2||this.bombAt(x,y))break;
      }return cells;
    }
    explode(b){
      if(b.exploded||!this.bombs.includes(b))return;
      // Resolve each ray against intact walls; chained bombs then share this blast instant.
      const cells=this.blast(b);b.exploded=true;this.bombs=this.bombs.filter(v=>v!==b);
      for(const [x,y] of cells){
        this.flames.push({x,y,until:this.time+.55,owner:b.owner});this.items.delete(key(x,y));
        if(this.tile(x,y)===2){this.grid[y][x]=0;this.terrainVersion++;if(this.rng.getUniform()<.48)this.pending.push({x,y,at:this.time+.6,type:this.rollItem()});}
        const chained=this.bombAt(x,y);if(chained)this.explode(chained);
      }this.emit('explode','炸弹引爆',{x:b.x,y:b.y});
    }
    rollItem(){return this.rng.getWeightedValue({fire:23,bomb:24,speed:18,kick:9,remote:5,glove:4,punch:4,line:4,super:2,skull:5,curse:2});}
    collect(p){
      const at=this.occupied(p),k=key(at.x,at.y),type=this.items.get(k);if(!type)return;this.items.delete(k);
      if(type==='fire')p.power=Math.min(10,p.power+1);
      if(type==='bomb')p.capacity=Math.min(8,p.capacity+1);
      if(type==='speed')p.speed=Math.min(5,p.speed+1);
      if(['kick','super'].includes(type))p[type]=true;
      if(type==='remote'){p.remote++;p.punch=false;}
      if(type==='punch'){p.punch=true;p.remote=0;}
      if(type==='glove'){p.glove=true;p.line=false;}
      if(type==='line'){p.line=true;p.glove=false;}
      if(type==='skull'||type==='curse'){p.curses=type==='curse'?['slow','weak','noBomb']:[['slow','weak','noBomb'][this.rng.getUniformInt(0,2)]];p.cursedUntil=this.time+15;}
      this.emit('pickup',`${p.id+1}P 获得${ITEM_NAMES[type]}`,{player:p.id});
    }
    damage(){for(const p of this.players){if(!p.alive)continue;const at=this.occupied(p),f=this.flames.find(f=>f.x===at.x&&f.y===at.y&&f.until>this.time);if(f)this.eliminate(p,f.owner);}}
    eliminate(p,owner=-1){
      if(!p.alive)return;const at=this.position(p);p.alive=false;p.eliminatedAt=this.time;
      if(owner>=0&&owner!==p.id)this.players[owner].kills++;
      this.emit('eliminate',`${p.id+1}P 已淘汰`,{player:p.id,x:at.x,y:at.y,dir:p.dir});
      const drops=[...Array(Math.min(3,p.capacity-1)).fill('bomb'),...Array(Math.min(3,p.power-2)).fill('fire')];
      const spaces=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(this.open(x,y)&&!this.items.has(key(x,y)))spaces.push([x,y]);
      for(const type of drops){if(!spaces.length)break;const index=this.rng.getUniformInt(0,spaces.length-1),[x,y]=spaces.splice(index,1)[0];this.pending.push({x,y,type,at:this.time+.7});}
    }
    dangers(extra){
      const map=new Map();const list=extra?[...this.bombs,extra]:this.bombs;
      const due=new Map(list.map(b=>[b,Number.isFinite(b.due)?b.due:this.time+1]));
      // Propagate fuse times through chains, not just each bomb's original timer.
      for(let n=0;n<list.length;n++)for(const b of list)for(const [x,y] of this.blast(b))for(const other of list)if(other.x===x&&other.y===y&&due.get(other)>due.get(b))due.set(other,due.get(b));
      for(const b of list)for(const [x,y] of this.blast(b)){const k=key(x,y);map.set(k,Math.min(map.get(k)??Infinity,due.get(b)));}
      for(const f of this.flames)map.set(key(f.x,f.y),this.time);
      if(this.options.map==='volcano')for(const [k,f] of this.features)if(f.type==='vent'&&this.tile(k%W,Math.floor(k/W))===0){const phase=this.time%8;if(phase>=6||phase<1.2&&this.time>=8)map.set(k,phase>=6?this.time+8-phase:this.time);}
      return map;
    }
    route(p,tx,ty,danger,escape=false){
      const path=[];
      new ROT.Path.AStar(tx,ty,(x,y)=>{
        if(x===p.x&&y===p.y)return true;
        if(!this.open(x,y))return false;
        const d=danger.get(key(x,y));return d===undefined||(escape&&d>this.time+(Math.abs(x-p.x)+Math.abs(y-p.y))*this.interval(p)+.3);
      },{topology:4}).compute(p.x,p.y,(x,y)=>path.push([x,y]));
      return path;
    }
    escape(p,danger){
      const targets=[];
      for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(this.open(x,y)&&!danger.has(key(x,y)))targets.push([x,y]);
      targets.sort((a,b)=>(Math.abs(a[0]-p.x)+Math.abs(a[1]-p.y))-(Math.abs(b[0]-p.x)+Math.abs(b[1]-p.y)));
      for(const [x,y] of targets.slice(0,45)){const path=this.route(p,x,y,danger,true);if(path.length>1)return path;}return [];
    }
    ai(p){
      if(!p.alive||this.time<p.nextThink||this.time+1e-8<p.nextMove)return;
      const level=this.options.difficulty;p.nextThink=this.time+.035;
      const danger=this.dangers();let path=[];
      if(danger.has(key(p.x,p.y)))path=this.escape(p,danger);
      else {
        const targets=[];
        for(const [k,type] of this.items){if(type==='skull'||type==='curse')continue;const x=k%W,y=Math.floor(k/W);if(!danger.has(k))targets.push({x,y,weight:0});}
        for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(this.open(x,y)&&!danger.has(key(x,y))&&DIRS.some(([dx,dy])=>this.tile(x+dx,y+dy)===2))targets.push({x,y,weight:4});
        for(const q of this.players)if(q.alive&&q.team!==p.team&&!danger.has(key(q.x,q.y)))targets.push({x:q.x,y:q.y,weight:2});
        targets.sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y)+a.weight)-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y)+b.weight));
        for(const t of targets.slice(0,12)){path=this.route(p,t.x,t.y,danger);if(path.length>1)break;}
        const nearBox=DIRS.some(([dx,dy])=>this.tile(p.x+dx,p.y+dy)===2);
        const hitEnemy=this.blast({x:p.x,y:p.y,power:p.super?15:p.power}).some(([x,y])=>this.players.some(q=>q.alive&&q.team!==p.team&&q.x===x&&q.y===y));
        if((nearBox||hitEnemy)&&this.time>1&&this.rng.getUniform()<(level==='easy'?.30:.75)){
          const hypothetical={x:p.x,y:p.y,power:p.super?15:p.power,due:this.time+2};const escape=this.escape(p,this.dangers(hypothetical));
          if(escape.length&&this.makeBomb(p)){path=escape;}
        }
      }
      const remote=this.bombs.find(b=>b.owner===p.id&&b.remote&&this.time-b.placed>2);
      if(remote&&!this.blast(remote).some(([x,y])=>x===p.x&&y===p.y))this.explode(remote);
      if(path.length>1){const [x,y]=path[1],dir=DIRS.findIndex(([dx,dy])=>p.x+dx===x&&p.y+dy===y);if(dir>=0)this.move(p,dir);}
    }
    checkEnd(){
      if(this.state!=='playing')return;const alive=this.players.filter(p=>p.alive),teams=new Set(alive.map(p=>p.team));
      if(teams.size<=1){this.state='over';this.winner=alive[0]?.team??null;this.emit('end',alive.length?this.options.mode==='team'?`${this.winner===0?'玩家队':'电脑队'}获胜`:`${alive[0].id+1}P 获胜`:'平局');}
    }
    petrifyNext(){
      let cell;
      while(this.stoneIndex<this.stonePath.length){
        const candidate=this.stonePath[this.stoneIndex++];
        if(this.tile(candidate[0],candidate[1])!==1){cell=candidate;break;}
      }
      if(!cell)return false;
      const [x,y]=cell;this.grid[y][x]=1;this.items.delete(key(x,y));
      this.pending=this.pending.filter(item=>item.x!==x||item.y!==y);
      this.bombs=this.bombs.filter(b=>b.x!==x||b.y!==y);
      for(const p of this.players){const at=this.occupied(p);if(p.alive&&(p.x===x&&p.y===y||at.x===x&&at.y===y))this.eliminate(p);}
      this.ring=Math.min(x,y,W-1-x,H-1-y);this.terrainVersion++;
      this.emit('stone','石化逼近，向中央移动',{x,y});return true;
    }
    update(dt){
      if(this.state!=='playing')return;this.time+=dt;
      this.flames=this.flames.filter(f=>f.until>this.time);
      this.updateTerrain();
      for(const b of [...this.bombs]){
        const belt=this.surface(b.x,b.y);if(belt?.type==='belt'&&b.rolling===null&&b.airUntil<=this.time&&this.time>=(b.beltAt||b.placed+.22)){b.rolling=belt.dir;b.rollAt=this.time;b.onBelt=true;}
        if(b.rolling!==null&&this.time>=b.rollAt){const [dx,dy]=DIRS[b.rolling];if(this.open(b.x+dx,b.y+dy)&&!this.players.some(p=>p.alive&&this.occupied(p).x===b.x+dx&&this.occupied(p).y===b.y+dy)){b.fromX=b.x;b.fromY=b.y;b.moved=this.time;b.moveDuration=b.onBelt?.20:.09;b.x+=dx;b.y+=dy;b.rollAt=this.time+b.moveDuration;this.items.delete(key(b.x,b.y));if(b.onBelt&&this.surface(b.x,b.y)?.type!=='belt'){b.rolling=null;b.onBelt=false;}}else{b.rolling=null;b.beltAt=this.time+.22;}}
        if((b.due<=this.time||this.flames.some(f=>f.x===b.x&&f.y===b.y))&&b.airUntil<=this.time)this.explode(b);
      }
      const remaining=[];for(const item of this.pending){if(item.at>this.time)remaining.push(item);else if(this.tile(item.x,item.y)===0&&!this.flames.some(f=>f.x===item.x&&f.y===item.y))this.items.set(key(item.x,item.y),item.type);}this.pending=remaining;
      this.damage();
      for(const p of this.players){
        if(!p.alive)continue;this.collect(p);
        if(this.time+1e-8<p.nextMove)continue;
        let surface=this.surface(p.x,p.y);
        if(surface?.type!=='portal')p.portalCell=null;
        if(surface?.type==='portal'&&p.portalCell!==key(p.x,p.y)&&this.time>=p.portalUntil&&this.open(surface.tx,surface.ty)&&!this.players.some(q=>q!==p&&q.alive&&q.x===surface.tx&&q.y===surface.ty)){
          p.x=surface.tx;p.y=surface.ty;p.fromX=p.x;p.fromY=p.y;p.moveDuration=0;p.portalCell=key(p.x,p.y);p.portalUntil=this.time+1;p.portalFlash=this.time;this.collect(p);surface=this.surface(p.x,p.y);this.emit('portal',`${p.id+1}P 穿越星门`);
        }
        if(surface?.type==='ice'&&p.slide!==null){if(this.move(p,p.slide))continue;p.slide=null;}
        if(surface?.type==='belt'&&this.move(p,surface.dir))continue;
        if(p.ai)this.ai(p);else if(p.intent!==null)this.move(p,p.intent);
      }
      this.damage();
      while(this.time>=this.nextStoneAt&&this.state==='playing'){
        if(!this.petrifyNext())break;
        this.nextStoneAt+=.25;
      }
      this.checkEnd();
    }
    updateTerrain(){
      const cycle=Math.floor(this.time/12);
      if(this.options.map==='garden'&&cycle>this.bloomCycle){this.bloomCycle=cycle;for(const [k,f] of this.features)if(f.type==='bloom'&&this.open(k%W,Math.floor(k/W))&&!this.flames.some(v=>key(v.x,v.y)===k)&&!this.items.has(k))this.items.set(k,['fire','bomb','speed'][(cycle+Math.floor(k/15))%3]);this.emit('supply','花圃补给成熟');}
      if(this.options.map==='volcano'&&this.time>=8&&this.time%8<1.2)for(const [k,f] of this.features)if(f.type==='vent'&&this.tile(k%W,Math.floor(k/W))===0&&!this.flames.some(v=>key(v.x,v.y)===k&&v.owner===-1)){this.flames.push({x:k%W,y:Math.floor(k/W),owner:-1,until:this.time+1.2-this.time%8});this.items.delete(k);}
    }
  }
  root.ArenaGame=ArenaGame;root.BomberData={W,H,DIRS,ITEM_NAMES};
  if(typeof module!=='undefined')module.exports={ArenaGame,W,H,DIRS,ITEM_NAMES};
})(typeof window!=='undefined'?window:globalThis);
