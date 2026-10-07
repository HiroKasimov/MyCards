const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const content = $('#content');
const cardModal = $('#cardModal');
const vaultModal = $('#vaultModal');
const revealModal = $('#revealModal');
const cardForm = $('#cardForm');
const vaultForm = $('#vaultForm');
const searchInput = $('#searchInput');

const STORAGE_KEY = 'mycards_vault_v1';
const UI_KEY = 'mycards_ui_v1';
const DEMO_DELETED_KEY = 'mycards_demo_deleted_v1';
const ITERATIONS = 250000;

let state = {
  view: 'uzcard',
  cards: [],
  unlocked: false,
  demo: false,
  key: null,
  search: '',
  cardView: 'grid',
  auth: null,
  firebase: null,
  cloudLoaded: false,
};

const demoCards = [
  {id:'d1',type:'uzcard',num:'8600123456781234',exp:'12/28',name:'Asosiy',holder:'SHOKH KASIMOV',createdAt:Date.now()-600000},
  {id:'d2',type:'uzcard',num:'8600987612345678',exp:'09/27',name:'Ish',holder:'SHOKH KASIMOV',createdAt:Date.now()-500000},
  {id:'d3',type:'humo',num:'9860123456785678',exp:'11/27',name:'Kundalik',holder:'SHOKH KASIMOV',createdAt:Date.now()-400000},
  {id:'d4',type:'visa',num:'4023123412349012',exp:'09/28',name:'Online',holder:'SHOKH KASIMOV',createdAt:Date.now()-300000},
];

demoCards.push({id:'d5',type:'uzcard',num:'8600111122229012',exp:'11/29',name:'Zaxira',holder:'SHOKH KASIMOV'},{id:'d6',type:'humo',num:'9860222233334321',exp:'08/28',name:'Zaxira',holder:'SHOKH KASIMOV'},{id:'d7',type:'visa',num:'4023444455553456',exp:'01/29',name:'Sayohat',holder:'SHOKH KASIMOV'});

const typeMeta = {
  uzcard: {title:'UzCard', color:'cyan', prefix:'8600', subtitle:'Faqat UzCard kartalaringiz'},
  humo: {title:'Humo', color:'amber', prefix:'9860', subtitle:'Faqat Humo kartalaringiz'},
  visa: {title:'Visa', color:'violet', prefix:'4', subtitle:'Faqat Visa kartalaringiz'},
};

function loadUi(){
  try{
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if(ui.cardView) state.cardView = ui.cardView;
  }catch{}
}
function saveUi(){ localStorage.setItem(UI_KEY, JSON.stringify({cardView:state.cardView})); }

