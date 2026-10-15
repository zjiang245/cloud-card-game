(function(root){
  'use strict';
  const MAPS={
    garden:{name:'花园小镇',tag:'花圃补给',description:'四处花圃每 12 秒长出一枚补给。',floor:'#729c59',tint:'#4a984318',density:.64},
    ice:{name:'冰晶广场',tag:'冰面惯性',description:'踏上冰道会持续滑行，离开冰面或遇障碍停止。',floor:'#96cddc',tint:'#bbecff30',density:.58},
    cross:{name:'十字街区',tag:'疾速跑道',description:'黄色跑道提升 50% 移速，抢占路口快速穿行。',floor:'#819599',tint:'#69768148',density:.63},
    factory:{name:'齿轮工厂',tag:'定向传送带',description:'传送带自动推动人物和炸弹，顺着箭头改变战线。',floor:'#748c91',tint:'#56697760',density:.60},
    portal:{name:'星门遗迹',tag:'成对传送',description:'同色星门互相连通，落点被炸弹占据时无法传送。',floor:'#7394b1',tint:'#627ac14a',density:.61},
    swamp:{name:'迷雾湿地',tag:'泥沼减速',description:'中央泥沼降低 45% 移速，外侧石路保持正常。',floor:'#91a780',tint:'#4b72524a',density:.54},
    volcano:{name:'熔岩裂谷',tag:'周期喷焰',description:'裂口每 8 秒喷火，提前 2 秒亮起警告，也会引爆炸弹。',floor:'#998385',tint:'#ac5c443d',density:.59},
    citadel:{name:'回廊要塞',tag:'四门城墙',description:'中央城墙只有四处入口，利用窄门截断追击与爆炸。',floor:'#8fa28b',tint:'#a7b9a332',density:.54,wallAccent:'#d8c481',laneTint:'#e9d9a747'},
    canyon:{name:'断桥峡谷',tag:'三线桥口',description:'两道石脊各留三座桥口，炸弹可封锁跨区路线。',floor:'#82abb4',tint:'#5c9eaa35',density:.57,wallAccent:'#8bd5da',laneTint:'#dbeae96b'},
    labyrinth:{name:'折线迷宫',tag:'错位关口',description:'三道横墙的入口左右交错，绕行时留意身后火线。',floor:'#a68f83',tint:'#c4866330',density:.51,wallAccent:'#e0af83',laneTint:'#ecd2b759'}
  };
  function obstacles(map){
    const walls=new Set(),lanes=new Set(),put=(set,x,y)=>set.add(y*15+x);
    if(map==='citadel'){
      for(const y of [3,9])for(let x=4;x<=10;x++)if(x!==7)put(walls,x,y);
      for(const x of [4,10])for(let y=4;y<=8;y++)if(y!==5)put(walls,x,y);
      for(let y=2;y<=10;y++)put(lanes,7,y);
      for(let x=3;x<=11;x++)put(lanes,x,5);
    }
    if(map==='canyon'){
      for(const y of [4,8])for(let x=2;x<=12;x++)if(![3,7,11].includes(x))put(walls,x,y);
      for(const x of [3,7,11])for(let y=3;y<=9;y++)put(lanes,x,y);
    }
    if(map==='labyrinth'){
      for(const [y,gap] of [[3,5],[6,9],[9,5]]){
        for(let x=1;x<=13;x++)if(x!==gap)put(walls,x,y);
        for(let py=y-1;py<=y+1;py++)put(lanes,gap,py);
      }
    }
    return {walls,lanes};
  }
  function features(map){
    const cells=new Map(),put=(x,y,type,data={})=>cells.set(y*15+x,{type,...data});
    if(map==='garden')for(const [x,y] of [[3,3],[11,3],[3,9],[11,9]])put(x,y,'bloom');
    if(map==='ice')for(const y of [3,9])for(let x=3;x<=11;x++)put(x,y,'ice');
    if(map==='cross')for(let y=1;y<12;y++)for(let x=1;x<14;x++)if(x===7||y===5||y===7)put(x,y,'speed');
    if(map==='factory')for(let x=3;x<=11;x++){put(x,3,'belt',{dir:1});put(x,9,'belt',{dir:3});}
    if(map==='portal')for(const [x,y,tx,ty,group] of [[3,3,11,9,0],[11,9,3,3,0],[11,3,3,9,1],[3,9,11,3,1]])put(x,y,'portal',{tx,ty,group});
    if(map==='swamp')for(let y=3;y<=9;y++)for(let x=5;x<=9;x++)if(x%2||y%2)put(x,y,'mud');
    if(map==='volcano')for(const [x,y] of [[5,3],[9,3],[5,9],[9,9]])put(x,y,'vent');
    return cells;
  }
  root.BomberMaps={MAPS,features,obstacles};if(typeof module!=='undefined')module.exports={MAPS,features,obstacles};
})(typeof window!=='undefined'?window:globalThis);
