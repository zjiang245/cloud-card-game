const assert=require('node:assert/strict');
const {ArenaGame}=require('./game.js');
const {MAPS}=require('./maps.js');
function test(name,fn){fn();console.log('PASS',name);}
function fixture(map='garden'){const g=new ArenaGame({map,seed:17,duration:60});g.players.forEach(p=>p.ai=false);g.start();for(let y=1;y<12;y++)for(let x=1;x<14;x++)g.grid[y][x]=0;return g;}
function at(p,x,y){Object.assign(p,{x,y,fromX:x,fromY:y,moveDuration:0,nextMove:0,slide:null,intent:null});}
function tick(g,seconds){for(let i=0;i<Math.round(seconds*120);i++)g.update(1/120);}
test('continuous movement: no tile pause across 60 rendered samples',()=>{const g=fixture(),p=g.players[0];at(p,1,5);p.intent=1;g.move(p,1);let prev=g.position(p).x;const deltas=[];for(let i=0;i<60;i++){tick(g,1/60);const current=g.position(p).x;deltas.push(current-prev);prev=current;}assert(deltas.every(d=>d>.07&&d<.11),JSON.stringify(deltas));});
test('collision follows visible position, not next grid cell',()=>{const g=fixture(),p=g.players[0];g.move(p,1);g.flames.push({x:2,y:1,until:3,owner:1});g.damage();assert(p.alive);tick(g,.12);assert(!p.alive);});
test('ice carries motion without held input',()=>{const g=fixture('ice'),p=g.players[0];at(p,2,3);g.move(p,1);tick(g,.8);assert(p.x>5);assert.equal(p.y,3);});
test('roads accelerate and swamp slows travel',()=>{const normal=fixture('garden'),fast=fixture('cross'),slow=fixture('swamp');at(normal.players[0],7,5);at(fast.players[0],7,5);at(slow.players[0],7,5);assert(fast.interval(fast.players[0])<normal.interval(normal.players[0]));assert(slow.interval(slow.players[0])>normal.interval(normal.players[0]));});
test('belt transports both player and bomb',()=>{const g=fixture('factory'),p=g.players[0];at(p,3,3);const b=g.makeBomb(p,8,3);b.due=20;tick(g,.7);assert(p.x>3);assert(b.x>8);});
test('portals pair correctly, do not bounce, blocked exit stays blocked',()=>{const g=fixture('portal'),p=g.players[0];at(p,3,3);tick(g,.02);assert.equal(p.x,11);assert.equal(p.y,9);tick(g,2);assert.equal(p.x,11);assert.equal(p.y,9);const h=fixture('portal'),q=h.players[0];at(q,3,3);h.makeBomb(h.players[1],11,9);tick(h,.5);assert.equal(q.x,3);});
test('garden blooms replenish items periodically',()=>{const g=fixture();tick(g,12.1);assert.equal(g.items.size,4);for(const [k]of g.items)assert.equal(g.features.get(k).type,'bloom');});
test('volcano warns before damaging and chains nearby bombs',()=>{const g=fixture('volcano'),p=g.players[0];at(p,5,3);g.time=6;assert(g.dangers().has(3*15+5));assert(p.alive);const b=g.makeBomb(p);b.due=20;g.time=7.99;g.update(.02);assert.equal(g.bombs.length,0);assert(!p.alive);});
test('all seven maps preserve spawn exits and finish six-player AI games',()=>{for(const map of Object.keys(MAPS)){const g=new ArenaGame({map,count:6,seed:7,duration:20});for(const p of g.players)assert([[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy])=>g.open(p.x+dx,p.y+dy)));g.players.forEach(p=>p.ai=true);g.start();for(let i=0;i<7200&&g.state==='playing';i++)g.update(1/120);assert.equal(g.state,'over',map);}});