function bytesToBase64(bytes){
  let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin);
}
function base64ToBytes(str){
  const bin=atob(str); return Uint8Array.from(bin, c=>c.charCodeAt(0));
}
async function deriveKey(password, salt){
  const raw = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},
    baseKey,
    {name:'AES-GCM',length:256},
    false,
    ['encrypt','decrypt']
  );
}
async function encryptPayload(cards, key, salt){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify({cards,updatedAt:Date.now()}));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
  return {v:1,salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(cipher)),updatedAt:Date.now()};
}
async function decryptPayload(payload, password){
  const salt=base64ToBytes(payload.salt);
  const iv=base64ToBytes(payload.iv);
  const key=await deriveKey(password,salt);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,base64ToBytes(payload.ciphertext));
  const parsed=JSON.parse(new TextDecoder().decode(plain));
  return {key,salt,cards:Array.isArray(parsed.cards)?parsed.cards:[]};
}
async function persistCards(){
  if(state.demo || !state.key) return;
  const existing = getLocalVault();
  const salt = existing?.salt ? base64ToBytes(existing.salt) : crypto.getRandomValues(new Uint8Array(16));
  const payload = await encryptPayload(state.cards, state.key, salt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if(state.firebase?.user){
    try{
      await state.firebase.setDoc(state.firebase.docRef, {vault:payload,updatedAt:payload.updatedAt},{merge:true});
    }catch(err){ toast('Bulutga saqlashda xato', humanError(err), true); }
  }
}
function getLocalVault(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')}catch{return null}
}

function formatNumber(value=''){
  const n=value.replace(/\D/g,'').slice(0,16); return n.replace(/(.{4})/g,'$1 ').trim();
}
function maskedNumber(num=''){
  const n=num.replace(/\D/g,'');
  return `${n.slice(0,4) || '••••'} •••• •••• ${n.slice(-4) || '••••'}`;
}
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function humanError(err){ return (err?.message || 'Noma’lum xato').replace(/^Firebase:\s*/,'').slice(0,160); }

function toast(title, message='', error=false){
  const el=document.createElement('div'); el.className=`toast${error?' error':''}`;
  el.innerHTML=`<strong>${escapeHtml(title)}</strong>${message?`<p>${escapeHtml(message)}</p>`:''}`;
  $('#toastStack').append(el); setTimeout(()=>el.remove(),3200);
}

function setActiveView(view){
  state.view=view;
  $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
  $$('.mobile-nav button[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
  $('#sidebar').classList.remove('is-open');
  render();
}

function counts(){
  return {
    uzcard:state.cards.filter(c=>c.type==='uzcard').length,
    humo:state.cards.filter(c=>c.type==='humo').length,
    visa:state.cards.filter(c=>c.type==='visa').length,
  };
}
function updateCounts(){
  const c=counts(); $('#countUzcard').textContent=c.uzcard; $('#countHumo').textContent=c.humo; $('#countVisa').textContent=c.visa;
}

function homeView(){
  const c=counts();
  return `
    <section class="hero">
      <div class="hero__inner">
        <div>
          <span class="eyebrow">SECURE CARD HUB</span>
          <h1>Kartalaringiz</h1>
          <p>UzCard, Humo va Visa kartalaringiz bitta xavfsiz hubda. Har bir bo‘lim alohida filtrlanadi — aralash kartalar ko‘rinmaydi.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn--ghost" data-view-jump="settings">Xavfsizlik</button>
          <button class="btn btn--primary" data-add-card>+ Karta qo‘shish</button>
        </div>
      </div>
    </section>
    <div class="stat-grid">
      <div class="stat-card stat-card--cyan"><span>UzCard</span><strong>${c.uzcard}</strong><small>saqlangan karta</small></div>
      <div class="stat-card stat-card--amber"><span>Humo</span><strong>${c.humo}</strong><small>saqlangan karta</small></div>
      <div class="stat-card stat-card--violet"><span>Visa</span><strong>${c.visa}</strong><small>saqlangan karta</small></div>
      <div class="stat-card stat-card--green"><span>Vault</span><strong>${state.demo?'DEMO':'AES'}</strong><small>${state.demo?'namuna ma’lumot':'AES-GCM himoya'}</small></div>
    </div>
    <div class="home-cards">
      <section class="summary-panel">
        <div class="panel-head"><h2>Tezkor bo‘limlar</h2><span class="badge">Bitta hub</span></div>
        <div class="quick-switch">
          <button class="quick-card quick-card--uz" data-view-jump="uzcard"><strong>UzCard</strong><span>Faqat UzCard kartalari</span><b>${c.uzcard}</b></button>
          <button class="quick-card quick-card--hu" data-view-jump="humo"><strong>Humo</strong><span>Faqat Humo kartalari</span><b>${c.humo}</b></button>
          <button class="quick-card quick-card--vi" data-view-jump="visa"><strong>Visa</strong><span>Faqat Visa kartalari</span><b>${c.visa}</b></button>
        </div>
      </section>
      <section class="activity-panel">
        <div class="panel-head"><h2>Xavfsizlik holati</h2><span class="status-dot"></span></div>
        <div class="activity-list">
          <div class="activity-item"><div class="activity-item__ico">⌁</div><div><strong>AES-GCM shifrlash</strong><small>Karta payloadi shifrlangan</small></div><time>ON</time></div>
          <div class="activity-item"><div class="activity-item__ico">◈</div><div><strong>PBKDF2 kalit</strong><small>${ITERATIONS.toLocaleString()} iteratsiya</small></div><time>ON</time></div>
          <div class="activity-item"><div class="activity-item__ico">☁</div><div><strong>Bulut sinxroni</strong><small>${state.firebase?.user?'Google orqali ulangan':'Firebase sozlanmagan / guest'}</small></div><time>${state.firebase?.user?'ON':'OFF'}</time></div>
        </div>
      </section>
    </div>`;
}

let designCardId=null, designDraft=null, designFileReading=false, designSaving=false, designGeneration=0;
const MAX_DESIGN_FILE=300*1024;
const MAX_VAULT_CONTENT=600*1024;
function openDesign(id){
  const card=state.cards.find(c=>c.id===id);if(!card)return;
  designCardId=id;designDraft=normalizeDesign(card.design);designGeneration++;designFileReading=false;$('#saveDesignBtn').disabled=false;
  $('#designError').textContent='';$('#designFile').value='';
  $('#designTitle').textContent=`${typeMeta[card.type].title} · ${card.name||'Karta'} dizayni`;
  syncDesignControls();renderDesignPreview();$('#designModal').showModal();
}
function syncDesignControls(){
  $('#designPreset').value=designDraft.preset;$('#designSpeed').value=designDraft.speed;$('#designShade').value=designDraft.shade;
  $('#designSpeedValue').textContent=`${designDraft.speed}s`;$('#designShadeValue').textContent=`${designDraft.shade}%`;
  $('#designFileName').textContent=designDraft.fileName||'Hali fayl tanlanmagan';
}
function renderDesignPreview(){
  const card=state.cards.find(c=>c.id===designCardId);if(!card || !designDraft)return;
  $('#designPreview').innerHTML=cardHtml({...card,design:designDraft});
  $('#designPreview .payment-card').removeAttribute('tabindex');$('#designPreview .payment-card').removeAttribute('role');
  $('#designPreview .card-menu-btn').remove();
  $('#designPreview video')?.play().catch(()=>{});
}
function closeDesign(){
  designGeneration++;$('#designPreview').innerHTML='';designDraft=null;designCardId=null;$('#designFile').value='';$('#designModal').close();
}
async function uploadDesign(event){
  const file=event.target.files[0];if(!file || !designDraft)return;
  const allowed=['image/png','image/jpeg','image/webp','image/gif','video/webm','video/mp4'];
  if(!allowed.includes(file.type)){$('#designError').textContent='PNG, JPG, WebP, GIF, WebM yoki MP4 fayl tanlang.';event.target.value='';return}
  if(file.size>MAX_DESIGN_FILE){$('#designError').textContent='Fayl 300 KB dan katta. Kichikroq fayl yuklang.';event.target.value='';return}
  const generation=++designGeneration;designFileReading=true;$('#saveDesignBtn').disabled=true;$('#designError').textContent='';
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Faylni o‘qib bo‘lmadi'));reader.readAsDataURL(file)});
    if(generation!==designGeneration || !designDraft)return;
    const probe=document.createElement(file.type.startsWith('video/')?'video':'img');
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Faylni ochib bo‘lmadi. Boshqa fayl tanlang.')),8000);const done=()=>{clearTimeout(timer);resolve()};probe.onload=done;probe.onloadedmetadata=done;probe.onerror=()=>{clearTimeout(timer);reject(new Error('Fayl formati yoki mazmuni noto‘g‘ri.'))};probe.src=data});
    if(generation!==designGeneration || !designDraft)return;
    designDraft.media=data;designDraft.fileName=file.name;syncDesignControls();renderDesignPreview();
  }catch(error){if(generation===designGeneration)$('#designError').textContent=humanError(error)}
  finally{if(generation===designGeneration){designFileReading=false;$('#saveDesignBtn').disabled=designSaving}}
}
async function saveDesign(){
  if(!designDraft || designFileReading || designSaving)return;
  const previous=state.cards;
  const next=state.cards.map(card=>card.id===designCardId?{...card,design:normalizeDesign(designDraft)}:card);
  if(new TextEncoder().encode(JSON.stringify({cards:next,updatedAt:Date.now()})).length>MAX_VAULT_CONTENT){$('#designError').textContent='Yuklangan fonlar uchun joy to‘ldi. Biror fonni olib tashlang yoki kichikroq fayl tanlang.';return}
  designSaving=true;$('#saveDesignBtn').disabled=true;$('#designError').textContent='';
  try{state.cards=next;await persistCards();closeDesign();render();toast('Dizayn saqlandi',state.demo?'Demo rejimda vaqtincha saqlanadi.':'Shu kartaga alohida qo‘llandi.')}
  catch(error){state.cards=previous;$('#designError').textContent='Dizayn saqlanmadi. '+humanError(error)}
  finally{designSaving=false;$('#saveDesignBtn').disabled=designFileReading}
}

function normalizeDesign(input={}){
  const presets=['default','aurora','flow','pulse','still'];
  return {preset:presets.includes(input.preset)?input.preset:'default',speed:Math.min(16,Math.max(2,Number(input.speed)||8)),shade:Math.min(85,Math.max(0,Number.isFinite(Number(input.shade))?Number(input.shade):35)),media:typeof input.media==='string' && /^data:(image\/(png|jpeg|webp|gif)|video\/(webm|mp4));base64,[A-Za-z0-9+/=]+$/.test(input.media)?input.media:'',fileName:typeof input.fileName==='string'?input.fileName:''};
}
function cardHtml(card){
  const meta=typeMeta[card.type];
  const design=normalizeDesign(card.design);
  const media=design.media?(design.media.startsWith('data:video/')?`<video class="card-media" src="${design.media}" autoplay loop muted playsinline preload="metadata" aria-hidden="true"></video>`:`<img class="card-media" src="${design.media}" alt="" />`):'';
  return `<article class="payment-card type-${card.type} design-${design.preset}${media?' has-media':''}" style="--design-speed:${design.speed}s;--media-shade:${design.shade/100}" data-card-id="${escapeHtml(card.id)}" tabindex="0" role="button" aria-label="${meta.title} kartani ochish">
    ${media}<div class="card-media-shade"></div><div class="card-face">
    <div class="payment-card__top">
      <div class="card-network ${card.type}">${meta.title.toUpperCase()}</div>
      <button class="card-menu-btn" data-card-menu="${card.id}" type="button" aria-label="Karta menyusi">⋮</button>
    </div>
    <div class="card-chip-row"><div class="chip"></div><div class="contactless">)))</div></div>
    <div class="payment-card__number">${maskedNumber(card.num)}</div>
    ${card.name?`<div class="payment-card__label">${escapeHtml(card.name)}</div>`:''}
    <div class="payment-card__foot"><span>${escapeHtml(card.holder || 'CARD HOLDER')}</span></div>
    </div>
  </article>`;
}

function cardsView(type){
  const meta=typeMeta[type];
  const all=state.cards.filter(c=>c.type===type);
  const q=state.search.trim().toLowerCase();
  const cards=all.filter(c=>!q || c.name?.toLowerCase().includes(q) || c.holder?.toLowerCase().includes(q) || (/\d/.test(q) && c.num.includes(q.replace(/\D/g,''))));
  return `
    <section class="hero">
      <div class="hero__inner">
        <div>
          <span class="eyebrow">${meta.title.toUpperCase()} HUB</span>
          <h1>Kartalaringiz</h1>
          <p>${meta.title} kartalaringizni bu yerda boshqaring va xavfsiz saqlang.</p>
        </div>
        <div class="hero-actions"><button class="btn btn--primary ${type==='visa'?'pink':''}" data-add-card="${type}">+ ${meta.title} qo‘shish</button></div>
      </div>
    </section>
    <div class="hub-tabs" aria-label="Karta turini tanlash">${Object.entries(typeMeta).map(([key,m])=>`<button class="hub-tab ${key===type?'is-active':''}" data-view-jump="${key}"><span class="hub-logo ${key}">${key==='visa'?'VISA':key==='humo'?'H':'U'}</span>${m.title}<b>${counts()[key]}</b></button>`).join('')}</div>
    <section class="section">
      <div class="section-head">
        <div class="section-title"><h2>${meta.title} kartalarim</h2><span class="badge">${all.length} ta karta</span></div>
        <div class="view-toggle"><button class="${state.cardView==='grid'?'is-active':''}" data-card-view="grid">▦</button><button class="${state.cardView==='list'?'is-active':''}" data-card-view="list">☷</button></div>
      </div>
      <div class="cards-grid ${state.cardView==='list'?'list-view':''}">
        ${cards.length?cards.map(cardHtml).join(''):`<div class="empty-state"><div class="empty-state__icon">+</div><strong>${q?'Hech narsa topilmadi':'Hozircha karta yo‘q'}</strong><p>${q?'Qidiruvni o‘zgartirib ko‘ring.':`${meta.title} kartangizni qo‘shib boshlang.`}</p></div>`}
      </div>
      <div class="design-shortcut"><button class="btn btn--ghost" data-view-jump="settings" type="button">⚙ Karta dizaynlari</button></div>
    </section>
    <div class="info-grid">
      <div class="info-card"><div class="info-card__ico">✓</div><div><strong>AES-GCM himoyasi</strong><p>Kartalar brauzerga ochiq matnda yozilmaydi.</p></div></div>
      <div class="info-card"><div class="info-card__ico">G</div><div><strong>Google orqali kirish</strong><p>Firebase yoqilsa, foydalanuvchi bo‘yicha cloud sync ishlaydi.</p></div></div>
      <div class="info-card"><div class="info-card__ico">☁</div><div><strong>Bulutda saqlash</strong><p>Cloud’da ham shifrlangan vault payloadi saqlanadi.</p></div></div>
      <div class="info-card"><div class="info-card__ico">▣</div><div><strong>Tez nusxalash</strong><p>Raqam clipboard’ga bitta bosishda olinadi.</p></div></div>
    </div>`;
}

function settingsView(){
  return `
    <section class="hero"><div class="hero__inner"><div><span class="eyebrow">MYCARDS SETTINGS</span><h1>Sozlamalar</h1><p>Vault, cloud sync va interfeys holatini boshqaring.</p></div></div></section>
    <section class="settings-card design-settings"><h3>Karta dizaynlari</h3><p>Har bir kartaga alohida animatsiya yoki o‘z foningizni qo‘ying.</p>
      <div class="design-card-list">${state.cards.length?state.cards.map(card=>`<div class="design-card-item"><div><strong>${typeMeta[card.type].title} · ${escapeHtml(card.name||'Karta')}</strong><small>${maskedNumber(card.num)}</small></div><button class="btn btn--ghost" type="button" data-design-card="${escapeHtml(card.id)}">Dizaynni sozlash</button></div>`).join(''):'<p>Avval karta qo‘shing.</p>'}</div>
    </section>
    <div class="settings-grid">
      <section class="settings-card"><h3>Vault xavfsizligi</h3><p>Kartalar localStorage yoki Firestore’ga faqat AES-GCM shifrlangan payload sifatida yoziladi.</p>
        <div class="setting-row"><div><span>AES-GCM 256-bit</span><small>Web Crypto API</small></div><span class="status-dot"></span></div>
        <div class="setting-row"><div><span>PBKDF2</span><small>${ITERATIONS.toLocaleString()} iteratsiya, SHA-256</small></div><span class="status-dot"></span></div>
        <div class="setting-row"><div><span>CVV / PIN</span><small>Ataylab saqlanmaydi</small></div><strong>OFF</strong></div>
        <button class="btn btn--ghost" id="settingsLockBtn" type="button">Vaultni hozir qulflash</button>
      </section>
      <section class="settings-card"><h3>Google & Firestore</h3><p>firebase-config.js fayliga config kiritsangiz Google login va cloud sync yoqiladi.</p>
        <div class="setting-row"><div><span>Firebase</span><small>${window.MYCARDS_FIREBASE?.enabled?'Config yoqilgan':'Config o‘chirilgan'}</small></div><strong>${window.MYCARDS_FIREBASE?.enabled?'ON':'OFF'}</strong></div>
        <div class="setting-row"><div><span>Google account</span><small>${state.firebase?.user?escapeHtml(state.firebase.user.email || ''):'Ulanmagan'}</small></div><strong>${state.firebase?.user?'ON':'OFF'}</strong></div>
        <button class="btn btn--primary" id="settingsAuthBtn" type="button">${state.firebase?.user?'Google’dan chiqish':'Google bilan kirish'}</button>
      </section>
      <section class="settings-card"><h3>Ma’lumotlar</h3><p>Mahalliy vaultni eksport qilish yoki barcha kartalarni o‘chirish mumkin.</p>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn--ghost" id="exportBtn">Shifrlangan backup</button><button class="btn btn--danger" id="wipeBtn">Barcha kartalarni o‘chirish</button></div>
      </section>
      <section class="settings-card"><h3>Interfeys</h3><p>Desktop’da chap menyu, mobil qurilmada pastki nav. Har ikkisi bitta hub holatini boshqaradi.</p>
        <div class="setting-row"><div><span>Karta ko‘rinishi</span><small>Grid yoki list</small></div><strong>${state.cardView.toUpperCase()}</strong></div>
      </section>
    </div>`;
}

function render(){
  updateCounts();
  if(!state.unlocked){ content.innerHTML=''; return; }
  if(state.view==='home') content.innerHTML=cardsView('uzcard');
  else if(typeMeta[state.view]) content.innerHTML=cardsView(state.view);
  else content.innerHTML=settingsView();
  if(state.demo) content.innerHTML += '<div class="demo-note"><span>Demo rejim · Namuna kartalar</span><button class="btn btn--ghost" id="startVaultBtn">Shaxsiy vault yaratish / ochish</button></div>';
  bindRendered();
}

function bindRendered(){
  $$('[data-design-card]',content).forEach(button=>button.addEventListener('click',()=>openDesign(button.dataset.designCard)));
  $$('[data-view-jump]',content).forEach(b=>b.addEventListener('click',()=>setActiveView(b.dataset.viewJump)));
  $$('[data-add-card]',content).forEach(b=>b.addEventListener('click',()=>openCardModal(b.dataset.addCard || (typeMeta[state.view]?state.view:'uzcard'))));
  $$('[data-card-view]',content).forEach(b=>b.addEventListener('click',()=>{state.cardView=b.dataset.cardView;saveUi();render();}));
  $$('.payment-card',content).forEach(card=>{
    card.addEventListener('click',e=>{if(e.target.closest('[data-card-menu]'))return; openReveal(card.dataset.cardId);});
    card.addEventListener('keydown',e=>{if(e.target.closest('[data-card-menu]'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openReveal(card.dataset.cardId)}});
  });
  $$('[data-card-menu]',content).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openCardActionMenu(b.dataset.cardMenu,b);}));
  $$('[data-bulk]',content).forEach(b=>b.addEventListener('click',()=>handleBulk(b.dataset.bulk)));
  $('#startVaultBtn')?.addEventListener('click',openVaultModal);
  $('#settingsLockBtn')?.addEventListener('click',lockVault);
  $('#settingsAuthBtn')?.addEventListener('click',handleAuthButton);
  $('#exportBtn')?.addEventListener('click',exportVault);
  $('#wipeBtn')?.addEventListener('click',wipeCards);
}

