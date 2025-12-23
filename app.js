/*
  🏰 星妍秘密小屋 v6 (click-open)
  - 默认离线可用：同一台电脑不同标签页实时同步（BroadcastChannel）
  - 可选联机：配置 Supabase 后，两台电脑输入同一邀请码实时同步
  - 两种聊天：① 独立聊天室 ② 每条记录的评论（支持回复）
  - 导出：按“日历/日期”为单位导出全量数据
  - v6：仅做 UI/交互微细化（子工具条/心流模式/魔法沙漏），不改你们既有数据结构
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Utils ----------
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const nowISO = () => new Date().toISOString();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Math.random().toString(16).slice(2) + Date.now());

  const normalizeDigits = (s) => (s || '').replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48));
  const only6 = (s) => normalizeDigits(String(s || '')).replace(/\D/g,'').slice(0,6);

  const toast = (msg, ms=1600) => {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.remove('show'), ms);
  };

  const escapeHtml = (s) => String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  // ---------- Local persistence ----------
  const LS = {
    get(k, def=null){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch{ return def; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} },
    str(k, def=''){ try{ const v = localStorage.getItem(k); return v ?? def; }catch{ return def; } },
    setStr(k,v){ try{ localStorage.setItem(k, v); }catch{} },
    del(k){ try{ localStorage.removeItem(k);}catch{} },
  };

  // 继续沿用 v4 的 key，避免你们之前的离线数据丢失
  const KEY = {
    ROOM: 'dc_v4_room',
    ME: 'dc_v4_me',
    THEME: 'dc_v4_theme',
    SB_URL: 'dc_v4_sb_url',
    SB_KEY: 'dc_v4_sb_key',
    BG: 'dc_v4_bg',
    SITE_URL: 'dc_v7_site_url',
  };
  const getLocalRoomKey = (room) => `dc_v4_data_${room}`;

  function basePet(owner){
    const isStar = owner === 'star';
    return {
      owner,
      name: isStar ? '棉花糖' : '月桂',
      lv: 1,
      xp: 0,
      hunger: 85,
      mood: 82,
      clean: 78,
      energy: 86,
      updated_at: nowISO(),
    };
  }

  function baseData(){
    return {
      entries: [],
      comments: [],
      reactions: [],
      chat: [],
      media: {},
      pets: { star: basePet('star'), yan: basePet('yan') },
      bgCustom: {
        star: { has:false, url:null, path:null, updated_at:null },
        yan:  { has:false, url:null, path:null, updated_at:null },
      },
    };
  }

  function normalizeLocalData(d){
    if (!d || typeof d !== 'object') d = baseData();
    d.entries = Array.isArray(d.entries) ? d.entries : [];
    d.comments = Array.isArray(d.comments) ? d.comments : [];
    d.reactions = Array.isArray(d.reactions) ? d.reactions : [];
    d.chat = Array.isArray(d.chat) ? d.chat : [];
    d.media = d.media && typeof d.media === 'object' ? d.media : {};

    // v8: pets / custom background metadata
    d.pets = d.pets && typeof d.pets === 'object' ? d.pets : { star: basePet('star'), yan: basePet('yan') };
    d.pets.star = d.pets.star && typeof d.pets.star === 'object' ? { ...basePet('star'), ...d.pets.star } : basePet('star');
    d.pets.yan  = d.pets.yan  && typeof d.pets.yan  === 'object' ? { ...basePet('yan'),  ...d.pets.yan  } : basePet('yan');

    d.bgCustom = d.bgCustom && typeof d.bgCustom === 'object' ? d.bgCustom : { star:{}, yan:{} };
    d.bgCustom.star = { has:false, url:null, path:null, updated_at:null, ...(d.bgCustom.star||{}) };
    d.bgCustom.yan  = { has:false, url:null, path:null, updated_at:null, ...(d.bgCustom.yan||{}) };

    // 兼容 v4：user/payload/sticker -> author/content/emoji
    d.entries = d.entries.map((e) => {
      if (!e) return e;
      if (e.author == null && e.user != null) e.author = e.user;
      if (e.content == null && e.payload != null) e.content = e.payload;
      if (!e.created_at && e.createdAt) e.created_at = e.createdAt;
      return e;
    }).filter(Boolean);

    d.comments = d.comments.map((c) => {
      if (!c) return c;
      if (c.author == null && c.user != null) c.author = c.user;
      if (!c.created_at && c.createdAt) c.created_at = c.createdAt;
      return c;
    }).filter(Boolean);

    d.reactions = d.reactions.map((r) => {
      if (!r) return r;
      if (r.author == null && r.user != null) r.author = r.user;
      if (r.emoji == null && r.sticker != null) r.emoji = r.sticker;
      if (!r.created_at && r.createdAt) r.created_at = r.createdAt;
      return r;
    }).filter(Boolean);

    d.chat = d.chat.map((m) => {
      if (!m) return m;
      if (m.author == null && m.user != null) m.author = m.user;
      if (!m.created_at && m.createdAt) m.created_at = m.createdAt;
      return m;
    }).filter(Boolean);

    return d;
  }

  function loadLocalData(room){
    const d = LS.get(getLocalRoomKey(room), baseData()) || baseData();
    const nd = normalizeLocalData(d);
    // 轻量迁移：如果有变化就写回
    LS.set(getLocalRoomKey(room), nd);
    return nd;
  }
  function saveLocalData(room, data){
    LS.set(getLocalRoomKey(room), normalizeLocalData(data));
  }

  // ---------- IndexedDB (audio blobs) ----------
  const idb = (() => {
    const DB = 'dc_v4_media';
    const STORE = 'blobs';
    let dbp = null;

    function open(){
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbp;
    }

    async function put(key, blob){
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    async function get(key){
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async function del(key){
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }

    return { put, get, del };
  })();

  // ---------- Realtime (same device tabs) ----------
  const bc = new BroadcastChannel('dc_v4_channel');

  // ---------- Profile / stickers ----------
  const PROFILE = {
    star: {
      name: '星星✨布灵布灵',
      short: '星星',
      avatar: 'assets/avatar_star.png',
      deco: '⭐',
      deco2: '✨',
      stickers: ['🧸','⭐','✨','🌙','💕','🌸','🐾'],
    },
    yan: {
      name: '小妍听到请回答',
      short: '小妍',
      avatar: 'assets/avatar_yan.png',
      deco: '⚔️',
      deco2: '🌿',
      stickers: ['⚔️','🌿','📜','🕯️','💕','🍃','🪶'],
    }
  };

  const REACTS = [
    { e:'🫶', t:'抱抱' },
    { e:'⭐', t:'夸夸' },
    { e:'🌙', t:'我在' },
    { e:'📜', t:'纸条' },
    { e:'🧸', t:'小熊' },
    { e:'⚔️', t:'剑气' },
    { e:'🌿', t:'叶影' },
    { e:'💕', t:'爱心' },
  ];

  // ---------- State ----------
  const state = {
    room: LS.str(KEY.ROOM, ''),
    me: LS.str(KEY.ME, 'star'),
    view: 'today', // today | records | study | reading | chat
    dateFilter: null, // YYYY-MM-DD
    // v6: 默认锁定「童话 + 古风」统一画布
    theme: 'storybook',
    bg: LS.str(KEY.BG, 'auto') || 'auto',
    sbUrl: LS.str(KEY.SB_URL, ''),
    sbKey: LS.str(KEY.SB_KEY, ''),
    siteUrl: LS.str(KEY.SITE_URL, ''),
    online: { ok:false, mode:'local', msg:'未连接' },
    data: null,
    supabase: null,
    sbChannel: null,
    cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
    recording: { active:false, rec:null, chunks:[], startedAt:0 },
    commentReply: { entryId:null, commentId:null, author:null, preview:'' },
    chatReply: { messageId:null, author:null, preview:'' },

    // v6 UI 微交互
    feedFilter: LS.get('dc_v6_feedFilter', { author:'all', voiceOnly:false }) || { author:'all', voiceOnly:false },
    ui: {
      focus: LS.str('dc_v6_focus', '0') === '1',
      reading: LS.str('dc_v6_reading', '0') === '1',
    },
    hourglass: { running:false, total:1500, left:1500, tm:null, lastTs:0 },
    chatLimit: Number(LS.str('dc_v6_chatLimit', '300')) || 300,

    // v8: runtime caches
    customBgObj: { star:null, yan:null },
  };

  // ---------- DOM refs ----------
  const el = {
    subtitle: $('subtitle'),
    btnStar: $('btnStar'),
    btnYan: $('btnYan'),
    btnExport: $('btnExport'),
    btnSettings: $('btnSettings'),
    btnGoPets: $('btnGoPets'),

    // v6 subbar
    quickDaily: $('quickDaily'),
    quickNote: $('quickNote'),
    toggleFocus: $('toggleFocus'),

    filterAll: $('filterAll'),
    filterStar: $('filterStar'),
    filterYan: $('filterYan'),
    filterVoice: $('filterVoice'),

    openHourglass: $('openHourglass'),
    quickStudy: $('quickStudy'),
    toggleFocus2: $('toggleFocus2'),

    toggleReading: $('toggleReading'),
    quickReading: $('quickReading'),
    toggleFocus3: $('toggleFocus3'),

    chatPing: $('chatPing'),
    chatHug: $('chatHug'),
    chatClear: $('chatClear'),

    // v6 focus modal
    focusModal: $('focusModal'),
    btnCloseFocus: $('btnCloseFocus'),
    hgTime: $('hgTime'),
    hgFill: $('hgFill'),
    hgMin: $('hgMin'),
    hgGoal: $('hgGoal'),
    hgStart: $('hgStart'),
    hgPause: $('hgPause'),
    hgReset: $('hgReset'),
    hgSendNote: $('hgSendNote'),
    hgHint: $('hgHint'),

    panelComposer: $('panelComposer'),
    composerHint: $('composerHint'),
    btnClear: $('btnClear'),
    composerAvatar: $('composerAvatar'),

    typePick: $('typePick'),
    formDaily: $('formDaily'),
    formStudy: $('formStudy'),
    formReading: $('formReading'),
    formNote: $('formNote'),

    wakeTime: $('wakeTime'),
    moodSel: $('moodSel'),
    dailyText: $('dailyText'),

    studySource: $('studySource'),
    studyCount: $('studyCount'),
    studyMin: $('studyMin'),
    studyAcc: $('studyAcc'),
    studyModule: $('studyModule'),
    reviewStatus: $('reviewStatus'),
    reviewText: $('reviewText'),

    bookTitle: $('bookTitle'),
    bookChapter: $('bookChapter'),
    bookQuote: $('bookQuote'),
    bookThought: $('bookThought'),
    bookQ: $('bookQ'),

    noteText: $('noteText'),
    emojiBar: $('emojiBar'),

    btnRec: $('btnRec'),
    recFill: $('recFill'),
    recLabel: $('recLabel'),

    btnPost: $('btnPost'),

    panelFeed: $('panelFeed'),
    feedSub: $('feedSub'),
    btnRefresh: $('btnRefresh'),
    feed: $('feed'),

    panelChat: $('panelChat'),
    chatSub: $('chatSub'),
    chatList: $('chatList'),
    chatInput: $('chatInput'),
    chatSend: $('chatSend'),
    btnChatBottom: $('btnChatBottom'),
    chatReplyBar: $('chatReplyBar'),
    chatReplyText: $('chatReplyText'),
    chatReplyCancel: $('chatReplyCancel'),

    panelCalendar: $('panelCalendar'),
    calMonth: $('calMonth'),
    calPrev: $('calPrev'),
    calNext: $('calNext'),
    calDow: $('calDow'),
    calGrid: $('calGrid'),
    calNote: $('calNote'),

    panelThemes: $('panelThemes'),
    themeGrid: $('themeGrid'),

    panelOnline: $('panelOnline'),
    roomCode: $('roomCode'),
    btnJoin: $('btnJoin'),
    sbUrl: $('sbUrl'),
    sbKey: $('sbKey'),
    siteUrl: $('siteUrl'),
    shareUrl: $('shareUrl'),
    btnCopyLink: $('btnCopyLink'),
    btnOpenLink: $('btnOpenLink'),
    onlineState: $('onlineState'),
    btnTest: $('btnTest'),

    bgGrid: $('bgGrid'),
    bgFileStar: $('bgFileStar'),
    bgClearStar: $('bgClearStar'),
    bgHintStar: $('bgHintStar'),
    bgFileYan: $('bgFileYan'),
    bgClearYan: $('bgClearYan'),
    bgHintYan: $('bgHintYan'),

    petName_star: $('petName_star'),
    petSub_star: $('petSub_star'),
    petLv_star: $('petLv_star'),
    petHunger_star: $('petHunger_star'),
    petMood_star: $('petMood_star'),
    petClean_star: $('petClean_star'),
    petEnergy_star: $('petEnergy_star'),

    petName_yan: $('petName_yan'),
    petSub_yan: $('petSub_yan'),
    petLv_yan: $('petLv_yan'),
    petHunger_yan: $('petHunger_yan'),
    petMood_yan: $('petMood_yan'),
    petClean_yan: $('petClean_yan'),
    petEnergy_yan: $('petEnergy_yan'),

    welcome: $('welcome'),
    btnCloseWelcome: $('btnCloseWelcome'),
    welcomeCode: $('welcomeCode'),
    btnWelcomeJoin: $('btnWelcomeJoin'),
    btnWelcomeGen: $('btnWelcomeGen'),

    pickStar: $('pickStar'),
    pickYan: $('pickYan'),
  };

  // ---------- URL sync (encodeURIComponent) ----------
  function setUrlState(){
    try{
      const qs = [];
      if (state.room) qs.push(`room=${encodeURIComponent(state.room)}`);
      qs.push(`me=${encodeURIComponent(state.me)}`);
      qs.push(`view=${encodeURIComponent(state.view)}`);
      if (state.dateFilter) qs.push(`date=${encodeURIComponent(state.dateFilter)}`);
      const url = `${location.pathname}?${qs.join('&')}`;
      history.replaceState(null, '', url);
    }catch{}
  }

  function applyUrlState(){
    try{
      const sp = new URLSearchParams(location.search || '');
      const room = only6(sp.get('room') || '');
      const me = sp.get('me');
      const view = sp.get('view');
      const date = sp.get('date');

      if (room.length === 6) state.room = room;
      if (me === 'star' || me === 'yan') state.me = me;
      if (['today','records','study','reading','chat'].includes(view)) state.view = view;
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) state.dateFilter = date;
    }catch{}
  }

  // ---------- Share link (for 2 devices) ----------
  function normalizeSiteUrl(u){
    if (!u) return '';
    let s = String(u).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    // keep as full page url
    s = s.replace(/\s/g,'');
    return s.replace(/\/$/, '');
  }

  function currentPageUrl(){
    try{
      if (location.protocol.startsWith('http')) {
        return (location.origin + location.pathname).replace(/\/$/, '');
      }
    }catch{}
    return '';
  }

  function buildShareUrl(){
    if (!state.room) return '';
    const base = normalizeSiteUrl(state.siteUrl) || currentPageUrl();
    if (!base) return '';
    try{
      const u = new URL(base);
      u.searchParams.set('room', state.room);
      // don't force identity; let the other device choose
      u.searchParams.delete('me');
      u.searchParams.set('view', 'today');
      u.searchParams.delete('date');
      return u.toString();
    }catch{ return '';
    }
  }

  function updateShareLink(){
    if (!el.shareUrl) return;
    el.shareUrl.value = buildShareUrl() || '';
  }

  // ---------- Supabase (optional) ----------
  function hasSupabase(){
    return !!(state.sbUrl && state.sbKey && window.supabase);
  }

  function initSupabase(){
    if (!hasSupabase()) return null;
    try{
      return window.supabase.createClient(state.sbUrl, state.sbKey, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 8 } },
      });
    }catch(e){
      console.warn(e);
      return null;
    }
  }

  async function testSupabase(){
    if (!hasSupabase()) {
      state.online = { ok:false, mode:'local', msg:'未填写 Supabase URL / Key' };
      renderOnlineState();
      return;
    }

    state.supabase = initSupabase();
    if (!state.supabase) {
      state.online = { ok:false, mode:'local', msg:'Supabase 初始化失败' };
      renderOnlineState();
      return;
    }

    try{
      // ping
      const { error } = await state.supabase.from('dc_entries').select('id').limit(1);
      if (error) throw error;

      state.online = { ok:true, mode:'supabase', msg:'联机已就绪 ✅（两台电脑可同步）' };
      renderOnlineState();
      await subscribeSupabase();
      await refreshFromSupabase(true);
      toast('联机已连接 ✨');
    }catch(e){
      console.warn(e);
      state.online = { ok:false, mode:'local', msg:`连接失败：${e.message || e}` };
      renderOnlineState();
    }
  }

  async function subscribeSupabase(){
    if (!state.supabase || !state.room) return;
    try{
      if (state.sbChannel) {
        await state.supabase.removeChannel(state.sbChannel);
        state.sbChannel = null;
      }
      const ch = state.supabase.channel(`dc_room_${state.room}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_entries', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_comments', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_reactions', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_chat', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        // v8: pets + custom bg metadata
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_pets', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_bg', filter: `room_code=eq.${state.room}` }, () => refreshFromSupabase(true))
        .subscribe();
      state.sbChannel = ch;
    }catch(e){
      console.warn(e);
    }
  }

  let _refreshing = false;
  let _refreshQueued = false;

  async function refreshFromSupabase(quiet=false){
    if (!state.supabase || !state.room) return;
    if (_refreshing) { _refreshQueued = true; return; }
    _refreshing = true;
    try{
      const [entries, comments, reactions, chat, pets, bg] = await Promise.all([
        state.supabase.from('dc_entries').select('*').eq('room_code', state.room).order('created_at', { ascending: false }).limit(300),
        state.supabase.from('dc_comments').select('*').eq('room_code', state.room).order('created_at', { ascending: true }).limit(800),
        state.supabase.from('dc_reactions').select('*').eq('room_code', state.room).order('created_at', { ascending: true }).limit(1200),
        state.supabase.from('dc_chat').select('*').eq('room_code', state.room).order('created_at', { ascending: true }).limit(1000),
        // v8: pets + bg metadata
        state.supabase.from('dc_pets').select('*').eq('room_code', state.room).limit(10),
        state.supabase.from('dc_bg').select('*').eq('room_code', state.room).limit(10),
      ]);
      if (entries.error) throw entries.error;
      if (comments.error) throw comments.error;
      if (reactions.error) throw reactions.error;
      if (chat.error) throw chat.error;
      // pets/bg tables are optional (for people who haven't run the v8 sql). Don't hard fail.
      if (pets?.error) console.warn('dc_pets fetch error:', pets.error);
      if (bg?.error) console.warn('dc_bg fetch error:', bg.error);

      const d = loadLocalData(state.room);
      d.entries = entries.data || [];
      d.comments = comments.data || [];
      d.reactions = reactions.data || [];
      d.chat = chat.data || [];

      // merge pets
      if (pets?.data && Array.isArray(pets.data)) {
        d.pets = d.pets || { star: basePet('star'), yan: basePet('yan') };
        for (const row of pets.data) {
          if (!row || (row.owner !== 'star' && row.owner !== 'yan')) continue;
          const pdata = row.data && typeof row.data === 'object' ? row.data : null;
          if (!pdata) continue;
          d.pets[row.owner] = { ...basePet(row.owner), ...pdata };
        }
      }

      // merge custom bg metadata (url/path so other device can load)
      if (bg?.data && Array.isArray(bg.data)) {
        d.bgCustom = d.bgCustom || { star:{}, yan:{} };
        for (const row of bg.data) {
          if (!row || (row.owner !== 'star' && row.owner !== 'yan')) continue;
          d.bgCustom[row.owner] = {
            ...(d.bgCustom[row.owner] || {}),
            has: !!row.url,
            url: row.url || null,
            path: row.path || null,
            updated_at: row.updated_at || nowISO(),
          };
        }
      }
      saveLocalData(state.room, d);
      state.data = d;

      // refresh custom bg object URLs from metadata
      try{ await prepareCustomBg('star'); }catch{}
      try{ await prepareCustomBg('yan'); }catch{}

      renderAll();
      if (!quiet) toast('已同步 ✨');
    }catch(e){
      console.warn(e);
      if (!quiet) toast('同步失败：请检查表/权限');
    }finally{
      _refreshing = false;
      if (_refreshQueued) { _refreshQueued = false; refreshFromSupabase(true); }
    }
  }

  // ---------- Data ops (local + optional supabase) ----------
  async function addEntry(entry){
    if (!state.room) return;
    const d = state.data || loadLocalData(state.room);

    d.entries.unshift(entry);
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderAll();

    if (state.online.ok && state.supabase) {
      try{
        const { error } = await state.supabase.from('dc_entries').insert(entry);
        if (error) throw error;
      }catch(e){
        console.warn(e);
        toast('联机写入失败（已离线保存）');
      }
    }
  }

  async function addComment(c){
    if (!state.room) return;
    const d = state.data || loadLocalData(state.room);

    d.comments.push(c);
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderFeed();

    if (state.online.ok && state.supabase) {
      try{
        const { error } = await state.supabase.from('dc_comments').insert(c);
        if (error) throw error;
      }catch(e){
        console.warn(e);
        toast('评论联机失败（已离线保存）');
      }
    }
  }

  async function toggleReaction(entryId, emoji){
    if (!state.room) return;
    const d = state.data || loadLocalData(state.room);
    const existing = d.reactions.find(r => r.entry_id === entryId && r.author === state.me && r.emoji === emoji);
    if (existing) {
      d.reactions = d.reactions.filter(r => !(r.entry_id === entryId && r.author === state.me && r.emoji === emoji));
    } else {
      d.reactions.push({ id: uid(), room_code: state.room, entry_id: entryId, author: state.me, emoji, created_at: nowISO() });
    }
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderFeed();
    renderCalendar();

    if (state.online.ok && state.supabase) {
      try{
        if (existing) {
          const { error } = await state.supabase.from('dc_reactions').delete()
            .eq('room_code', state.room)
            .eq('entry_id', entryId)
            .eq('author', state.me)
            .eq('emoji', emoji);
          if (error) throw error;
        } else {
          const { error } = await state.supabase.from('dc_reactions').insert({ id: uid(), room_code: state.room, entry_id: entryId, author: state.me, emoji, created_at: nowISO() });
          if (error) throw error;
        }
      }catch(e){
        console.warn(e);
      }
    }
  }

  async function addChatMessage(m){
    if (!state.room) return;
    const d = state.data || loadLocalData(state.room);
    d.chat.push(m);
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderChat();

    if (state.online.ok && state.supabase) {
      try{
        const { error } = await state.supabase.from('dc_chat').insert(m);
        if (error) throw error;
      }catch(e){
        console.warn(e);
        toast('聊天联机失败（已离线保存）');
      }
    }
  }

  // ---------- Voice recording ----------
  async function startRecording(){
    if (state.recording.active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('这个浏览器不支持录音');
      return;
    }
    // 录音需要安全上下文（https 或 localhost）；file:// 会导致“录不到/发不出去”
    if (!window.isSecureContext) {
      toast('录音需要 https 或 localhost：建议部署到 Vercel/Netlify 后再用语音');
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // pick a mime that this browser supports
      let mime = '';
      const cand = ['audio/webm;codecs=opus','audio/webm','audio/mp4'];
      for (const c of cand) { if (window.MediaRecorder?.isTypeSupported?.(c)) { mime = c; break; } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      state.recording = { active:true, rec, chunks:[], startedAt: Date.now(), mime: mime || 'audio/webm' };

      rec.ondataavailable = (e) => { if (e.data && e.data.size) state.recording.chunks.push(e.data); };
      rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); };

      rec.start(200);
      el.btnRec?.classList.add('active');
      if (el.recLabel) el.recLabel.textContent = '录音中…再点一下停止';
      if (el.recFill) el.recFill.style.width = '8%';

      const tick = () => {
        if (!state.recording.active) return;
        const ms = Date.now() - state.recording.startedAt;
        const p = Math.min(100, (ms / 20000) * 100); // 20s full bar
        if (el.recFill) el.recFill.style.width = `${Math.max(8, p)}%`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

    }catch(e){
      console.warn(e);
      toast('没有拿到麦克风权限');
    }
  }

  async function stopRecording(){
    if (!state.recording.active) return null;
    try{
      state.recording.active = false;
      const rec = state.recording.rec;
      rec.stop();
      el.btnRec?.classList.remove('active');
      if (el.recLabel) el.recLabel.textContent = '录音已准备好：发布时会附上语音';
      if (el.recFill) el.recFill.style.width = '100%';

      const mime = state.recording.mime || 'audio/webm';
      const blob = new Blob(state.recording.chunks, { type: mime });
      const mediaId = 'voice_' + uid();
      await idb.put(mediaId, blob);

      if (el.noteText) el.noteText.dataset.voice = mediaId;
      return mediaId;
    }catch(e){
      console.warn(e);
      toast('录音失败');
      return null;
    }
  }

  async function uploadVoiceIfOnline(mediaId){
    if (!mediaId) return null;
    if (!(state.online.ok && state.supabase)) return { localId: mediaId };
    try{
      const blob = await idb.get(mediaId);
      if (!blob) return { localId: mediaId };

      const mime = blob.type || 'audio/webm';
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('webm') ? 'webm' : 'bin';
      const path = `${state.room}/voice/${mediaId}.${ext}`;
      const up = await state.supabase.storage.from('dc_media').upload(path, blob, {
        contentType: mime,
        upsert: true,
      });
      if (up.error) throw up.error;
      const pub = state.supabase.storage.from('dc_media').getPublicUrl(path);
      const url = pub?.data?.publicUrl || null;
      return { url, path };
    }catch(e){
      console.warn(e);
      const msg = (e && (e.message || e.error_description || e.toString())) ? String(e.message || e.error_description || e.toString()) : '';
      if (/bucket/i.test(msg) || /not found/i.test(msg) || /storage/i.test(msg)) {
        toast('语音上传失败：请在 Supabase 创建 storage bucket「dc_media」并放开权限（看 README / supabase.sql）');
      } else if (/row-level security|rls|policy/i.test(msg) || /permission/i.test(msg)) {
        toast('语音上传失败：storage 权限不足（请按 supabase.sql 添加 policy）');
      } else {
        toast('语音上传失败（仍可离线播放）');
      }
      return { localId: mediaId };
    }
  }

  // ---------- Rendering ----------
  function setBodyTheme(){
    document.body.dataset.theme = state.theme;
    document.body.dataset.bg = state.bg;
    document.body.dataset.view = state.view;
    document.body.dataset.me = state.me;
    if (state.ui.focus) document.body.dataset.focus = '1';
    else delete document.body.dataset.focus;
    if (state.ui.reading) document.body.dataset.reading = '1';
    else delete document.body.dataset.reading;

    // v8: allow "custom" background to override the CSS variable
    applyBgOverride();
  }

  function renderHeader(){
    const me = PROFILE[state.me] || PROFILE.star;
    if (el.subtitle) {
      const base = '宇宙生生不息，祝你做个好梦。';
      const vtxt = state.view === 'chat' ? '在聊天室实时说话吧。' : state.view === 'study' ? '备考记录：只看🧠。' : state.view === 'reading' ? '阅读记录：只看📖。' : state.view === 'today' ? '今天：只看今天的记录。' : '全部记录都在这里。';
      el.subtitle.textContent = `${base} · 当前：${me.short} · ${vtxt}`;
    }
    el.btnStar?.classList.toggle('active', state.me === 'star');
    el.btnYan?.classList.toggle('active', state.me === 'yan');
  }

  function renderOnlineState(){
    const { ok, msg } = state.online;
    if (!el.onlineState) return;
    el.onlineState.textContent = ok ? `🟢 ${msg}` : `⚪ ${msg}`;
  }

  function renderComposer(){
    const me = PROFILE[state.me] || PROFILE.star;
    if (el.composerAvatar) el.composerAvatar.src = me.avatar;

    if (el.composerHint) {
      el.composerHint.innerHTML = state.online.ok
        ? `🟢 联机中：两台电脑会同步（邀请码房间 <b>${state.room||'——'}</b>）`
        : `⚪ 离线模式：同一台电脑不同标签页可同步（邀请码 <b>${state.room||'——'}</b>）`;
    }

    // emoji bar: tailored + common
    const picks = [...new Set([...me.stickers, ...['🫶','🌙','⭐','📜','💕','🌸']])].slice(0, 10);
    if (el.emojiBar) {
      el.emojiBar.innerHTML = picks.map(e => `<button class="em" type="button" title="${e}">${e}</button>`).join('');
      el.emojiBar.querySelectorAll('button.em').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = getActiveComposerTextarea();
          if (!t) return;
          insertAtCursor(t, btn.textContent);
          t.focus();
        });
      });
    }

    if (el.recLabel && !el.noteText?.dataset.voice) {
      el.recLabel.textContent = '点一下开始录音';
      if (el.recFill) el.recFill.style.width = '0%';
      el.btnRec?.classList.remove('active');
    }
  }

  function setActiveType(type){
    [...(el.typePick?.querySelectorAll('button') || [])].forEach(b => b.classList.toggle('active', b.dataset.type === type));
    el.formDaily?.classList.toggle('hidden', type !== 'daily');
    el.formStudy?.classList.toggle('hidden', type !== 'study');
    el.formReading?.classList.toggle('hidden', type !== 'reading');
    el.formNote?.classList.toggle('hidden', type !== 'note');
    if (el.noteText) el.noteText.dataset.type = type;
  }

  function getActiveComposerTextarea(){
    const t = el.noteText?.dataset.type || 'daily';
    if (t === 'daily') return el.dailyText;
    if (t === 'study') return el.reviewText;
    if (t === 'reading') return el.bookThought;
    return el.noteText;
  }

  function insertAtCursor(input, text){
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + text + after;
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
  }

  function viewFilterEntry(e){
    const created = new Date(e.created_at || e.createdAt || Date.now());
    const day = fmtDate(created);

    // v6: records 子工具条筛选
    if (state.feedFilter?.voiceOnly && e.type !== 'voice') return false;
    if (state.feedFilter?.author && state.feedFilter.author !== 'all' && e.author !== state.feedFilter.author) return false;

    if (state.dateFilter && day !== state.dateFilter) return false;
    if (state.view === 'today') {
      return day === fmtDate(new Date());
    }
    if (state.view === 'study') return e.type === 'study';
    if (state.view === 'reading') return e.type === 'reading';
    // records: all
    return true;
  }

  function renderFeed(){
    const d = state.data || (state.room ? loadLocalData(state.room) : baseData());
    state.data = d;

    if (!state.room) {
      if (el.feed) {
        el.feed.innerHTML = `<div class="empty"><div class="big">🔐</div><div class="t">先在右侧「联机/邀请码」里加入一个 6 位邀请码</div><div class="s">离线可用；填 Supabase 后可跨设备同步。</div></div>`;
      }
      return;
    }

    const entries = (d.entries || []).filter(viewFilterEntry);

    // header hint + clear filter
    if (el.feedSub) {
      const base = `邀请码：${state.room} · ${state.online.ok ? '联机同步' : '离线(同机多标签同步)'}`;
      const vf = state.view === 'today' ? '视图：今天' : state.view === 'study' ? '视图：备考' : state.view === 'reading' ? '视图：阅读' : '视图：全部';
      const ffA = state.feedFilter?.author && state.feedFilter.author !== 'all' ? ` · 作者筛选：${PROFILE[state.feedFilter.author]?.short || state.feedFilter.author}` : '';
      const ffV = state.feedFilter?.voiceOnly ? ' · 仅语音' : '';
      const df = state.dateFilter ? ` · 日期筛选：${state.dateFilter}（点这里清除）` : '';
      el.feedSub.innerHTML = `${base} · ${vf}${ffA}${ffV}${df}`;
      el.feedSub.style.cursor = state.dateFilter ? 'pointer' : 'default';
    }

    // maps
    const commentsByEntry = new Map();
    for (const c of d.comments || []) {
      if (!commentsByEntry.has(c.entry_id)) commentsByEntry.set(c.entry_id, []);
      commentsByEntry.get(c.entry_id).push(c);
    }

    const reactionsByEntry = new Map();
    for (const r of d.reactions || []) {
      if (!reactionsByEntry.has(r.entry_id)) reactionsByEntry.set(r.entry_id, []);
      reactionsByEntry.get(r.entry_id).push(r);
    }

    const renderReacts = (entryId) => {
      const rs = reactionsByEntry.get(entryId) || [];
      const count = rs.reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
      }, {});
      return REACTS.slice(0, 6).map(r => {
        const mine = rs.some(x => x.author === state.me && x.emoji === r.e);
        const n = count[r.e] || 0;
        return `<button type="button" class="rx ${mine?'on':''}" data-eid="${entryId}" data-emoji="${escapeHtml(r.e)}" title="${escapeHtml(r.t)}">${escapeHtml(r.e)} ${n?`<b>${n}</b>`:''}</button>`;
      }).join('');
    };

    const html = entries.map((e) => {
      const who = PROFILE[e.author] || PROFILE.star;
      const dt = new Date(e.created_at);
      const tag = e.type === 'daily' ? '🍵 日常' : e.type === 'study' ? '🧠 备考' : e.type === 'reading' ? '📖 阅读' : e.type === 'voice' ? '🎙️ 语音' : '💌 留言';

      const body = renderEntryBody(e);

      const cs = commentsByEntry.get(e.id) || [];
      const cHtml = renderComments(e.id, cs, d.comments || []);

      return `<article class="entry ${e.author}" data-id="${e.id}">
        <div class="entry-head">
          <div class="entry-who">
            <div class="tiny"><img src="${who.avatar}" alt="${escapeHtml(who.short)}"></div>
            <div>
              <div class="name">${escapeHtml(who.short)} · ${escapeHtml(tag)}</div>
              <div class="time">${fmtDate(dt)} ${fmtTime(dt)}</div>
            </div>
          </div>
          <div class="tag">${escapeHtml(tag)}</div>
        </div>
        <div class="entry-body">${body}</div>
        <div class="entry-foot">
          <div class="miniReacts">
            ${renderReacts(e.id)}
            <button type="button" class="rx commentToggle" data-eid="${e.id}">💬 评论 ${cs.length?`<b>${cs.length}</b>`:''}</button>
          </div>
          <div style="font-size:12px;color:var(--muted)">${who.deco} ${who.deco2}</div>
        </div>

        <div class="commentBox ${cs.length?'show':''}" data-eid="${e.id}">
          ${cHtml}
          <div class="replyBar hidden" data-eid="${e.id}">
            <div class="rt" data-role="txt">回复：</div>
            <button class="rc commentReplyCancel" data-eid="${e.id}" type="button">取消</button>
          </div>
          <div class="commentComposer">
            <textarea class="cinput" data-eid="${e.id}" placeholder="给TA留一句…（支持表情）" rows="2" style="flex:1;"></textarea>
            <button class="smallbtn csend" data-eid="${e.id}" type="button">发送</button>
          </div>
        </div>
      </article>`;
    }).join('');

    if (el.feed) {
      el.feed.innerHTML = html || `<div class="empty"><div class="big">🌙</div><div class="t">这里还空空的～</div><div class="s">写第一条记录，让小屋亮起来。</div></div>`;
    }

    // Bind: reactions
    el.feed?.querySelectorAll('button.rx[data-emoji]').forEach(btn => {
      btn.addEventListener('click', () => toggleReaction(btn.dataset.eid, btn.dataset.emoji));
    });

    // Bind: comment toggle
    el.feed?.querySelectorAll('button.commentToggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const eid = btn.dataset.eid;
        const box = el.feed.querySelector(`.commentBox[data-eid="${eid}"]`);
        if (!box) return;
        box.classList.toggle('show');
        // 展开后要同步 reply 状态
        updateCommentReplyUI(eid);
        box.querySelector('textarea.cinput')?.focus();
      });
    });

    // Bind: reply click (comments)
    bindCommentReplyEvents();

    // Bind: send comment
    el.feed?.querySelectorAll('button.csend').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eid = btn.dataset.eid;
        const input = el.feed.querySelector(`textarea.cinput[data-eid="${eid}"]`);
        if (!input) return;
        const v = (input.value || '').trim();
        if (!v) return;

        // 发送前：同步 state.commentReply.entryId
        let reply_to = null;
        let reply_to_author = null;
        let reply_preview = null;
        if (state.commentReply.entryId === eid && state.commentReply.commentId) {
          reply_to = state.commentReply.commentId;
          reply_to_author = state.commentReply.author || null;
          reply_preview = state.commentReply.preview || null;
        } else {
          // 防止跨 entry 错回复
          clearCommentReply();
        }

        input.value = '';
        await addComment({
          id: uid(),
          entry_id: eid,
          room_code: state.room,
          author: state.me,
          content: v,
          reply_to,
          reply_to_author,
          reply_preview,
          created_at: nowISO(),
        });

        clearCommentReply();
      });
    });

    // Bind: Enter to send
    el.feed?.querySelectorAll('textarea.cinput').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const eid = inp.dataset.eid;
          el.feed.querySelector(`button.csend[data-eid="${eid}"]`)?.click();
        }
      });
    });
  }

  function renderComments(entryId, cs, allComments){
    const byId = new Map();
    for (const c of (allComments || [])) byId.set(c.id, c);

    return (cs || []).slice(-10).map((c) => {
      const who = PROFILE[c.author] || PROFILE.star;
      const t = new Date(c.created_at);

      let quote = '';
      if (c.reply_to) {
        const ref = byId.get(c.reply_to);
        const refAuthor = PROFILE[(c.reply_to_author || ref?.author)]?.short || (ref?.author ? (PROFILE[ref.author]?.short || ref.author) : 'TA');
        const prev = (c.reply_preview || ref?.content || '').toString().slice(0, 44);
        quote = `<div style="font-size:11px;color:var(--muted); margin-bottom:6px; position:relative; z-index:1;">↪ 回复 ${escapeHtml(refAuthor)}：${escapeHtml(prev)}${prev.length>=44?'…':''}</div>`;
      }

      return `<div class="commentRow ${c.author}" data-eid="${entryId}" data-cid="${c.id}">
        <div class="stamp"><img src="${who.avatar}" alt="${escapeHtml(who.short)}"></div>
        <div class="bubble">
          ${quote}
          <div class="t">${escapeHtml(c.content).replace(/\n/g,'<br>')}</div>
          <div style="font-size:11px;color:var(--muted); margin-top:6px; position:relative; z-index:1; display:flex; gap:10px; align-items:center;">
            <span>${fmtTime(t)}</span>
            <button type="button" class="cReply" data-eid="${entryId}" data-cid="${c.id}" data-author="${escapeHtml(c.author)}" data-preview="${escapeHtml(c.content.slice(0,80))}">↩ 回复</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function bindCommentReplyEvents(){
    // reply buttons
    el.feed?.querySelectorAll('button.cReply').forEach(btn => {
      btn.addEventListener('click', () => {
        const eid = btn.dataset.eid;
        const cid = btn.dataset.cid;
        const author = btn.dataset.author;
        const preview = (btn.dataset.preview || '').slice(0, 80);
        state.commentReply = { entryId: eid, commentId: cid, author, preview };
        updateCommentReplyUI(eid);
        el.feed.querySelector(`textarea.cinput[data-eid="${eid}"]`)?.focus();
      });
    });

    // cancel
    el.feed?.querySelectorAll('button.commentReplyCancel').forEach(btn => {
      btn.addEventListener('click', () => {
        const eid = btn.dataset.eid;
        clearCommentReply();
        updateCommentReplyUI(eid);
      });
    });
  }

  function clearCommentReply(){
    state.commentReply = { entryId:null, commentId:null, author:null, preview:'' };
  }

  function updateCommentReplyUI(entryId){
    const box = el.feed?.querySelector(`.commentBox[data-eid="${entryId}"]`);
    if (!box) return;
    const bar = box.querySelector(`.replyBar[data-eid="${entryId}"]`);
    if (!bar) return;

    if (state.commentReply.entryId === entryId && state.commentReply.commentId) {
      const who = PROFILE[state.commentReply.author]?.short || (state.commentReply.author === 'star' ? '星星' : state.commentReply.author === 'yan' ? '小妍' : 'TA');
      const prev = (state.commentReply.preview || '').slice(0, 60);
      bar.querySelector('[data-role="txt"]').textContent = `回复 ${who}：${prev}${prev.length>=60?'…':''}`;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  function renderEntryBody(e){
    const p = e.content || {};
    try{
      if (e.type === 'daily') {
        const mood = p.mood || '😊';
        const wake = p.wake || '';
        const text = escapeHtml(p.text || '');
        return `<div class="txt">${wake ? `☀️ 起床：${escapeHtml(wake)}\n` : ''}${mood} 心情\n\n${text}</div>`;
      }
      if (e.type === 'study') {
        const lines = [];
        if (p.source) lines.push(`题源：${p.source}`);
        const meta = [];
        if (p.module) meta.push(p.module);
        if (p.count != null) meta.push(`${p.count}题`);
        if (p.mins != null) meta.push(`${p.mins}分钟`);
        if (p.acc != null) meta.push(`${p.acc}%`);
        if (meta.length) lines.push(meta.join(' · '));
        const rs = p.review || 'none';
        const rlabel = rs === 'done' ? '✅ 已复盘' : rs === 'partial' ? '🌓 部分复盘' : '🌫️ 未复盘';
        lines.push(rlabel);
        if (p.reviewText) lines.push(`\n${p.reviewText}`);
        return `<div class="txt">${escapeHtml(lines.join('\n')).replace(/\n/g,'<br>')}</div>`;
      }
      if (e.type === 'reading') {
        const title = p.book || '一本书';
        const chap = p.chapter ? ` · ${p.chapter}` : '';
        const quote = p.quote ? `\n“${p.quote}”\n` : '';
        const thought = p.thought || '';
        const q = p.question ? `\n❓ 想问TA：${p.question}` : '';
        const txt = `📖 ${title}${chap}${quote}\n${thought}${q}`;
        return `<div class="txt">${escapeHtml(txt).replace(/\n/g,'<br>')}</div>`;
      }
      if (e.type === 'voice') {
        const label = p.label || '语音小纸条';
        const url = p.voiceUrl || '';
        const localId = p.voiceLocalId || '';
        const hint = (!url && localId)
          ? `\n<span style="display:inline-block;margin-top:8px;font-size:12px;color:var(--muted);">（仅本机可播：联机需配置 Supabase storage 才能两台设备同步）</span>`
          : '';
        return `<div class="txt">🎙️ ${escapeHtml(label)}\n<button class="play" data-url="${escapeHtml(url)}" data-local="${escapeHtml(localId)}" type="button">▶ 播放</button>${hint}</div>`;
      }
      // note
      return `<div class="txt">${escapeHtml(p.text || '').replace(/\n/g,'<br>')}</div>`;
    }catch{
      return `<div class="txt">（内容加载失败）</div>`;
    }
  }

  function renderChat(){
    const d = state.data || (state.room ? loadLocalData(state.room) : baseData());
    state.data = d;

    if (!el.panelChat) return;
    if (!state.room) {
      if (el.chatList) el.chatList.innerHTML = `<div class="empty"><div class="big">🔐</div><div class="t">先加入邀请码才能聊天</div></div>`;
      return;
    }

    if (el.chatSub) {
      el.chatSub.textContent = state.online.ok ? '联机实时同步（两台电脑）' : '离线同机多标签实时同步';
    }

    const all = (d.chat || []).slice(-(state.chatLimit || 300));
    const byId = new Map();
    for (const m of all) byId.set(m.id, m);

    const html = all.map(m => {
      const who = PROFILE[m.author] || PROFILE.star;
      const dt = new Date(m.created_at);
      let quote = '';
      if (m.reply_to) {
        const ref = byId.get(m.reply_to);
        const refAuthor = PROFILE[m.reply_to_author || ref?.author]?.short || 'TA';
        const prev = (m.reply_preview || ref?.content || '').toString().slice(0, 44);
        quote = `<div style="font-size:11px;color:var(--muted); margin-bottom:6px; position:relative; z-index:1;">↪ 回复 ${escapeHtml(refAuthor)}：${escapeHtml(prev)}${prev.length>=44?'…':''}</div>`;
      }
      return `<div class="chatMsg ${m.author}" data-id="${m.id}">
        <div class="stamp"><img src="${who.avatar}" alt="${escapeHtml(who.short)}"></div>
        <div class="bubble">
          ${quote}
          <div class="t">${escapeHtml(m.content).replace(/\n/g,'<br>')}</div>
          <div class="meta">
            <span>${fmtTime(dt)}</span>
            <button type="button" class="chatReply" data-id="${m.id}" data-author="${escapeHtml(m.author)}" data-preview="${escapeHtml(m.content.slice(0,80))}">↩ 回复</button>
          </div>
        </div>
      </div>`;
    }).join('');

    if (el.chatList) el.chatList.innerHTML = html || `<div class="empty"><div class="big">💬</div><div class="t">聊天室还没有消息</div><div class="s">说一句“我在”也可以。</div></div>`;

    // bind reply
    el.chatList?.querySelectorAll('button.chatReply').forEach(btn => {
      btn.addEventListener('click', () => {
        state.chatReply = {
          messageId: btn.dataset.id,
          author: btn.dataset.author,
          preview: (btn.dataset.preview || '').slice(0, 80),
        };
        updateChatReplyUI();
        el.chatInput?.focus();
      });
    });

    // keep bottom if already near bottom
    // (手动点“最新”也可以)
  }

  function updateChatReplyUI(){
    if (!el.chatReplyBar) return;
    if (state.chatReply.messageId) {
      const who = PROFILE[state.chatReply.author]?.short || 'TA';
      const prev = (state.chatReply.preview || '').slice(0, 60);
      if (el.chatReplyText) el.chatReplyText.textContent = `回复 ${who}：${prev}${prev.length>=60?'…':''}`;
      el.chatReplyBar.classList.remove('hidden');
    } else {
      el.chatReplyBar.classList.add('hidden');
    }
  }

  function clearChatReply(){
    state.chatReply = { messageId:null, author:null, preview:'' };
    updateChatReplyUI();
  }

  function renderCalendar(){
    if (!el.calGrid || !el.calMonth) return;

    if (!state.room) {
      el.calMonth.textContent = '日历';
      el.calGrid.innerHTML = '';
      if (el.calNote) el.calNote.textContent = '加入邀请码后，这里会显示每一天的小标记。';
      return;
    }

    const y = state.cal.y;
    const m = state.cal.m;
    const first = new Date(y, m, 1);
    const last = new Date(y, m+1, 0);
    const startDow = (first.getDay() + 6) % 7; // Monday first
    const days = last.getDate();

    el.calMonth.textContent = `${y} / ${pad2(m+1)}`;

    if (el.calDow && !el.calDow.dataset.done) {
      const dows = ['一','二','三','四','五','六','日'];
      el.calDow.innerHTML = dows.map(x => `<div class="dow">${x}</div>`).join('');
      el.calDow.dataset.done = '1';
    }

    const d = state.data || loadLocalData(state.room);
    const marks = new Map(); // date -> {star:bool, yan:bool, types:Set}

    for (const e of d.entries || []) {
      const dt = new Date(e.created_at);
      if (dt.getFullYear() !== y || dt.getMonth() !== m) continue;
      const k = fmtDate(dt);
      if (!marks.has(k)) marks.set(k, { star:false, yan:false, types: new Set() });
      const mk = marks.get(k);
      if (e.author === 'star') mk.star = true;
      if (e.author === 'yan') mk.yan = true;
      if (e.type === 'daily') mk.types.add('daily');
      if (e.type === 'study') mk.types.add('study');
      if (e.type === 'reading') mk.types.add('read');
    }

    const cells = [];
    for (let i=0;i<startDow;i++) cells.push({ empty:true });
    for (let dday=1; dday<=days; dday++) {
      const date = new Date(y, m, dday);
      const k = fmtDate(date);
      const mk = marks.get(k);
      cells.push({ empty:false, day: dday, key:k, mk, isToday: fmtDate(new Date()) === k });
    }
    while (cells.length % 7 !== 0) cells.push({ empty:true });

    el.calGrid.innerHTML = cells.map(c => {
      if (c.empty) return `<div class="dow"></div>`;
      const has = !!c.mk;
      const cls = `day ${has?'has':''} ${c.isToday?'today':''} ${state.dateFilter===c.key?'sel':''}`;
      const dots = [];
      if (c.mk?.star) dots.push('<i class="m star"></i>');
      if (c.mk?.yan) dots.push('<i class="m yan"></i>');
      // types as subtle extra dots
      if (c.mk?.types?.has('study')) dots.push('<i class="m study"></i>');
      if (c.mk?.types?.has('read')) dots.push('<i class="m read"></i>');
      if (c.mk?.types?.has('daily')) dots.push('<i class="m daily"></i>');

      return `<div class="${cls}" data-date="${c.key}">
        <div class="n">${c.day}</div>
        <div class="mark">${dots.slice(0,4).join('')}</div>
      </div>`;
    }).join('');

    el.calGrid.querySelectorAll('.day[data-date]').forEach(node => {
      node.addEventListener('click', () => {
        const date = node.dataset.date;
        const list = (state.data?.entries || []).filter(e => fmtDate(new Date(e.created_at)) === date);
        if (!list.length) {
          if (el.calNote) el.calNote.textContent = `${date}：这天还没有记录～`;
          state.dateFilter = date;
          setView('records');
          renderFeed();
          renderCalendar();
          setUrlState();
          return;
        }
        const parts = list.slice(0,10).map(e => {
          const who = PROFILE[e.author]?.short || e.author;
          const icon = e.type === 'study' ? '🧠' : e.type === 'reading' ? '📖' : e.type === 'daily' ? '🍵' : e.type === 'voice' ? '🎙️' : '💌';
          return `${who}${icon}`;
        }).join('  ');
        if (el.calNote) el.calNote.textContent = `${date}：${parts}`;

        state.dateFilter = date;
        setView('records');
        renderFeed();
        renderCalendar();
        setUrlState();

        // scroll to top
        document.querySelector('#panelFeed')?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });

    if (el.calNote && !state.dateFilter) {
      el.calNote.textContent = '点任意日期：左侧时间轴会按当天筛选（再次点「时间轴副标题」可清除筛选）。';
    }
  }

  function renderThemes(){
    if (!el.themeGrid) return;
    // 你说“就一个主要背景”：这里把主题锁定为 1 个。
    const themes = [
      { id:'storybook', name:'兔子森林', desc:'童话底色 + 古风细节 · 全站统一画布', bg:'forest', img:'assets/bg_v6_forest.png' },
    ];

    el.themeGrid.innerHTML = themes.map(t => {
      const on = state.bg === t.bg;
      return `<button class="themeCard ${on?'on':''}" data-theme="${t.id}" data-bg="${t.bg}" type="button">
        <img src="${t.img}" alt="${escapeHtml(t.name)}" />
        <div class="cap"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.desc)}</span></div>
      </button>`;
    }).join('');

    el.themeGrid.querySelectorAll('button.themeCard').forEach(btn => {
      btn.addEventListener('click', () => {
        // 主题锁定：保证整体UI统一；背景可以在下方自由切换
        state.theme = 'storybook';
        LS.setStr(KEY.THEME, state.theme);
        setBodyTheme();
        toast('已锁定主题：兔子森林（背景可在下方切换）');
      });
    });
  }

  // ---------- Backgrounds (auto / presets / custom per person) ----------
  const BG_OPTS = [
    { id:'auto', name:'自动', desc:'按身份：星星=甜甜粉，小妍=月光紫', thumb:'assets/bg_star_pastel.png' },
    { id:'forest', name:'兔子森林', desc:'童话母图（默认）', thumb:'assets/bg_v6_forest.png' },
    { id:'star_pastel', name:'甜甜粉', desc:'星星的小甜背景', thumb:'assets/bg_star_pastel.png' },
    { id:'yan_moon', name:'月光紫', desc:'小妍的月色背景', thumb:'assets/bg_yan_moon.png' },
    { id:'paper', name:'宣纸', desc:'更干净的阅读感', thumb:'assets/bg_paper.png' },
    { id:'custom', name:'我的自定义', desc:'用你上传的那张', thumb:null },
  ];

  function bgBlobKey(owner){
    return `bg_${(state.room||'local')}_${owner}`;
  }

  async function prepareCustomBg(owner){
    // prefer local blob; fallback to remote url metadata
    const d = state.data || (state.room ? loadLocalData(state.room) : null);
    const meta = d?.bgCustom?.[owner] || { has:false, url:null };

    // cleanup old object url if any
    const old = state.customBgObj?.[owner];
    if (old && typeof old === 'string' && old.startsWith('blob:')) {
      try{ URL.revokeObjectURL(old); }catch{}
    }
    state.customBgObj[owner] = null;

    try{
      const blob = await idb.get(bgBlobKey(owner));
      if (blob) {
        const obj = URL.createObjectURL(blob);
        state.customBgObj[owner] = obj;
        return obj;
      }
    }catch{}

    if (meta?.url) {
      state.customBgObj[owner] = meta.url;
      return meta.url;
    }
    return null;
  }

  function applyBgOverride(){
    // clear first
    try{ document.body.style.removeProperty('--bgimg'); }catch{}
    if (state.bg !== 'custom') return;
    const u = state.customBgObj?.[state.me];
    if (!u) return;
    // override CSS var used by body:before
    try{ document.body.style.setProperty('--bgimg', `url('${u}')`); }catch{}
  }

  function renderBgGrid(){
    if (!el.bgGrid) return;
    const hasCustom = !!state.customBgObj?.[state.me];
    const cards = BG_OPTS.map(o => {
      const active = state.bg === o.id;
      const disabled = (o.id === 'custom' && !hasCustom);
      const thumb = (o.id === 'custom') ? (state.customBgObj?.[state.me] || 'assets/bg_paper.png') : (o.thumb || 'assets/bg_paper.png');
      return `<button class="bgCard ${active?'active':''}" data-bg="${o.id}" type="button" ${disabled?'disabled':''}>
        <div class="thumb" style="background-image:url('${thumb}')"></div>
        <div class="meta"><div class="t">${escapeHtml(o.name)}</div><div class="s">${escapeHtml(o.desc)}</div></div>
      </button>`;
    }).join('');
    el.bgGrid.innerHTML = cards;

    el.bgGrid.querySelectorAll('button.bgCard').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bg = btn.dataset.bg;
        if (!bg) return;
        if (bg === 'custom' && !state.customBgObj?.[state.me]) return toast('先在下面上传“我的自定义背景”～');
        state.bg = bg;
        LS.setStr(KEY.BG, state.bg);
        setBodyTheme();
        toast(`背景已切换：${BG_OPTS.find(x=>x.id===bg)?.name || bg}`);
      });
    });
  }

  function renderBgHints(){
    const d = state.data || (state.room ? loadLocalData(state.room) : null);
    const ms = d?.bgCustom?.star;
    const my = d?.bgCustom?.yan;
    if (el.bgHintStar) el.bgHintStar.textContent = ms?.has ? `已设置${ms?.updated_at ? ' · ' + new Date(ms.updated_at).toLocaleString() : ''}` : '未设置';
    if (el.bgHintYan) el.bgHintYan.textContent = my?.has ? `已设置${my?.updated_at ? ' · ' + new Date(my.updated_at).toLocaleString() : ''}` : '未设置';
  }

  async function setCustomBg(owner, file){
    if (!file) return;
    if (!state.room) return toast('先加入邀请码，再上传（方便两台设备同步）');
    if (file.size > 8 * 1024 * 1024) return toast('图片太大了（建议 ≤ 8MB）');

    // store locally
    await idb.put(bgBlobKey(owner), file);
    const d = state.data || loadLocalData(state.room);
    d.bgCustom = d.bgCustom || {};
    d.bgCustom[owner] = { ...(d.bgCustom[owner]||{}), has:true, updated_at: nowISO() };

    // try online sync (optional)
    if (state.online.ok && state.supabase) {
      try{
        const ext = (file.type && file.type.includes('png')) ? 'png' : (file.type && file.type.includes('webp')) ? 'webp' : 'jpg';
        const path = `${state.room}/bg/${owner}.${ext}`;
        const up = await state.supabase.storage.from('dc_media').upload(path, file, { contentType: file.type || 'image/*', upsert: true });
        if (up.error) throw up.error;
        const pub = state.supabase.storage.from('dc_media').getPublicUrl(path);
        const url = pub?.data?.publicUrl || null;
        d.bgCustom[owner] = { ...d.bgCustom[owner], url, path };
        // metadata table (so other device can know the latest url)
        await state.supabase.from('dc_bg').upsert({ room_code: state.room, owner, url, path, updated_at: nowISO() }, { onConflict:'room_code,owner' });
      }catch(e){
        console.warn(e);
        toast('背景已保存（但联机同步失败：请检查 storage bucket/权限）');
      }
    }
    saveLocalData(state.room, d);
    state.data = d;
    await prepareCustomBg(owner);
    renderBgHints();
    renderBgGrid();
    if (state.bg === 'custom' && owner === state.me) setBodyTheme();
    toast('已更新自定义背景 ✨');
  }

  async function clearCustomBg(owner){
    if (!state.room) return toast('先加入邀请码');
    try{ await idb.del(bgBlobKey(owner)); }catch{}
    const d = state.data || loadLocalData(state.room);
    d.bgCustom = d.bgCustom || {};
    d.bgCustom[owner] = { has:false, url:null, path:null, updated_at: nowISO() };
    saveLocalData(state.room, d);
    state.data = d;
    await prepareCustomBg(owner);
    renderBgHints();
    renderBgGrid();
    if (state.bg === 'custom' && owner === state.me) { state.bg = 'auto'; LS.setStr(KEY.BG, state.bg); setBodyTheme(); }
    toast('已清除自定义背景');
  }

  // ---------- Pets (per person, synced by room) ----------
  function clamp01(n){ return Math.max(0, Math.min(100, n)); }

  function decayOnePet(p){
    try{
      const last = p.updated_at ? new Date(p.updated_at).getTime() : Date.now();
      const now = Date.now();
      const mins = Math.max(0, (now - last) / 60000);
      if (mins < 1) return p;

      const np = { ...p };
      np.hunger = clamp01(np.hunger - mins * 0.25);
      np.energy = clamp01(np.energy - mins * 0.20);
      np.clean = clamp01(np.clean - mins * 0.10);
      np.mood = clamp01(np.mood - mins * 0.08);

      // hunger/energy too low affects mood a bit more
      if (np.hunger < 25) np.mood = clamp01(np.mood - mins * 0.06);
      if (np.energy < 25) np.mood = clamp01(np.mood - mins * 0.04);
      np.updated_at = nowISO();
      return np;
    }catch{ return p; }
  }

  function ensurePets(){
    if (!state.room) return;
    const d = state.data || loadLocalData(state.room);
    d.pets = d.pets && typeof d.pets === 'object' ? d.pets : { star: basePet('star'), yan: basePet('yan') };
    d.pets.star = decayOnePet({ ...basePet('star'), ...(d.pets.star||{}) });
    d.pets.yan  = decayOnePet({ ...basePet('yan'),  ...(d.pets.yan||{}) });
    saveLocalData(state.room, d);
    state.data = d;
  }

  function petBar(elm, v){
    if (!elm) return;
    elm.style.width = `${Math.max(4, clamp01(v))}%`;
  }

  function renderPets(){
    if (!state.room) return;
    ensurePets();
    const d = state.data || loadLocalData(state.room);
    const ps = d.pets || {};
    const s = ps.star || basePet('star');
    const y = ps.yan  || basePet('yan');

    if (el.petName_star) el.petName_star.textContent = s.name || '棉花糖';
    if (el.petLv_star) el.petLv_star.textContent = String(s.lv || 1);
    if (el.petSub_star) el.petSub_star.textContent = `🧸 星星的小兔 · Lv ${s.lv || 1}`;
    petBar(el.petHunger_star, s.hunger);
    petBar(el.petMood_star, s.mood);
    petBar(el.petClean_star, s.clean);
    petBar(el.petEnergy_star, s.energy);

    if (el.petName_yan) el.petName_yan.textContent = y.name || '月桂';
    if (el.petLv_yan) el.petLv_yan.textContent = String(y.lv || 1);
    if (el.petSub_yan) el.petSub_yan.textContent = `🌿 小妍的小狐 · Lv ${y.lv || 1}`;
    petBar(el.petHunger_yan, y.hunger);
    petBar(el.petMood_yan, y.mood);
    petBar(el.petClean_yan, y.clean);
    petBar(el.petEnergy_yan, y.energy);

    // only owner can click buttons (HTML already hints)
    document.querySelectorAll('.petbtn').forEach(btn => {
      const owner = btn.dataset.owner;
      btn.disabled = !!owner && owner !== state.me;
    });
  }

  async function syncPetToSupabase(owner){
    if (!(state.online.ok && state.supabase && state.room)) return;
    try{
      const d = state.data || loadLocalData(state.room);
      const p = d.pets?.[owner];
      if (!p) return;
      const row = { room_code: state.room, owner, data: p, updated_at: nowISO() };
      const { error } = await state.supabase.from('dc_pets').upsert(row, { onConflict:'room_code,owner' });
      if (error) throw error;
    }catch(e){
      console.warn(e);
      toast('宠物同步失败（已离线保存）');
    }
  }

  async function petAction(owner, action){
    if (!state.room) return toast('先加入邀请码');
    if (owner !== state.me) return toast('只能操作自己的宠物哦～');
    ensurePets();
    const d = state.data || loadLocalData(state.room);
    const p = { ...basePet(owner), ...(d.pets?.[owner]||{}) };

    const gainXp = 10;
    const bump = (k, dv) => { p[k] = clamp01((Number(p[k])||0) + dv); };

    if (action === 'feed') { bump('hunger', 22); bump('mood', 6); bump('energy', 4); bump('clean', -3); }
    if (action === 'play') { bump('mood', 18); bump('energy', -10); bump('hunger', -6); bump('clean', -2); }
    if (action === 'clean') { bump('clean', 24); bump('mood', 6); }
    if (action === 'sleep') { bump('energy', 26); bump('mood', 6); bump('hunger', -4); }

    p.xp = (Number(p.xp)||0) + gainXp;
    const need = 60 + (p.lv||1) * 35;
    if (p.xp >= need) {
      p.lv = (Number(p.lv)||1) + 1;
      p.xp = 0;
      bump('mood', 10);
      toast(`${p.name || '宠物'} 升级啦！Lv ${p.lv} ✨`);
    } else {
      const msg = action === 'feed' ? '喂好啦 🍪' : action === 'play' ? '摸摸摸 🫶' : action === 'clean' ? '干净啦 🛁' : '睡个好觉 🌙';
      toast(msg);
    }

    p.updated_at = nowISO();
    d.pets = d.pets || {};
    d.pets[owner] = p;
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderPets();
    await syncPetToSupabase(owner);
  }

  async function renamePet(owner){
    if (!state.room) return toast('先加入邀请码');
    if (owner !== state.me) return toast('只能改自己宠物的名字');
    ensurePets();
    const d = state.data || loadLocalData(state.room);
    const p = { ...basePet(owner), ...(d.pets?.[owner]||{}) };
    const name = prompt('给你的宠物取个新名字吧：', p.name || '');
    if (name == null) return;
    const nn = String(name).trim().slice(0, 10);
    if (!nn) return toast('名字不能为空');
    p.name = nn;
    p.updated_at = nowISO();
    d.pets[owner] = p;
    saveLocalData(state.room, d);
    state.data = d;
    bc.postMessage({ type:'sync', room: state.room });
    renderPets();
    await syncPetToSupabase(owner);
    toast('已改名 ✨');
  }

  function renderAll(){
    renderHeader();
    renderComposer();
    if (state.view === 'chat') {
      renderChat();
    } else {
      renderFeed();
    }
    renderCalendar();
    updateChatReplyUI();

    // right panel utilities
    renderPets();
    renderBgHints();
    renderBgGrid();
    updateShareLink();
  }

  // ---------- Navigation ----------
  function setView(v){
    if (!['today','records','study','reading','chat'].includes(v)) v = 'today';
    state.view = v;

    // v6: 让子工具条/画布样式跟随 view
    setBodyTheme();

    // filter rules
    if (v === 'today') state.dateFilter = null;

    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === v));

    // panels
    if (el.panelChat) el.panelChat.classList.toggle('hidden', v !== 'chat');
    if (el.panelFeed) el.panelFeed.classList.toggle('hidden', v === 'chat');
    if (el.panelComposer) el.panelComposer.classList.toggle('hidden', v === 'chat');

    // smart defaults
    if (v === 'study') setActiveType('study');
    if (v === 'reading') setActiveType('reading');
    if (v === 'today') setActiveType('daily');

    renderAll();
    setUrlState();
  }

  // ---------- Export ----------
  function buildExport(){
    const d = loadLocalData(state.room);
    const byDate = {};

    const add = (date, key, item) => {
      if (!byDate[date]) byDate[date] = { entries: [], chat: [], comments: [], reactions: [] };
      byDate[date][key].push(item);
    };

    for (const e of d.entries || []) {
      const date = fmtDate(new Date(e.created_at));
      add(date, 'entries', e);
    }

    // comments grouped by the entry's date (fallback: its own created_at)
    const entryDate = new Map((d.entries||[]).map(e => [e.id, fmtDate(new Date(e.created_at))]));
    for (const c of d.comments || []) {
      const date = entryDate.get(c.entry_id) || fmtDate(new Date(c.created_at));
      add(date, 'comments', c);
    }

    for (const r of d.reactions || []) {
      const date = entryDate.get(r.entry_id) || fmtDate(new Date(r.created_at));
      add(date, 'reactions', r);
    }

    for (const m of d.chat || []) {
      const date = fmtDate(new Date(m.created_at));
      add(date, 'chat', m);
    }

    // stable order list
    const dates = Object.keys(byDate).sort();

    return {
      meta: {
        app: '星妍秘密小屋',
        version: 'v5',
        room_code: state.room,
        exported_at: nowISO(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      },
      dates,
      byDate,
      raw: d,
    };
  }

  function exportAll(){
    if (!state.room) return toast('先加入邀请码');
    const obj = buildExport();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    const fn = `星妍小屋_v5_${state.room}_${fmtDate(new Date())}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = fn;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
    toast('已导出 JSON 📤');
  }

  // ---------- Posting ----------
  function numOrNull(v){
    const n = Number(v);
    return Number.isFinite(n) && v !== '' ? n : null;
  }

  async function postFromComposer(){
    if (!state.room) return toast('先加入邀请码');

    const type = el.noteText?.dataset.type || 'daily';
    const created_at = nowISO();
    const author = state.me;

    let content = {};
    if (type === 'daily') {
      content = {
        wake: el.wakeTime?.value || '',
        mood: el.moodSel?.value || '😊',
        text: el.dailyText?.value || '',
      };
      if (!content.text.trim() && !content.wake) {
        toast('写一句或者填个起床时间也行～');
        // still allow? keep soft
      }
    } else if (type === 'study') {
      content = {
        source: el.studySource?.value || '',
        count: numOrNull(el.studyCount?.value || ''),
        mins: numOrNull(el.studyMin?.value || ''),
        acc: numOrNull(el.studyAcc?.value || ''),
        module: el.studyModule?.value || '',
        review: el.reviewStatus?.value || 'none',
        reviewText: el.reviewText?.value || '',
      };
      if (!content.source.trim()) return toast('“做了什么题”要填一下');
    } else if (type === 'reading') {
      content = {
        book: el.bookTitle?.value || '',
        chapter: el.bookChapter?.value || '',
        quote: el.bookQuote?.value || '',
        thought: el.bookThought?.value || '',
        question: el.bookQ?.value || '',
      };
      if (!content.thought.trim()) return toast('“我的感想”要填一下');
    } else {
      content = { text: el.noteText?.value || '' };
      if (!content.text.trim()) return toast('写一句再发～');
    }

    // voice attach: publish as separate voice entry
    const localVoiceId = el.noteText?.dataset.voice || null;
    if (localVoiceId) {
      const up = await uploadVoiceIfOnline(localVoiceId);
      await addEntry({
        id: uid(),
        room_code: state.room,
        author,
        type: 'voice',
        content: {
          label: type === 'note' ? (content.text?.slice(0, 12) || '语音小纸条') : '语音小纸条',
          voiceUrl: up?.url || null,
          voiceLocalId: up?.localId || localVoiceId,
        },
        created_at,
      });

      // clear marker
      delete el.noteText.dataset.voice;
      if (el.recFill) el.recFill.style.width = '0%';
      if (el.recLabel) el.recLabel.textContent = '点一下开始录音';
    }

    await addEntry({
      id: uid(),
      room_code: state.room,
      author,
      type,
      content,
      created_at,
    });

    clearComposer(false);
    toast('已发布 ✨');
  }

  function clearComposer(hard=true){
    if (el.dailyText) el.dailyText.value = '';
    if (el.reviewText) el.reviewText.value = '';
    if (el.bookThought) el.bookThought.value = '';
    if (el.noteText) el.noteText.value = '';

    if (hard) {
      if (el.wakeTime) el.wakeTime.value = '';
      if (el.moodSel) el.moodSel.value = el.moodSel.options?.[0]?.value || '😊';

      if (el.studySource) el.studySource.value = '';
      if (el.studyCount) el.studyCount.value = '';
      if (el.studyMin) el.studyMin.value = '';
      if (el.studyAcc) el.studyAcc.value = '';
      if (el.studyModule) el.studyModule.value = '';
      if (el.reviewStatus) el.reviewStatus.value = 'none';

      if (el.bookTitle) el.bookTitle.value = '';
      if (el.bookChapter) el.bookChapter.value = '';
      if (el.bookQuote) el.bookQuote.value = '';
      if (el.bookQ) el.bookQ.value = '';
    }

    // voice
    if (el.noteText) delete el.noteText.dataset.voice;
    if (el.recFill) el.recFill.style.width = '0%';
    if (el.recLabel) el.recLabel.textContent = '点一下开始录音';
    el.btnRec?.classList.remove('active');
  }

  // ---------- Room ----------
  function joinRoom(code){
    const c = only6(code);
    if (c.length !== 6) return toast('邀请码需要 6 位数字');
    state.room = c;
    LS.setStr(KEY.ROOM, c);
    if (el.roomCode) el.roomCode.value = c;

    state.data = loadLocalData(c);
    // v8: prepare pets + custom bgs
    try{ ensurePets(); }catch{}
    prepareCustomBg('star');
    prepareCustomBg('yan');
    renderBgHints();
    updateShareLink();
    clearCommentReply();
    clearChatReply();

    if (hasSupabase()) {
      testSupabase();
    } else {
      state.online = { ok:false, mode:'local', msg:'离线模式（可选联机）' };
      renderOnlineState();
    }

    renderAll();
    setUrlState();
    toast('进入小屋啦 🏰');

    // hide welcome
    el.welcome?.classList.add('hidden');
  }

  function genInvite(){
    const c = String(Math.floor(100000 + Math.random()*900000));
    if (el.welcomeCode) el.welcomeCode.value = c;
    toast('生成了一个新的邀请码');
  }

  // ---------- Events ----------
  function bindEvents(){
    el.btnStar?.addEventListener('click', () => setMe('star'));
    el.btnYan?.addEventListener('click', () => setMe('yan'));

    el.btnExport?.addEventListener('click', exportAll);

    el.btnSettings?.addEventListener('click', () => {
      // 不改整体结构：滚到右侧“联机/邀请码/导出设置”
      el.panelOnline?.scrollIntoView({ behavior:'smooth', block:'start' });

    el.btnGoPets?.addEventListener('click', () => {
      document.getElementById('panelPets')?.scrollIntoView({ behavior:'smooth', block:'start' });
      toast('🐾 宠物小窝在右侧（手机端在下方），往下滑也能看到～');
    });

      toast('小屋：联机 / 分享链接 / 背景 / 宠物（建议先部署到 https，语音录音更稳）');
    });

    // tabs (data-tab)
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.tab));
    });

    // v6 subbar quick actions
    el.quickDaily?.addEventListener('click', () => {
      setView('today');
      setActiveType('daily');
      el.dailyText?.focus();
      el.panelComposer?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    el.quickNote?.addEventListener('click', () => {
      setView('today');
      setActiveType('note');
      el.noteText?.focus();
      el.panelComposer?.scrollIntoView({ behavior:'smooth', block:'start' });
    });

    const toggleFocusAny = () => setFocusMode(!state.ui.focus);
    el.toggleFocus?.addEventListener('click', toggleFocusAny);
    el.toggleFocus2?.addEventListener('click', toggleFocusAny);
    el.toggleFocus3?.addEventListener('click', toggleFocusAny);

    el.filterAll?.addEventListener('click', () => {
      state.feedFilter = { author:'all', voiceOnly:false };
      persistUi();
      toast('筛选：全部');
      renderFeed();
      renderCalendar();
    });
    el.filterStar?.addEventListener('click', () => {
      state.feedFilter = { ...state.feedFilter, author:'star', voiceOnly:false };
      persistUi();
      toast('筛选：只看星星');
      renderFeed();
      renderCalendar();
    });
    el.filterYan?.addEventListener('click', () => {
      state.feedFilter = { ...state.feedFilter, author:'yan', voiceOnly:false };
      persistUi();
      toast('筛选：只看小妍');
      renderFeed();
      renderCalendar();
    });
    el.filterVoice?.addEventListener('click', () => {
      state.feedFilter = { author:'all', voiceOnly: !state.feedFilter?.voiceOnly };
      persistUi();
      toast(state.feedFilter.voiceOnly ? '筛选：仅语音' : '筛选：取消仅语音');
      renderFeed();
      renderCalendar();
    });

    el.quickStudy?.addEventListener('click', () => {
      setView('study');
      setActiveType('study');
      el.studySource?.focus();
      el.panelComposer?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    el.quickReading?.addEventListener('click', () => {
      setView('reading');
      setActiveType('reading');
      el.bookTitle?.focus();
      el.panelComposer?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    el.toggleReading?.addEventListener('click', () => {
      setReadingMode(!state.ui.reading);
      setView('reading');
    });

    el.openHourglass?.addEventListener('click', () => {
      setView('study');
      setFocusMode(true);
      hourglassReset();
      openFocusModal();
    });

    // focus modal bindings
    el.btnCloseFocus?.addEventListener('click', closeFocusModal);
    el.focusModal?.addEventListener('click', (e) => {
      if (e.target === el.focusModal) closeFocusModal();
    });
    el.hgMin?.addEventListener('change', hourglassReset);
    el.hgReset?.addEventListener('click', hourglassReset);
    el.hgStart?.addEventListener('click', () => {
      setFocusMode(true);
      if (state.hourglass.left <= 0) hourglassReset();
      startHourglassTimer();
      renderHourglass();
    });
    el.hgPause?.addEventListener('click', () => {
      if (state.hourglass.running) {
        stopHourglassTimer();
        toast('已暂停');
      } else {
        startHourglassTimer();
        toast('继续');
      }
      renderHourglass();
    });
    el.hgSendNote?.addEventListener('click', () => {
      const goal = (el.hgGoal?.value || '').trim();
      const mins = Math.round((state.hourglass.total || 1500) / 60);
      setView('today');
      setActiveType('note');
      if (el.noteText) {
        const pre = goal ? `我做到了：${goal}（${mins}分钟心流）` : `我做到了（${mins}分钟心流）`;
        el.noteText.value = (el.noteText.value ? (el.noteText.value + '\n') : '') + pre;
        el.noteText.focus();
      }
      closeFocusModal();
      el.panelComposer?.scrollIntoView({ behavior:'smooth', block:'start' });
    });

    // chat quick
    el.chatPing?.addEventListener('click', () => {
      setView('chat');
      if (el.chatInput) el.chatInput.value = '我在 🌙';
      el.chatInput?.focus();
    });
    el.chatHug?.addEventListener('click', () => {
      setView('chat');
      if (el.chatInput) el.chatInput.value = '抱抱你 🫶';
      el.chatInput?.focus();
    });
    el.chatClear?.addEventListener('click', () => {
      state.chatLimit = (state.chatLimit || 300) > 80 ? 60 : 300;
      persistUi();
      toast(state.chatLimit <= 80 ? '聊天：收起历史（只看最近）' : '聊天：展开历史');
      renderChat();
      scrollChatBottom();
    });

    // type pick
    el.typePick?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => setActiveType(btn.dataset.type));
    });

    // record
    el.btnRec?.addEventListener('click', async () => {
      if (!state.recording.active) await startRecording();
      else await stopRecording();
    });

    // post
    el.btnPost?.addEventListener('click', postFromComposer);
    el.btnClear?.addEventListener('click', () => clearComposer(true));

    // refresh
    el.btnRefresh?.addEventListener('click', async () => {
      if (!state.room) return toast('先加入邀请码');
      if (state.online.ok) await refreshFromSupabase();
      else {
        state.data = loadLocalData(state.room);
        renderAll();
        toast('已刷新');
      }
    });

    // calendar nav
    el.calPrev?.addEventListener('click', () => {
      state.cal.m -= 1;
      if (state.cal.m < 0) { state.cal.m = 11; state.cal.y -= 1; }
      renderCalendar();
    });
    el.calNext?.addEventListener('click', () => {
      state.cal.m += 1;
      if (state.cal.m > 11) { state.cal.m = 0; state.cal.y += 1; }
      renderCalendar();
    });

    // clear date filter by clicking feedSub
    el.feedSub?.addEventListener('click', () => {
      if (!state.dateFilter) return;
      state.dateFilter = null;
      toast('已清除日期筛选');
      renderFeed();
      renderCalendar();
      setUrlState();
    });

    // online panel
    el.roomCode?.addEventListener('input', () => { el.roomCode.value = only6(el.roomCode.value); });
    el.btnJoin?.addEventListener('click', () => joinRoom(el.roomCode.value));

    el.sbUrl?.addEventListener('change', () => {
      state.sbUrl = (el.sbUrl.value || '').trim();
      LS.setStr(KEY.SB_URL, state.sbUrl);
    });
    el.sbKey?.addEventListener('change', () => {
      state.sbKey = (el.sbKey.value || '').trim();
      LS.setStr(KEY.SB_KEY, state.sbKey);
    });

    // share url builder
    if (el.siteUrl) el.siteUrl.addEventListener('change', () => {
      state.siteUrl = (el.siteUrl.value || '').trim();
      LS.setStr(KEY.SITE_URL, state.siteUrl);
      updateShareLink();
    });
    el.btnCopyLink?.addEventListener('click', async () => {
      const u = (el.shareUrl?.value || '').trim();
      if (!u) return toast('分享链接为空：先填邀请码 + 网站 URL（或部署后自动识别）');
      try{ await navigator.clipboard.writeText(u); toast('已复制到剪贴板'); }
      catch{ el.shareUrl?.select(); document.execCommand('copy'); toast('已复制'); }
    });
    el.btnOpenLink?.addEventListener('click', () => {
      const u = (el.shareUrl?.value || '').trim();
      if (!u) return toast('分享链接为空');
      // 某些浏览器会拦截 pop-up：window.open 失败就直接跳转
      const w = window.open(u, '_blank', 'noopener');
      if (!w) {
        toast('浏览器拦截了弹窗：将直接在当前页打开');
        try{ location.href = u; }catch{}
      }
    });
    el.shareUrl?.addEventListener('click', () => { el.shareUrl.select(); });

    // custom backgrounds
    el.bgFileStar?.addEventListener('change', () => {
      const f = el.bgFileStar.files && el.bgFileStar.files[0];
      if (f) setCustomBg('star', f);
      el.bgFileStar.value = '';
    });
    el.bgFileYan?.addEventListener('change', () => {
      const f = el.bgFileYan.files && el.bgFileYan.files[0];
      if (f) setCustomBg('yan', f);
      el.bgFileYan.value = '';
    });
    el.bgClearStar?.addEventListener('click', () => clearCustomBg('star'));
    el.bgClearYan?.addEventListener('click', () => clearCustomBg('yan'));

    // pets
    document.addEventListener('click', (e) => {
      // rename
      const r = e.target.closest('[data-pet-edit]');
      if (r) {
        const owner = r.getAttribute('data-pet-edit');
        if (owner) renamePet(owner);
        return;
      }

      // actions
      const b = e.target.closest('.petbtn');
      if (!b) return;
      const owner = b.dataset.owner;
      const act = b.dataset.action;
      if (!owner || !act) return;
      return petAction(owner, act);
    });

    el.btnTest?.addEventListener('click', testSupabase);

    // welcome
    el.btnCloseWelcome?.addEventListener('click', () => el.welcome?.classList.add('hidden'));
    el.btnWelcomeGen?.addEventListener('click', genInvite);
    el.welcomeCode?.addEventListener('input', () => { el.welcomeCode.value = only6(el.welcomeCode.value); });
    el.btnWelcomeJoin?.addEventListener('click', () => joinRoom(el.welcomeCode.value));
    el.pickStar?.addEventListener('click', () => setMe('star'));
    el.pickYan?.addEventListener('click', () => setMe('yan'));

    // voice play
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('button.play');
      if (!btn) return;
      const url = btn.dataset.url || '';
      const localId = btn.dataset.local || '';
      let audioUrl = url;
      let revokeAfter = false;
      if (!audioUrl && localId) {
        const blob = await idb.get(localId);
        if (blob) { audioUrl = URL.createObjectURL(blob); revokeAfter = true; }
      }
      if (!audioUrl) return toast('找不到语音文件');
      const audio = new Audio(audioUrl);
      if (revokeAfter) {
        audio.addEventListener('ended', () => {
          try{ URL.revokeObjectURL(audioUrl); }catch{}
        }, { once:true });
      }
      audio.play();
      toast('🎧 正在播放');
    });

    // chat
    el.chatSend?.addEventListener('click', async () => {
      if (!state.room) return toast('先加入邀请码');
      const v = (el.chatInput?.value || '').trim();
      if (!v) return;

      let reply_to = null;
      let reply_to_author = null;
      let reply_preview = null;
      if (state.chatReply.messageId) {
        reply_to = state.chatReply.messageId;
        reply_to_author = state.chatReply.author || null;
        reply_preview = state.chatReply.preview || null;
      }

      if (el.chatInput) el.chatInput.value = '';
      await addChatMessage({
        id: uid(),
        room_code: state.room,
        author: state.me,
        content: v,
        reply_to,
        reply_to_author,
        reply_preview,
        created_at: nowISO(),
      });

      clearChatReply();
      scrollChatBottom();
    });

    el.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.chatSend?.click();
      }
    });

    el.chatReplyCancel?.addEventListener('click', clearChatReply);
    el.btnChatBottom?.addEventListener('click', scrollChatBottom);

    // broadcast sync
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.type !== 'sync' || msg.room !== state.room) return;
      state.data = loadLocalData(state.room);
      renderAll();
    };
  }

  function scrollChatBottom(){
    if (!el.chatList) return;
    el.chatList.scrollTop = el.chatList.scrollHeight;
  }

  function setMe(me){
    if (me !== 'star' && me !== 'yan') return;
    state.me = me;
    LS.setStr(KEY.ME, me);
    setBodyTheme();
    renderHeader();
    renderComposer();
    renderFeed();
    renderChat();
    renderCalendar();
    setUrlState();
  }

  // ---------- v6: micro interactions ----------
  function persistUi(){
    LS.setStr('dc_v6_focus', state.ui.focus ? '1' : '0');
    LS.setStr('dc_v6_reading', state.ui.reading ? '1' : '0');
    LS.setStr('dc_v6_chatLimit', String(state.chatLimit || 300));
    LS.set('dc_v6_feedFilter', state.feedFilter || { author:'all', voiceOnly:false });
  }

  function setFocusMode(on){
    state.ui.focus = !!on;
    if (state.ui.focus) state.ui.reading = false;
    persistUi();
    setBodyTheme();
    toast(state.ui.focus ? '🕯️ 心流模式：已隐藏右侧' : '🕯️ 已退出心流');
  }

  function setReadingMode(on){
    state.ui.reading = !!on;
    if (state.ui.reading) state.ui.focus = false;
    persistUi();
    setBodyTheme();
    toast(state.ui.reading ? '📖 沉浸阅读：更专注的版式' : '📖 已退出沉浸');
  }

  function openFocusModal(){
    if (!el.focusModal) return;
    el.focusModal.classList.add('show');
    el.focusModal.setAttribute('aria-hidden', 'false');
    renderHourglass();
  }

  function closeFocusModal(){
    if (!el.focusModal) return;
    el.focusModal.classList.remove('show');
    el.focusModal.setAttribute('aria-hidden', 'true');
  }

  function fmtMMSS(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
  }

  function renderHourglass(){
    if (!el.hgTime || !el.hgFill) return;
    el.hgTime.textContent = fmtMMSS(state.hourglass.left);
    const t = Math.max(1, state.hourglass.total || 1);
    const pct = (1 - (state.hourglass.left / t)) * 100;
    el.hgFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    const goal = (el.hgGoal?.value || '').trim();
    if (el.hgHint) el.hgHint.textContent = goal ? `目标：${goal} · 你只需要一小段安静时间。` : '你可以把右侧栏隐藏，让注意力回到屏幕中央。';
  }

  function stopHourglassTimer(){
    if (state.hourglass.tm) clearInterval(state.hourglass.tm);
    state.hourglass.tm = null;
    state.hourglass.running = false;
  }

  function startHourglassTimer(){
    stopHourglassTimer();
    state.hourglass.running = true;
    state.hourglass.lastTs = Date.now();
    state.hourglass.tm = setInterval(() => {
      if (!state.hourglass.running) return;
      const now = Date.now();
      const dt = (now - state.hourglass.lastTs) / 1000;
      if (dt >= 0.25) {
        state.hourglass.lastTs = now;
        state.hourglass.left = Math.max(0, state.hourglass.left - dt);
        renderHourglass();
        if (state.hourglass.left <= 0) {
          stopHourglassTimer();
          toast('✨ 沙漏到底了：你做到了');
        }
      }
    }, 200);
  }

  function hourglassReset(){
    stopHourglassTimer();
    const mins = Math.max(5, Math.min(180, Number(el.hgMin?.value || 25)));
    state.hourglass.total = Math.round(mins * 60);
    state.hourglass.left = state.hourglass.total;
    renderHourglass();
  }

  // ---------- Boot ----------
  function boot(){
    applyUrlState();

    // v8：主题统一锁定（背景可独立切换/自定义）
    state.theme = 'storybook';
    LS.setStr(KEY.THEME, state.theme);

    // init inputs
    if (el.sbUrl) el.sbUrl.value = state.sbUrl;
    if (el.sbKey) el.sbKey.value = state.sbKey;
    if (el.siteUrl) el.siteUrl.value = state.siteUrl || '';
    if (el.roomCode) el.roomCode.value = only6(state.room);

    setBodyTheme();

    renderOnlineState();

    // composer defaults
    setActiveType('daily');

    // bind
    bindEvents();

    // load
    if (state.room) {
      state.data = loadLocalData(state.room);
      ensurePets();
      prepareCustomBg('star');
      prepareCustomBg('yan');
      updateShareLink();
      renderAll();
      if (hasSupabase()) testSupabase();
      el.welcome?.classList.add('hidden');
    } else {
      state.data = baseData();
      renderAll();
      el.welcome?.classList.remove('hidden');
      genInvite();
    }

    // initial view
    setView(state.view || 'today');

    // if url has date filter, re-render
    if (state.dateFilter) {
      renderFeed();
      renderCalendar();
    }
  }

  window.addEventListener('load', boot);
})();
