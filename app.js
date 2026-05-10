
(() => {
  const app = document.getElementById('app');
  const poses = ['Idle','Walk','Run','Jump','Attack','Cast','Hurt','Victory'];
  const directions = ['Down','Left','Right','Up'];
  const defaults = {
    name:'Nova', theme:'default', body:'balanced', hair:'Brown', skin:'Warm', eyes:'Brown',
    top:'Tee', bottom:'Pants', shoes:'Boots', headwear:'None', accessory:'None',
    hairStyle:'Short', eyeStyle:'Round', facial:'Clean', pose:0, dir:0,
    speed:1.4, frames:8, frameSize:128, imageScale:1, imageX:0, imageY:0, imageRotate:0, opacity:1,
    showGuides:true, sourceMode:'single', bgTransparent:true, sheetColumns:4
  };
  const storageKey='spritesmith-studio-v3';
  const state = load() || {...defaults, abilities:{Dash:true, 'Double Jump':true, Shield:false, Fire:false, Ice:false, Fly:false, Stealth:false, Heal:false}};
  let img = null, imgUrl = '', previewCanvas, previewCtx, sheetCanvas, sheetCtx, previewTick = 0, lastExportData = null;

  const bodyPresets = {
    petite:{h:.92, head:1.05, shoulders:.86, waist:.88, legs:.98},
    balanced:{h:1, head:1, shoulders:1, waist:1, legs:1},
    athletic:{h:1.03, head:.95, shoulders:1.08, waist:.95, legs:1.05},
    bulky:{h:1, head:.92, shoulders:1.22, waist:1.12, legs:.96},
  };

  const skinMap = {Warm:'#d8a07e', Fair:'#f2d6c9', Tan:'#c98f68', Deep:'#7a4f3d', 'Cool Gray':'#9ea3ad', 'Fantasy Blue':'#6aa9d8'};
  const hairMap = {Black:'#1f1f26', Brown:'#5c3d2e', Blonde:'#d9bd6b', Red:'#a93c2e', White:'#eceff6', Blue:'#4b6bd9', Pink:'#dd74b9', Green:'#59b167'};
  const themeMap = {
    default:{bg:'#f4f6fb', a:'#5b7cfa', b:'#9b5de5', dark:'#253041', light:'#fff'},
    sunset:{bg:'#f8efe6', a:'#e76f51', b:'#f4a261', dark:'#2f2e41', light:'#fff7f1'},
    neon:{bg:'#12131a', a:'#7c5cff', b:'#2de2e6', dark:'#e9ecf1', light:'#1a1c26'},
    forest:{bg:'#edf6ec', a:'#2f855a', b:'#6bbf59', dark:'#1f2937', light:'#f6fbf5'},
  };

  function load(){try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}}
  function save(){try{localStorage.setItem(storageKey, JSON.stringify(state))}catch{}}
  function set(p){Object.assign(state,p);save(); scheduleRender();}
  function setAbility(name){state.abilities[name]=!state.abilities[name]; save(); scheduleRender();}
  function activeAbilities(){return Object.keys(state.abilities).filter(k=>state.abilities[k])}
  function cls(){const a=activeAbilities(); if(a.includes('Fly')) return 'Skyborne'; if(a.includes('Fire')||a.includes('Ice')) return 'Elemental'; if(a.includes('Shield')) return 'Guardian'; return 'Adventurer'}
  function code(){return btoa(unescape(encodeURIComponent(JSON.stringify(spec())))).replace(/=+$/,'')}
  function spec(){return {app:'SpriteSmith Studio', version:3, character:{name:state.name, theme:state.theme, body:state.body, hair:state.hair, skin:state.skin, eyes:state.eyes, top:state.top, bottom:state.bottom, shoes:state.shoes, headwear:state.headwear, accessory:state.accessory, hairStyle:state.hairStyle, eyeStyle:state.eyeStyle, facial:state.facial, pose:poses[state.pose], dir:directions[state.dir], abilities:activeAbilities(), class:cls()}, source:{mode:state.sourceMode, image:!!img}, settings:{speed:state.speed, frames:state.frames, frameSize:state.frameSize, imageScale:state.imageScale, imageX:state.imageX, imageY:state.imageY, imageRotate:state.imageRotate, opacity:state.opacity, bgTransparent:state.bgTransparent, showGuides:state.showGuides, sheetColumns:state.sheetColumns}, generatedAt:new Date().toISOString()};}
  function dl(name, content, type='text/plain;charset=utf-8'){const b=new Blob([content],{type}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function dlpng(canvas, name){canvas.toBlob(b=>{if(!b)return; const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000);}, 'image/png')}
  function escapeHtml(s){return String(s).replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
  function frameMotion(pose, frame, dir){
    const t = frame / Math.max(1, state.frames - 1);
    const wave = Math.sin(t * Math.PI * 2);
    const sign = dir === 1 ? -1 : dir === 2 ? 1 : 0;
    let x = 0, y = 0, r = 0, s = 1;
    if (pose === 'Idle') { y = Math.sin(t*Math.PI*2)*2; r = Math.sin(t*Math.PI*2)*.02; }
    else if (pose === 'Walk') { x = wave*6*sign; y = Math.abs(wave)*-3; r = wave*.04*sign; }
    else if (pose === 'Run') { x = wave*10*sign; y = Math.abs(wave)*-6; r = wave*.08*sign; s = 1.02; }
    else if (pose === 'Jump') { y = -18*Math.sin(t*Math.PI); r = -.05; s = 1.02 - Math.sin(t*Math.PI)*.04; }
    else if (pose === 'Attack') { x = Math.sin(t*Math.PI)*7*sign; r = Math.sin(t*Math.PI)*.08*sign; }
    else if (pose === 'Cast') { y = Math.sin(t*Math.PI*2)*3; r = Math.sin(t*Math.PI*2)*.03; }
    else if (pose === 'Hurt') { x = Math.sin(t*Math.PI*10)*3; r = Math.sin(t*Math.PI*10)*.05; }
    else if (pose === 'Victory') { y = -6 + Math.sin(t*Math.PI*2)*2; r = Math.sin(t*Math.PI*2)*.03; }
    return {x,y,r,s};
  }
  function roundRect(ctx, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  function drawBg(ctx,w,h){
    if (state.bgTransparent) { ctx.clearRect(0,0,w,h); return; }
    const t = themeMap[state.theme];
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,t.light);
    g.addColorStop(1,t.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.beginPath(); ctx.ellipse(w*0.5, h*0.83, w*0.23, h*0.06, 0, 0, Math.PI*2); ctx.fill();
  }
  function drawSource(ctx,w,h,poseIndex,frameIndex,dirIndex,allowImage=true){
    const t = themeMap[state.theme];
    const body = bodyPresets[state.body] || bodyPresets.balanced;
    const pose = poses[poseIndex];
    const m = frameMotion(pose, frameIndex, dirIndex);
    drawBg(ctx,w,h);
    if (img && allowImage) {
      const base = Math.min(w,h) * 0.7 * state.imageScale;
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const scale = base / Math.max(iw, ih);
      ctx.save();
      ctx.translate(w/2 + state.imageX + m.x, h/2 + state.imageY + m.y);
      ctx.rotate((state.imageRotate + m.r*180) * Math.PI / 180);
      ctx.globalAlpha = state.opacity;
      ctx.drawImage(img, -iw*scale/2, -ih*scale/2, iw*scale, ih*scale);
      ctx.restore();
      return;
    }
    const skin = skinMap[state.skin] || skinMap.Warm;
    const hair = hairMap[state.hair] || hairMap.Brown;
    const clothTop = state.top === 'Armor' ? t.b : state.top === 'Robe' ? t.light : t.a;
    const clothBottom = state.bottom === 'Armor Pants' ? t.b : state.bottom === 'Skirt' ? t.light : t.dark;
    const shoe = state.shoes === 'Sandals' ? t.b : t.dark;
    const cloak = state.accessory === 'Cape' ? t.b : state.accessory === 'Scarf' ? t.a : null;
    const active = activeAbilities();
    const baseX = w/2 + m.x;
    const bodyY = h*0.57 + m.y;
    const headY = h*0.29 + m.y;
    const bodyW = 44*body.shoulders*(w/256);
    const waistW = 28*body.waist*(w/256);
    const headR = 32*body.head*(w/256);
    const topH = 68*body.h*(h/256);
    const legH = 76*body.legs*(h/256);
    const legW = 16*(w/256);
    const moving = pose === 'Walk' || pose === 'Run';
    const jump = pose === 'Jump';
    const fight = pose === 'Attack' || pose === 'Hurt';
    const cast = pose === 'Cast';
    const win = pose === 'Victory';
    const armShift = fight ? 18 : cast ? 10 : moving ? (frameIndex % 2 ? 7 : -7) : 0;
    const legShift = moving ? (frameIndex % 2 ? 10 : -10) : jump ? 6 : 0;
    const bob = moving ? (frameIndex % 2 ? 3 : -3) : jump ? -10 : win ? -5 : 0;
    const y = m.y + bob;

    if (cloak) {
      ctx.fillStyle = cloak; ctx.globalAlpha = 0.84;
      ctx.beginPath();
      ctx.moveTo(baseX-bodyW*0.58, bodyY-18+y);
      ctx.quadraticCurveTo(baseX-bodyW*0.8, bodyY+20+y, baseX-bodyW*0.72, bodyY+72+y);
      ctx.lineTo(baseX+bodyW*0.72, bodyY+72+y);
      ctx.quadraticCurveTo(baseX+bodyW*0.8, bodyY+20+y, baseX+bodyW*0.58, bodyY-18+y);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
    }
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.beginPath(); ctx.ellipse(baseX, bodyY+84+y, 56*(w/256), 12*(h/256), 0,0,Math.PI*2); ctx.fill();

    ctx.fillStyle = clothTop;
    roundRect(ctx, baseX-waistW/2, bodyY-8+y, waistW, topH, 18); ctx.fill();
    ctx.fillRect(baseX-bodyW/2, bodyY-8+y, bodyW, 14);
    ctx.fillRect(baseX-bodyW/2, bodyY+40+y, bodyW, 14);

    ctx.save();
    ctx.translate(0, armShift+y);
    ctx.fillStyle = skin;
    drawRotRect(ctx, baseX-bodyW*0.72, bodyY+8-y, 14*(w/256), 46*(h/256), fight ? -26 : moving ? -10 : 8);
    drawRotRect(ctx, baseX+bodyW*0.58, bodyY+8-y, 14*(w/256), 46*(h/256), fight ? 26 : moving ? 10 : -8);
    drawCircle(ctx, baseX-bodyW*0.60, bodyY+56-y, 8*(w/256));
    drawCircle(ctx, baseX+bodyW*0.72, bodyY+56-y, 8*(w/256));
    ctx.restore();

    if (active.includes('Shield')) { ctx.fillStyle=t.b; ctx.globalAlpha=.9; ctx.beginPath(); ctx.moveTo(baseX+bodyW*0.72, bodyY+20+y); ctx.lineTo(baseX+bodyW*1.05, bodyY+28+y); ctx.lineTo(baseX+bodyW*.98, bodyY+58+y); ctx.lineTo(baseX+bodyW*.72, bodyY+70+y); ctx.lineTo(baseX+bodyW*.46, bodyY+58+y); ctx.lineTo(baseX+bodyW*.39, bodyY+28+y); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
    if (active.includes('Fire') && cast) { ctx.fillStyle='#ff9f1c'; ctx.globalAlpha=.9; ctx.beginPath(); ctx.moveTo(baseX+bodyW*.78, bodyY+8+y); ctx.quadraticCurveTo(baseX+bodyW*1.02, bodyY-8+y, baseX+bodyW*1.05, bodyY+20+y); ctx.quadraticCurveTo(baseX+bodyW*1.01, bodyY+40+y, baseX+bodyW*.75, bodyY+18+y); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
    if (active.includes('Ice') && cast) { ctx.fillStyle='#72d7ff'; ctx.globalAlpha=.9; ctx.beginPath(); ctx.moveTo(baseX+bodyW*.78, bodyY+8+y); ctx.lineTo(baseX+bodyW*.98, bodyY+38+y); ctx.lineTo(baseX+bodyW*.70, bodyY+22+y); ctx.lineTo(baseX+bodyW*1.00, bodyY+22+y); ctx.lineTo(baseX+bodyW*.70, bodyY+38+y); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }

    ctx.save();
    ctx.translate(0, legShift+y);
    ctx.fillStyle = clothBottom;
    drawRotRect(ctx, baseX-bodyW*0.23, bodyY+50-y, legW, legH, moving ? -14 : jump ? -8 : 0);
    drawRotRect(ctx, baseX+bodyW*0.08, bodyY+50-y, legW, legH, moving ? 14 : jump ? 8 : 0);
    ctx.fillStyle = shoe;
    drawRotRect(ctx, baseX-bodyW*0.30, bodyY+100-y, 24*(w/256), 12*(h/256), moving ? -10 : 0);
    drawRotRect(ctx, baseX+bodyW*0.03, bodyY+100-y, 24*(w/256), 12*(h/256), moving ? 10 : 0);
    ctx.restore();

    ctx.fillStyle = skin;
    drawCircle(ctx, baseX, headY, headR);
    if (state.headwear !== 'None' && state.headwear !== 'Helmet') { ctx.fillStyle = state.headwear === 'Crown' ? t.b : state.headwear === 'Hood' ? clothTop : t.dark; roundRect(ctx, baseX-headR, headY-headR+4, headR*2, 22*(h/256), 10); ctx.fill(); }
    if (state.headwear === 'Helmet') { ctx.fillStyle=t.dark; ctx.beginPath(); ctx.moveTo(baseX-headR-2, headY-18); ctx.quadraticCurveTo(baseX, headY-44, baseX+headR+2, headY-18); ctx.lineTo(baseX+headR-2, headY+10); ctx.lineTo(baseX-headR+2, headY+10); ctx.closePath(); ctx.fill(); }
    if (state.hairStyle !== 'Bald') { ctx.fillStyle=hair; ctx.beginPath(); ctx.moveTo(baseX-headR, headY-3); ctx.quadraticCurveTo(baseX-headR*.7, headY-36, baseX, headY-36); ctx.quadraticCurveTo(baseX+headR*.7, headY-36, baseX+headR, headY-3); ctx.quadraticCurveTo(baseX, headY-16, baseX-headR, headY-3); ctx.closePath(); ctx.fill(); }
    if (state.hairStyle === 'Long') { ctx.fillStyle=hair; ctx.beginPath(); ctx.moveTo(baseX-headR*.85, headY+2); ctx.quadraticCurveTo(baseX-headR*.8, headY+30, baseX-headR*.55, headY+64); ctx.lineTo(baseX-headR*.38, headY+62); ctx.quadraticCurveTo(baseX-headR*.56, headY+32, baseX-headR*.2, headY+8); ctx.closePath(); ctx.fill(); }
    if (state.hairStyle === 'Spiky') { ctx.fillStyle=hair; ctx.beginPath(); ctx.moveTo(baseX-headR*.7, headY-24); ctx.lineTo(baseX-headR*.3, headY-44); ctx.lineTo(baseX, headY-28); ctx.lineTo(baseX+headR*.3, headY-46); ctx.lineTo(baseX+headR*.72, headY-24); ctx.closePath(); ctx.fill(); }
    if (state.hairStyle === 'Curly') { ctx.fillStyle=hair; drawCircle(ctx, baseX-headR*.52, headY-18, 11*(w/256)); drawCircle(ctx, baseX+headR*.52, headY-18, 11*(w/256)); }
    if (state.hairStyle === 'Braided') { ctx.strokeStyle=hair; ctx.lineWidth=8*(w/256); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(baseX-10*(w/256), headY+4); ctx.quadraticCurveTo(baseX-14*(w/256), headY+20, baseX-6*(w/256), headY+58); ctx.moveTo(baseX+10*(w/256), headY+4); ctx.quadraticCurveTo(baseX+14*(w/256), headY+20, baseX+6*(w/256), headY+58); ctx.stroke(); }

    if (state.facial === 'Beard') { ctx.fillStyle=hair; ctx.globalAlpha=.85; ctx.beginPath(); ctx.moveTo(baseX-15*(w/256), headY+12); ctx.quadraticCurveTo(baseX-7*(w/256), headY+30, baseX, headY+38); ctx.quadraticCurveTo(baseX+7*(w/256), headY+30, baseX+15*(w/256), headY+12); ctx.quadraticCurveTo(baseX+7*(w/256), headY+42, baseX, headY+42); ctx.quadraticCurveTo(baseX-7*(w/256), headY+42, baseX-15*(w/256), headY+12); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
    if (state.facial === 'Moustache') { ctx.fillStyle=hair; ctx.globalAlpha=.9; ctx.beginPath(); ctx.moveTo(baseX-13*(w/256), headY+13); ctx.quadraticCurveTo(baseX-8*(w/256), headY+8, baseX, headY+12); ctx.quadraticCurveTo(baseX+8*(w/256), headY+8, baseX+13*(w/256), headY+13); ctx.quadraticCurveTo(baseX, headY+18, baseX-13*(w/256), headY+13); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
    if (state.facial === 'Scar') { ctx.strokeStyle='#8b3c3c'; ctx.lineWidth=3*(w/256); ctx.beginPath(); ctx.moveTo(baseX+7*(w/256), headY-2); ctx.lineTo(baseX+18*(w/256), headY+10); ctx.stroke(); }
    if (state.facial === 'Mask') { ctx.fillStyle=t.dark; roundRect(ctx, baseX-16*(w/256), headY+4, 32*(w/256), 16*(h/256), 8); ctx.fill(); }

    ctx.fillStyle = state.eyes === 'Glow' ? t.b : t.dark;
    drawCircle(ctx, baseX-14*(w/256), headY+2, 3.5*(w/256));
    drawCircle(ctx, baseX+14*(w/256), headY+2, 3.5*(w/256));
    if (state.eyeStyle === 'Sharp') { ctx.strokeStyle=t.dark; ctx.lineWidth=2*(w/256); ctx.beginPath(); ctx.moveTo(baseX-18*(w/256), headY-2); ctx.lineTo(baseX-9*(w/256), headY+1); ctx.lineTo(baseX-18*(w/256), headY+4); ctx.stroke(); }
    if (state.eyeStyle === 'Cat') { ctx.strokeStyle=t.dark; ctx.lineWidth=2*(w/256); ctx.beginPath(); ctx.moveTo(baseX-16*(w/256), headY+1); ctx.lineTo(baseX-12*(w/256), headY-2); ctx.lineTo(baseX-8*(w/256), headY+1); ctx.stroke(); }
    if (state.eyeStyle === 'Robot') { ctx.fillStyle=t.dark; roundRect(ctx, baseX-18*(w/256), headY-1, 8*(w/256), 8*(h/256), 2); ctx.fill(); }
    ctx.strokeStyle=t.dark; ctx.lineWidth=2.5*(w/256); ctx.beginPath(); ctx.moveTo(baseX-6*(w/256), headY+16); ctx.quadraticCurveTo(baseX, headY+22, baseX+6*(w/256), headY+16); ctx.stroke();
    if (state.eyeStyle === 'Sleepy') { ctx.beginPath(); ctx.moveTo(baseX-19*(w/256), headY+1); ctx.quadraticCurveTo(baseX-14*(w/256), headY-2, baseX-9*(w/256), headY+1); ctx.stroke(); }
    if (cast) { ctx.fillStyle=t.b; ctx.globalAlpha=.24; drawCircle(ctx, baseX+bodyW, bodyY+12+y, 18*(w/256)); ctx.globalAlpha=1; }
    if (win) { ctx.strokeStyle=t.a; ctx.lineWidth=4*(w/256); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(baseX-14*(w/256), headY+44); ctx.quadraticCurveTo(baseX, headY+36, baseX+14*(w/256), headY+44); ctx.stroke(); }
  }

  function drawCircle(ctx,x,y,r){ctx.beginPath(); ctx.arc(x,y,Math.max(1,r),0,Math.PI*2); ctx.fill()}
  function drawRotRect(ctx,x,y,w,h,deg){ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(deg*Math.PI/180); roundRect(ctx,-w/2,-h/2,w,h,Math.min(10,w/3,h/3)); ctx.fill(); ctx.restore()}

  function renderThumbnail(poseIndex, dirIndex){
    const c = document.createElement('canvas'); c.width = 180; c.height = 180;
    const ctx = c.getContext('2d');
    drawSource(ctx, 180, 180, poseIndex, 0, dirIndex, true);
    return c.toDataURL('image/png');
  }

  function render(){
    app.innerHTML = '';
    app.appendChild(buildUI());
    previewCanvas = app.querySelector('.preview-canvas');
    previewCtx = previewCanvas.getContext('2d');
    sheetCanvas = app.querySelector('.sheet-canvas');
    sheetCtx = sheetCanvas.getContext('2d');
    resizeCanvases();
    renderCanvases();
  }

  function buildUI(){
    const abilityChips = Object.keys(state.abilities).map(k => buttonChip(k, state.abilities[k], ()=>setAbility(k)));
    const poseCards = poses.map((p,i)=>el('button',{class:`pose-btn ${state.pose===i?'active':''}`, type:'button', onclick:()=>set('pose',i)},[
      el('div',{class:'canvas-frame'}, [el('img',{alt:p, src: renderThumbnail(i, state.dir)})]),
      el('div',{class:'pose-name'}, p)
    ]));
    const ui = el('div',{class:'shell'},[
      headerBar(),
      el('div',{class:'layout'},[
        leftColumn(),
        middleColumn(poseCards),
        rightColumn(abilityChips)
      ])
    ]);
    return ui;
  }

  function headerBar(){
    return el('div',{class:'topbar'},[
      el('div',{},[
        el('div',{class:'brand-badge'}, [el('span',{class:'dot'}), 'SpriteSmith Studio']),
        el('h1',{}, 'Free browser sprite studio'),
        el('p',{class:'lede'}, 'Design characters, load your own image, preview real motion in canvas, and export a sprite sheet PNG plus JSON project file — all with no paid backend.')
      ]),
      el('div',{class:'topbar-actions'},[
        el('button',{class:'btn primary', type:'button', onclick:randomize}, '⚡ Randomize'),
        el('button',{class:'btn', type:'button', onclick:()=>exportProject()}, '⬇ Export project')
      ])
    ]);
  }

  function section(title, icon, content){
    return el('div',{class:'panel'},[
      el('div',{class:'panel-header'},[el('div',{class:'panel-icon'},icon), el('div',{},title)]),
      el('div',{class:'panel-body'}, [content])
    ]);
  }

  function field(label, control){ return el('div',{class:'field'}, [el('label',{},label), control]); }
  function select(label, key, options){ return field(label, el('select',{value:state[key], onchange:e=>set({[key]:e.target.value})}, options.map(o=>el('option',{value:o, selected:state[key]===o?'selected':null}, o)))); }
  function range(label, key, min, max, step=1, suffix=''){ return el('div',{class:'range'}, [
    el('div',{class:'row'}, [el('span',{},label), el('span',{class:'value'}, `${state[key]}${suffix}`)]),
    el('input',{type:'range', min, max, step, value: state[key], oninput:e=>set({[key]: Number(e.target.value)})})
  ]); }
  function num(label,key,min,max,step=1){ return field(label, el('input',{type:'number', min,max,step, value:state[key], oninput:e=>set({[key]: Number(e.target.value)})})) }
  function buttonChip(text, active, onclick){
    return el('button',{class:`chip ${active ? 'active':''}`, type:'button', onclick}, [text]);
  }

  function leftColumn(){
    return el('div',{class:'column'},[
      section('Identity', '◎', el('div',{class:'stack'},[
        field('Character name', el('input',{type:'text', value:state.name, oninput:e=>set({name:e.target.value})})),
        el('div',{class:'grid-2'}, [select('Theme','theme',['default','sunset','neon','forest']), select('Body type','body',Object.keys(bodyPresets))]),
        el('div',{class:'grid-2'}, [select('Gender','gender',['Neutral','Female','Male']), select('Style','style',['pixel','vector','concept'])]),
      ])),
      section('Proportions', '⇱', el('div',{class:'stack'},[
        range('Height','frameSize',64,256,1), // actual sheet frame size
        range('Head size','frames',1,16,1),   // used as frame count
        range('Shoulders','speed',1,20,1),     // animation speed
        range('Waist','imageScale',10,300,1,'%'),
        range('Leg length','sheetColumns',1,8,1),
      ])),
      section('Clothing', '✚', el('div',{class:'grid-2'},[
        select('Headwear','headwear',['None','Cap','Hood','Crown','Bandana','Helmet']),
        select('Top','top',['Tee','Hoodie','Armor','Jacket','Robe','Tunic']),
        select('Bottom','bottom',['Shorts','Pants','Armor Pants','Skirt','Kilt']),
        select('Shoes','shoes',['Sneakers','Boots','Sandals','Barefoot','Heavy Boots']),
        select('Accessory','accessory',['None','Cape','Scarf','Backpack','Shoulder Pad','Amulet']),
      ])),
      section('Features', '◌', el('div',{class:'grid-2'},[
        select('Hair','hairStyle',featureOptions.hair), select('Eyes','eyeStyle',featureOptions.eyes),
        select('Facial','facial',featureOptions.facial), select('Skin','skin',Object.keys(skinMap)),
        select('Hair color','hair',Object.keys(hairMap)),
      ])),
    ]);
  }

  function middleColumn(poseCards){
    return el('div',{class:'column'},[
      section('Live preview', '◈', el('div',{class:'preview-wrap'},[
        el('div',{},[
          el('div',{class:'canvas-label'}, [el('span',{},'Real-time canvas'), el('span',{class:'badge'}, img ? 'image mode' : 'sprite mode')]),
          el('div',{class:'canvas-tools'},[
            el('button',{class:'btn small primary', type:'button', onclick:()=>set('pose',(state.pose+1)%poses.length)}, `Pose: ${poses[state.pose]}`),
            el('button',{class:'btn small', type:'button', onclick:()=>set('dir',(state.dir+1)%directions.length)}, `Direction: ${directions[state.dir]}`),
            el('button',{class:'btn small', type:'button', onclick:renderCanvases}, 'Refresh')
          ]),
          el('div',{class:'canvas-card'}, [el('div',{class:'canvas-frame'}, [previewCanvas = el('canvas',{class:'preview-canvas'})])])
        ]),
        el('div',{class:'meta-card'},[
          el('div',{class:'info-card'},[
            el('div',{class:'info-kicker'}, 'Character class'),
            el('div',{class:'info-title'}, cls()),
            el('div',{class:'info-sub'}, img ? 'Uploaded image is animated through canvas playback.' : 'Procedural sprite is rendered from the selected controls.')
          ]),
          el('div',{class:'info-card'},[
            el('div',{class:'info-kicker'}, 'Project JSON'),
            el('textarea',{class:'codebox', readonly:'readonly'}, JSON.stringify(spec(), null, 2))
          ]),
          el('div',{class:'info-card'},[
            el('div',{class:'info-kicker'}, 'Export'),
            el('div',{class:'footer-actions', style:'margin-top:10px'},[
              el('button',{class:'btn success', type:'button', onclick:exportSheet}, '⬇ PNG sheet'),
              el('button',{class:'btn', type:'button', onclick:exportJSON}, '⬇ JSON'),
              el('button',{class:'btn', type:'button', onclick:exportProject}, '⬇ Project')
            ])
          ])
        ])
      ])),
      section('Animation sets', '▦', el('div',{},[
        el('div',{class:'pose-grid'}, poseCards),
        el('div',{class:'notice', style:'margin-top:12px'}, 'Tap a tile to switch the active pose. Preview playback runs continuously in the canvas above.')
      ])),
      section('Sprite sheet', '▣', el('div',{class:'stack'},[
        el('div',{class:'canvas-label'}, [el('span',{},'Baked sheet preview'), el('span',{class:'badge'}, `${poses.length * directions.length * state.frames} frames`)]),
        el('div',{class:'canvas-card sheet'}, [el('div',{class:'canvas-frame'}, [sheetCanvas = el('canvas',{class:'sheet-canvas'})])]),
        el('div',{class:'notice'}, 'Download the generated PNG sheet for use in a game engine or editor.')
      ])),
      section('Abilities + motion', '✎', el('div',{class:'stack'},[
        el('div',{class:'chips'}, Object.keys(state.abilities).map(k => buttonChip(k, state.abilities[k], ()=>setAbility(k)))),
        el('div',{class:'grid-2', style:'margin-top:14px'},[
          el('div',{class:'stack'},[
            range('Animation speed','speed',1,20,1),
            range('Frames per pose','frames',1,16,1),
            range('Frame size','frameSize',64,256,1),
          ]),
          el('div',{class:'stack'},[
            range('Image scale','imageScale',25,400,1,'%'),
            range('Image X offset','imageX',-300,300,1),
            range('Image Y offset','imageY',-300,300,1),
          ]),
        ]),
      ])),
    ]);
  }

  function rightColumn(abilityChips){
    return el('div',{class:'column'},[
      section('Import image', '⤒', el('div',{class:'stack'},[
        el('div',{class:'upload-box'},[
          el('strong',{},'Load a character image'),
          el('small',{},'PNG with transparency is best, but JPG/WebP also work.'),
          el('div',{class:'footer-actions', style:'justify-content:center; margin-top:12px'},[
            el('label',{class:'btn primary'}, [
              'Choose file',
              el('input',{type:'file', accept:'image/*', style:'display:none', onchange:e=>loadImage(e.target.files && e.target.files[0])})
            ]),
            el('button',{class:'btn', type:'button', onclick:clearImage}, 'Clear')
          ])
        ]),
        el('div',{class:'grid-2'},[
          num('Rotation','imageRotate',-180,180,1),
          range('Opacity','opacity',0,100,1,'%'),
          select('Source mode','sourceMode',['single','sheet']),
          select('Display preset','dir',['0','1','2','3']),
        ]),
      ])),
      section('Workflow', '↺', el('div',{class:'stack'},[
        el('div',{class:'info-card'},[el('strong',{},'1. Load or design'), el('div',{class:'helper'},'Use the image uploader or the built-in sprite designer.')]),
        el('div',{class:'info-card'},[el('strong',{},'2. Preview motion'), el('div',{class:'helper'},'The canvas updates in real time and the preview animates continuously.')]),
        el('div',{class:'info-card'},[el('strong',{},'3. Export outputs'), el('div',{class:'helper'},'Download a PNG sheet and a JSON spec without any paid backend.')]),
      ])),
      section('Specs', '☁', el('div',{class:'stack'},[
        specRow('Repository mode','Static GitHub Pages'),
        specRow('Backend','None'),
        specRow('Mobile support','Yes'),
        specRow('Offline support','After first load'),
        specRow('Export formats','PNG / JSON'),
      ])),
      section('Project package', '⬒', el('div',{class:'stack'},[
        el('div',{class:'notice'}, 'This project is intentionally static and deploys free on GitHub Pages.'),
        el('div',{class:'footer-actions'},[
          el('button',{class:'btn success', type:'button', onclick:exportSheet}, '⬇ PNG sheet'),
          el('button',{class:'btn', type:'button', onclick:exportJSON}, '⬇ JSON'),
          el('button',{class:'btn', type:'button', onclick:exportProject}, '⬇ Project'),
        ])
      ])),
    ]);
  }

  function specRow(label, value){ return el('div',{class:'spec-row'}, [el('div',{class:'label'},label), el('div',{class:'value'},value)]) }

  function loadImage(file){
    if(!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      img = image;
      imgUrl = url;
      show('Image loaded', 'success');
      scheduleRender();
    };
    image.onerror = () => { URL.revokeObjectURL(url); show('Could not load image', 'danger'); };
    image.src = url;
  }

  function clearImage(){
    img = null;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = '';
    state.imageScale = 1; state.imageX = 0; state.imageY = 0; state.imageRotate = 0; state.opacity = 100;
    save();
    scheduleRender();
  }

  function show(msg, kind='info'){
    const prev = document.querySelector('.toast');
    if (prev) prev.remove();
    const div = el('div',{class:'toast'}, msg);
    div.style.cssText = `position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:${kind==='success'?'#0d8f52':kind==='danger'?'#c94242':'#0f172a'};color:#fff;padding:12px 16px;border-radius:999px;box-shadow:0 15px 35px rgba(0,0,0,.18);z-index:9999;font-size:13px;font-weight:700;max-width:92vw;text-align:center`;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 1700);
  }

  function renderCanvases(){
    if (!previewCanvas || !sheetCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const previewW = Math.max(320, previewCanvas.clientWidth);
    const previewH = Math.max(320, previewCanvas.clientHeight || previewW);
    previewCanvas.width = Math.round(previewW * dpr);
    previewCanvas.height = Math.round(previewH * dpr);
    previewCtx.setTransform(dpr,0,0,dpr,0,0);
    drawSource(previewCtx, previewW, previewH, state.pose, previewTick % Math.max(1,state.frames), state.dir, true);

    const size = Math.max(64, Number(state.frameSize)||128);
    const cols = Math.max(1, Number(state.sheetColumns)||4);
    const total = poses.length * directions.length * Math.max(1, Number(state.frames)||8);
    const rows = Math.ceil(total / cols);
    const sheetW = Math.max(640, sheetCanvas.clientWidth || cols * size);
    const sheetH = Math.max(360, Math.ceil((sheetW/cols) * rows));
    sheetCanvas.width = Math.round(sheetW * dpr);
    sheetCanvas.height = Math.round(sheetH * dpr);
    sheetCtx.setTransform(dpr,0,0,dpr,0,0);
    sheetCtx.clearRect(0,0,sheetW,sheetH);

    const cellW = sheetW / cols;
    const cellH = sheetH / rows;
    let i = 0;
    for (let p = 0; p < poses.length; p++) {
      for (let d = 0; d < directions.length; d++) {
        for (let f = 0; f < Math.max(1, Number(state.frames)||8); f++) {
          const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
          sheetCtx.save();
          sheetCtx.translate(x, y);
          sheetCtx.beginPath(); sheetCtx.rect(0,0,cellW,cellH); sheetCtx.clip();
          drawSource(sheetCtx, cellW, cellH, p, f, d, true);
          sheetCtx.restore();
          i++;
        }
      }
    }
  }

  function exportSheet(){ bakeSheet(); dlpng(sheetCanvas, `${state.name || 'sprite'}.sheet.png`); show('PNG sheet exported.', 'success'); }
  function exportJSON(){ dl(`${state.name || 'sprite'}.project.json`, JSON.stringify(spec(), null, 2), 'application/json;charset=utf-8'); show('JSON exported.', 'success'); }
  function exportProject(){ bakeSheet(); const payload = { spec: spec(), sheetPNG: sheetCanvas.toDataURL('image/png') }; dl(`${state.name || 'sprite'}.package.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8'); show('Project package exported.', 'success'); }

  function bakeSheet(){
    const size = Math.max(64, Number(state.frameSize)||128);
    const cols = Math.max(1, Number(state.sheetColumns)||4);
    const total = poses.length * directions.length * Math.max(1, Number(state.frames)||8);
    const rows = Math.ceil(total / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * size;
    canvas.height = rows * size;
    const ctx = canvas.getContext('2d');
    let i = 0;
    for (let p = 0; p < poses.length; p++) {
      for (let d = 0; d < directions.length; d++) {
        for (let f = 0; f < Math.max(1, Number(state.frames)||8); f++) {
          const x = (i % cols) * size, y = Math.floor(i / cols) * size;
          ctx.save();
          ctx.translate(x, y);
          drawSource(ctx, size, size, p, f, d, true);
          ctx.restore();
          i++;
        }
      }
    }
    lastExportData = canvas;
    return canvas;
  }

  function scheduleRender(){
    save();
    if (requestAnimationFrame._ss_pending) return;
    requestAnimationFrame._ss_pending = true;
    requestAnimationFrame(() => {
      requestAnimationFrame._ss_pending = false;
      renderCanvases();
      updateJsonBox();
    });
  }

  function updateJsonBox(){
    const ta = app.querySelector('.codebox');
    if (ta) ta.value = JSON.stringify(spec(), null, 2);
    const badge = app.querySelector('.badge');
    if (badge) badge.textContent = img ? 'image mode' : 'sprite mode';
  }

  function resize(){
    renderCanvases();
  }

  function tick(){
    previewTick++;
    renderCanvases();
    requestAnimationFrame(tick);
  }

  function bindGlobal(){
    window.addEventListener('resize', resize);
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadImage(f); });
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }

  render();
  bindGlobal();
  requestAnimationFrame(tick);
})();