function openCardModal(type='uzcard', card=null){
  $('#cardFormError').textContent='';
  if(state.demo){toast('Demo rejim','Karta qo‘shsangiz demo ichida vaqtincha saqlanadi.');}
  $('#cardModalTitle').textContent=card?'Kartani tahrirlash':'Karta qo‘shish';
  $('#editCardId').value=card?.id||'';
  $('#cardType').value=card?.type||type;
  $('#cardNumber').value=card?formatNumber(card.num):'';
  $('#cardExpiry').value=card?.exp||'';
  $('#cardLabel').value=card?.name||'';
  $('#cardHolder').value=card?.holder||'';
  updateTypePicker(card?.type||type);
  cardModal.showModal();
  setTimeout(()=>$('#cardNumber').focus(),50);
}
function updateTypePicker(type){
  $('#cardType').value=type;
  $$('#typePicker button').forEach(b=>b.classList.toggle('is-active',b.dataset.type===type));
  $('#cardNumber').placeholder=type==='uzcard'?'8600 1234 5678 1234':type==='humo'?'9860 1234 5678 1234':'4023 1234 5678 1234';
}

async function saveCardFromForm(){
  const num=$('#cardNumber').value.replace(/\D/g,'');
  const exp=$('#cardExpiry').value.trim();
  const type=$('#cardType').value;
  const id=$('#editCardId').value;
  if(num.length!==16){cardFormError('Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.','#cardNumber');return false}
  if(!/^\d{2}\/\d{2}$/.test(exp)){cardFormError('Amal qilish muddatini MM/YY shaklida kiriting. Masalan: 12/28.','#cardExpiry');return false}
  const month=Number(exp.slice(0,2));
  if(month<1 || month>12){cardFormError('Oy 01 dan 12 gacha bo‘lishi kerak.','#cardExpiry');return false}
  const oldCard=state.cards.find(c=>c.id===id);
  const card={id:id||uid(),type,num,exp,name:$('#cardLabel').value.trim(),holder:($('#cardHolder').value.trim()||'CARD HOLDER').toUpperCase(),createdAt:oldCard?.createdAt||Date.now(),...(oldCard?.design?{design:oldCard.design}:{})};
  const previous=state.cards;
  state.cards=id?state.cards.map(c=>c.id===id?card:c):[card,...state.cards];
  try{await persistCards()}catch(error){state.cards=previous;throw error}
  updateCounts(); render(); toast(id?'Karta yangilandi':'Karta qo‘shildi',state.demo?'Demo rejimda vaqtincha qo‘shildi.':`${typeMeta[type].title} vaultga saqlandi.`); return true;
}

function cardFormError(message, field){
  $('#cardFormError').textContent=message;
  if(field)$(field).focus();
}
let savingCard=false;
async function submitCard(){
  if(savingCard)return;
  savingCard=true;
  const button=$('#saveCardBtn');button.disabled=true;button.textContent='Saqlanmoqda…';
  $('#cardFormError').textContent='';
  try{if(await saveCardFromForm())cardModal.close()}
  catch(error){cardFormError('Saqlab bo‘lmadi. '+humanError(error))}
  finally{savingCard=false;button.disabled=false;button.textContent='Saqlash'}
}

function deletedDemoIds(){
  try{const ids=JSON.parse(localStorage.getItem(DEMO_DELETED_KEY)||'[]');return Array.isArray(ids)?ids:[]}catch{return []}
}
function rememberDemoDeletion(ids){
  const samples=new Set(demoCards.map(c=>c.id));
  const deleted=[...new Set([...deletedDemoIds(),...ids.filter(id=>samples.has(id))])];
  try{localStorage.setItem(DEMO_DELETED_KEY,JSON.stringify(deleted))}catch{}
}
let resolveDelete=null;
function askDelete(message){
  $('#deleteMessage').textContent=message;
  $('#deleteModal').showModal();
  return new Promise(resolve=>{resolveDelete=resolve});
}
function finishDelete(accepted){
  const resolve=resolveDelete;resolveDelete=null;
  $('#deleteModal').close();resolve?.(accepted);
}

let revealInterval=null;
function openReveal(id){
  const card=state.cards.find(c=>c.id===id); if(!card)return;
  $('#revealNumber').textContent=formatNumber(card.num); $('#revealExpiry').textContent=card.exp; $('#revealTimer').textContent='10s';
  $('#revealCopyBtn').onclick=()=>copyNumber(card);
  revealModal.showModal();
  clearInterval(revealInterval); let t=10;
  revealInterval=setInterval(()=>{t--; $('#revealTimer').textContent=`${t}s`; if(t<=0){clearInterval(revealInterval);revealModal.close();toast('Karta yana yashirildi');}},1000);
}
function closeReveal(){clearInterval(revealInterval); if(revealModal.open) revealModal.close();}
async function copyNumber(card){
  try{await navigator.clipboard.writeText(card.num);toast('Nusxalandi',`${typeMeta[card.type].title} raqami clipboard’da.`)}catch{toast('Nusxalab bo‘lmadi','Brauzer clipboard ruxsatini tekshiring.',true)}
}

function openCardActionMenu(id, anchor){
  const old=$('.floating-menu'); if(old)old.remove();
  const card=state.cards.find(c=>c.id===id); if(!card)return;
  const menu=document.createElement('div'); menu.className='floating-menu';
  Object.assign(menu.style,{position:'fixed',zIndex:90,minWidth:'155px',padding:'6px',border:'1px solid rgba(120,150,230,.25)',borderRadius:'11px',background:'rgba(7,13,33,.98)',boxShadow:'0 18px 55px rgba(0,0,0,.45)'});
  menu.innerHTML=`<button data-a="reveal">Ko‘rish</button><button data-a="copy">Nusxalash</button><button data-a="design">Dizayn</button><button data-a="edit">Tahrirlash</button><button data-a="delete" style="color:#ff7a95">O‘chirish</button>`;
  [...menu.children].forEach(btn=>Object.assign(btn.style,{width:'100%',height:'34px',border:'0',borderRadius:'7px',background:'transparent',textAlign:'left',padding:'0 9px',cursor:'pointer'}));
  const r=anchor.getBoundingClientRect(); menu.style.left=`${Math.max(8,Math.min(innerWidth-165,r.right-155))}px`; menu.style.top=`${Math.max(8,Math.min(innerHeight-190,r.bottom+6))}px`; document.body.append(menu);
  menu.addEventListener('click',async e=>{
    const a=e.target.dataset.a; if(!a)return; menu.remove();
    if(a==='reveal')openReveal(id); if(a==='copy')copyNumber(card); if(a==='design')openDesign(id);if(a==='edit')openCardModal(card.type,card); if(a==='delete')await deleteCard(id);
  });
  setTimeout(()=>document.addEventListener('click',function away(e){if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',away)}},{capture:true}),0);
}
async function deleteCard(id){
  const card=state.cards.find(c=>c.id===id); if(!card)return;
  if(!state.demo && !await askDelete(`${typeMeta[card.type].title} kartasini o‘chirishni tasdiqlaysizmi?`))return;
  const previous=state.cards;state.cards=state.cards.filter(c=>c.id!==id);
  try{await persistCards();if(state.demo)rememberDemoDeletion([id]);render();toast('Karta o‘chirildi')}
  catch(error){state.cards=previous;toast('O‘chirib bo‘lmadi',humanError(error),true)}
}
function currentTypeCards(){return typeMeta[state.view]?state.cards.filter(c=>c.type===state.view):[]}
function handleBulk(action){
  const first=currentTypeCards()[0]; if(!first)return;
  if(action==='reveal')openReveal(first.id); if(action==='copy')copyNumber(first); if(action==='delete')deleteCard(first.id);
}

function openVaultModal(){
  const exists=!!getLocalVault();
  $('#vaultGoogleBtn').classList.toggle('is-hidden', !window.MYCARDS_FIREBASE?.enabled);
  $('#vaultTitle').textContent=exists?'Vaultni ochish':'Yangi vault yaratish';
  $('#vaultLead').textContent=exists?'Kartalaringiz shifrlangan. Davom etish uchun vault parolini kiriting.':'Birinchi marta ochilyapti. Kartalarni shifrlash uchun faqat siz biladigan vault parolini yarating.';
  $('#vaultSubmitBtn').textContent=exists?'Ochish':'Vault yaratish';
  $('#vaultConfirmField').classList.toggle('is-hidden',exists);
  $('#vaultPassword').autocomplete=exists?'current-password':'new-password';
  if(!vaultModal.open) vaultModal.showModal(); setTimeout(()=>$('#vaultPassword').focus(),60);
}
async function unlockOrCreate(password, confirmPassword=''){
  const existing=getLocalVault();
  if(existing){
    try{
      const out=await decryptPayload(existing,password); state.key=out.key; state.cards=out.cards; state.unlocked=true; state.demo=false; vaultModal.close(); toast('Vault ochildi'); await maybeMergeCloud(password); render(); return true;
    }catch{toast('Parol noto‘g‘ri','Vaultni ochib bo‘lmadi.',true);return false}
  }
  if(password.length<8){toast('Parol juda qisqa','Kamida 8 ta belgi kiriting.',true);return false}
  if(password!==confirmPassword){toast('Parollar mos emas','Ikki maydonni bir xil kiriting.',true);return false}
  const salt=crypto.getRandomValues(new Uint8Array(16)); state.key=await deriveKey(password,salt); state.cards=[]; state.unlocked=true; state.demo=false;
  const payload=await encryptPayload(state.cards,state.key,salt); localStorage.setItem(STORAGE_KEY,JSON.stringify(payload)); vaultModal.close(); toast('Vault yaratildi','Endi kartalaringizni qo‘shishingiz mumkin.'); render(); return true;
}
function lockVault(){
  state.unlocked=false; state.key=null; state.cards=[]; state.demo=false; state.search=''; searchInput.value=''; closeReveal(); render(); openVaultModal(); toast('Vault qulflandi');
}
function enterDemo(){const deleted=new Set(deletedDemoIds());state.view='uzcard';state.cards=structuredClone(demoCards).filter(c=>!deleted.has(c.id));state.unlocked=true;state.demo=true;state.key=null;vaultModal.close();setActiveView('uzcard');updateProfile();toast('Demo rejim','Bu kartalar namuna, haqiqiy ma’lumot emas.');}

async function exportVault(){
  const payload=getLocalVault(); if(!payload){toast('Backup yo‘q','Avval real vault yarating.',true);return}
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`mycards-encrypted-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast('Backup tayyor','Fayl hali ham shifrlangan.');
}
async function wipeCards(){
  if(!await askDelete('Barcha kartalarni o‘chirishni tasdiqlaysizmi?'))return;
  const previous=state.cards;state.cards=[];
  try{await persistCards();if(state.demo)rememberDemoDeletion(demoCards.map(c=>c.id));render();toast('Kartalar o‘chirildi')}
  catch(error){state.cards=previous;toast('O‘chirib bo‘lmadi',humanError(error),true)}
}

async function initFirebase(){
  const cfg=window.MYCARDS_FIREBASE; if(!cfg?.enabled || !cfg.config?.apiKey)return;
  try{
    const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged},{getFirestore,doc,getDoc,setDoc}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    const app=initializeApp(cfg.config); const auth=getAuth(app); const db=getFirestore(app); const provider=new GoogleAuthProvider();
    state.firebase={auth,db,provider,signInWithPopup,signOut,getDoc,setDoc,doc,user:null,docRef:null};
    onAuthStateChanged(auth,user=>{state.firebase.user=user||null; state.firebase.docRef=user?doc(db,'users',user.uid,'data','cards'):null; updateProfile(); if(state.unlocked)render();});
  }catch(err){toast('Firebase yuklanmadi',humanError(err),true)}
}
async function hydrateCloudVault(){
  if(!state.firebase?.user) return false;
  try{
    const snap=await state.firebase.getDoc(state.firebase.docRef);
    const cloud=snap.exists()?snap.data()?.vault:null;
    if(!cloud){toast('Cloud vault topilmadi','Bu Google akkauntda hali MyCards vault yo‘q.');return false}
    localStorage.setItem(STORAGE_KEY,JSON.stringify(cloud));
    openVaultModal();
    toast('Cloud vault topildi','Endi vault parolingizni kiriting.');
    return true;
  }catch(err){toast('Cloud vaultni olib bo‘lmadi',humanError(err),true);return false}
}

async function handleAuthButton(){
  if(!state.firebase){toast('Firebase sozlanmagan','firebase-config.js ichida config kiriting va enabled: true qiling.');return}
  try{
    if(state.firebase.user){await state.firebase.signOut(state.firebase.auth);toast('Google’dan chiqildi')}
    else{await state.firebase.signInWithPopup(state.firebase.auth,state.firebase.provider);toast('Google bilan kirildi'); if(state.unlocked && !state.demo)await syncCloudFromLocal();}
  }catch(err){toast('Google login xatosi',humanError(err),true)}
}
async function syncCloudFromLocal(){
  if(!state.firebase?.user || state.demo)return;
  const local=getLocalVault(); if(!local)return;
  await state.firebase.setDoc(state.firebase.docRef,{vault:local,updatedAt:local.updatedAt||Date.now()},{merge:true});
}
async function maybeMergeCloud(password){
  if(!state.firebase?.user || state.cloudLoaded)return;
  try{
    const snap=await state.firebase.getDoc(state.firebase.docRef); state.cloudLoaded=true;
    if(!snap.exists()){await syncCloudFromLocal();return}
    const cloud=snap.data()?.vault; const local=getLocalVault(); if(!cloud)return;
    if((cloud.updatedAt||0)>(local?.updatedAt||0)){
      const out=await decryptPayload(cloud,password); state.key=out.key; state.cards=out.cards; localStorage.setItem(STORAGE_KEY,JSON.stringify(cloud)); toast('Cloud vault yuklandi','Yangiroq nusxa Firestore’dan olindi.');
    }else if(local){await syncCloudFromLocal()}
  }catch(err){toast('Cloud sync bajarilmadi',humanError(err),true)}
}
function updateProfile(){
  const u=state.firebase?.user; $('#profileName').textContent=u?.displayName || 'Shox'; $('#profileStatus').textContent=u?.email || (state.demo?'Demo mode':'Local vault'); const initial=(u?.displayName||'S').trim()[0]?.toUpperCase()||'S'; $('#profileAvatar').textContent=initial;
}

$('#mobileMenuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('is-open'));
$('#designPreset').addEventListener('change',event=>{if(!designDraft)return;designDraft.preset=event.target.value;renderDesignPreview()});
$('#designSpeed').addEventListener('input',event=>{if(!designDraft)return;designDraft.speed=Number(event.target.value);syncDesignControls();renderDesignPreview()});
$('#designShade').addEventListener('input',event=>{if(!designDraft)return;designDraft.shade=Number(event.target.value);syncDesignControls();renderDesignPreview()});
$('#designFile').addEventListener('change',uploadDesign);
$('#removeDesignFileBtn').addEventListener('click',()=>{if(!designDraft)return;designGeneration++;designFileReading=false;$('#saveDesignBtn').disabled=designSaving;designDraft.media='';designDraft.fileName='';$('#designFile').value='';$('#designError').textContent='';syncDesignControls();renderDesignPreview()});
$('#resetDesignBtn').addEventListener('click',()=>{if(!designDraft)return;designGeneration++;designFileReading=false;$('#saveDesignBtn').disabled=designSaving;designDraft=normalizeDesign();$('#designFile').value='';$('#designError').textContent='';syncDesignControls();renderDesignPreview()});
$('#saveDesignBtn').addEventListener('click',saveDesign);
$$('[data-close-design]').forEach(button=>button.addEventListener('click',closeDesign));
$('#designModal').addEventListener('cancel',event=>{event.preventDefault();closeDesign()});
$$('.nav-item[data-view], .mobile-nav button[data-view]').forEach(b=>b.addEventListener('click',()=>setActiveView(b.dataset.view)));
$('#openAddCardSide').addEventListener('click',()=>openCardModal(typeMeta[state.view]?state.view:'uzcard'));
$('#lockNowBtn').addEventListener('click',lockVault);
$('#authBtn').addEventListener('click',handleAuthButton);
searchInput.addEventListener('input',()=>{state.search=searchInput.value; if(typeMeta[state.view])render();});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchInput.focus()}});
$$('[data-toggle-password]').forEach(b=>b.addEventListener('click',()=>{const i=$(b.dataset.togglePassword); i.type=i.type==='password'?'text':'password'; b.textContent=i.type==='password'?'Ko‘rish':'Yashirish';}));
$$('#typePicker button').forEach(b=>b.addEventListener('click',()=>updateTypePicker(b.dataset.type)));
$('#cardNumber').addEventListener('input',e=>e.target.value=formatNumber(e.target.value));
$('#cardExpiry').addEventListener('input',e=>{let v=e.target.value.replace(/\D/g,'').slice(0,4); if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2); e.target.value=v;});
$$('[data-close-card]',cardForm).forEach(button=>button.addEventListener('click',()=>cardModal.close()));
$('#saveCardBtn').addEventListener('click',submitCard);
cardForm.addEventListener('submit',e=>{e.preventDefault();submitCard()});
cardForm.addEventListener('keydown',e=>{if(e.key==='Enter' && e.target.tagName==='INPUT'){e.preventDefault();submitCard()}});
let openingVault=false;
async function submitVault(){
  if(openingVault)return;
  openingVault=true;$('#vaultSubmitBtn').disabled=true;
  try{await unlockOrCreate($('#vaultPassword').value,$('#vaultPasswordConfirm').value)}
  catch(error){toast('Vaultni ochib bo‘lmadi',humanError(error),true)}
  finally{openingVault=false;$('#vaultSubmitBtn').disabled=false}
}
$('#vaultSubmitBtn').addEventListener('click',submitVault);
vaultForm.addEventListener('submit',e=>{e.preventDefault();submitVault()});
vaultForm.addEventListener('keydown',e=>{if(e.key==='Enter' && e.target.tagName==='INPUT'){e.preventDefault();submitVault()}});
$('#deleteConfirmBtn').addEventListener('click',()=>finishDelete(true));
$$('[data-cancel-delete]').forEach(button=>button.addEventListener('click',()=>finishDelete(false)));
$('#deleteModal').addEventListener('cancel',e=>{e.preventDefault();finishDelete(false)});
$('#vaultGoogleBtn').addEventListener('click',async()=>{
  if(!state.firebase){toast('Firebase sozlanmagan','firebase-config.js ichida Firebase config kiriting.',true);return}
  try{
    if(!state.firebase.user) await state.firebase.signInWithPopup(state.firebase.auth,state.firebase.provider);
    await hydrateCloudVault();
  }catch(err){toast('Google login xatosi',humanError(err),true)}
});
$('#demoModeBtn').addEventListener('click',enterDemo);
$('#closeRevealBtn').addEventListener('click',closeReveal);
revealModal.addEventListener('close',()=>{clearInterval(revealInterval);$('#revealNumber').textContent='•••• •••• •••• ••••';$('#revealExpiry').textContent='--/--';$('#revealCopyBtn').onclick=null;});

loadUi();
await initFirebase();
updateProfile();
if(!getLocalVault() || new URLSearchParams(location.search).get('demo')==='1') enterDemo(); else openVaultModal();
