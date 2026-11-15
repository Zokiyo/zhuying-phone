/* 竹影小手机（SillyTavern 第三方扩展）
 * 悬浮按钮「机」打开：微信（和角色/NPC/群聊聊天、加联系人、改备注/头像/网名）、查角色手机、美化、锁屏、设置。
 * 数据存在「当前聊天」里：每张卡、每个聊天、每个身份(persona)都是各自独立的一部手机，互不相通。
 * API 设置与外观存在浏览器本地；地址留空时使用酒馆当前连接。
 * 角色知晓正文，正文也知晓小手机里的事（可在设置里关）。
 */
(function () {
  'use strict';
  const VERSION = '1.0.4';
  // 角色图册：作者把图放在网上的一个 JSON 里，把链接填到 ALBUM_URL；作者更新这个 JSON，所有人刷新即同步，用户端只读。
  // 格式见「角色图册_示例.json」。也可把少量图直接写进 ALBUM_EMBED（同样格式的 cats）。
  const ALBUM_URL = '';
  const ALBUM_KEY = ''; // 清单与图片用「album-encrypt-tool.html」加密时，把密钥填这里（留空=不加密）。需要 https 或 localhost 访问酒馆
  const ALBUM_USER = true; // 扩展版为 true：每个人可在图册里添加自己的图（存在本机 IndexedDB，不进聊天文件）
  const ALBUM_ALWAYS = false; // true：没填链接也显示图册图标（提示作者还没传）；扩展版为 false
  const ALBUM_EMBED = { 生活: [], 私密: [] };
  const win = window;
  const doc = win.document;
  const ST = win.SillyTavern || window.SillyTavern;
  const ROOT_ID = 'xyp-root';
  const getCtx = () => (ST && ST.getContext ? ST.getContext() : null);
  const guard = (label, fn) => (...a) => { try { const r = fn(...a); if (r && typeof r.then === 'function') return r.catch((e) => console.warn('[st-phone]', label, e)); return r; } catch (e) { console.warn('[st-phone]', label, e); } };
  const store = {
    get(k, d) { try { const v = win.localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { win.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { win.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const CFG_KEY = 'st_phone_cfg'; const POS_KEY = 'st_phone_pos'; const FAB_KEY = 'st_phone_fab';
  const STY_DEF = '';
  const DEF = { lvWb: true, entSend: true, proDm: true, upCm: true, dmN: 'mid', upSync: false, upSee: 'first', alPw: '', dmLink: true, grpLink: true, lsDm: true, scLen: 'auto', lsync: false, lsPost: true, lsRoom: false, lsN: '1', liveAdult: 'on', hk: true, igSave: true, igPre: '', igNeg: '', sty: STY_DEF, url: '', key: '', model: '', temp: 0.9, max: 500, auto: true, sync: true, know: true, ctxN: 3, len: 'short', keepN: 0, fab: true, theme: 'orig', story: true, ghost: false, adult: false, strip: '', lock: false, pw: '', mini: false, outClose: true, addC: 'off', cpKnow: 'once', lue: { time: 1, dur: 1, proc: 1, tool: 1, fan: 1 }, vid: { thought: 0 } };
  let cfg = { ...DEF };
  try { cfg = { ...DEF, ...JSON.parse(store.get(CFG_KEY, '{}') || '{}') }; } catch (e) { /* ignore */ }
  if (cfg.cpKnow === true) cfg.cpKnow = 'once'; else if (cfg.cpKnow === false) cfg.cpKnow = 'off';
  if (cfg.evN !== undefined) { if (cfg.cpKnow === 'once' && Number(cfg.evN) !== 1) cfg.cpKnow = 'n3'; delete cfg.evN; }
  const saveCfg = () => store.set(CFG_KEY, JSON.stringify(cfg));

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
  const hhmm = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const first = (s) => (String(s || '?').trim()[0] || '?');

  // ---------- 数据（存在聊天元数据里）----------
  const blank = () => ({ v: 1, user: { nick: '', avatar: '', wxid: '' }, contacts: [], msgs: {}, cp: {}, viewed: [], syncTs: 0 });
  const memD = { d: null };
  const ensureChar = (d, c) => {
    const nm = (c && c.name2) || '角色';
    let x = d.contacts.find((y) => y.isChar);
    if (!x) { x = { id: 'char', isChar: true, relInit: 1, name: nm, remark: '', rel: '伴侣', persona: '', avatar: '', know: 'auto' }; d.contacts.unshift(x); }
    if (x.isChar && !x.relInit) { x.relInit = 1; if (!x.rel) x.rel = '伴侣'; }
    x.name = nm;
  };
  const D = () => {
    const c = getCtx(); const md = c && c.chatMetadata;
    let d;
    if (!md) { d = memD.d || (memD.d = blank()); } else { if (!md.st_phone) md.st_phone = blank(); d = md.st_phone; }
    ensureChar(d, c); return d;
  };
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { const c = getCtx(); if (c && c.saveMetadata) c.saveMetadata(); } catch (e) { /* ignore */ } }, 400); };
  const uName = () => { const c = getCtx(); return (c && c.name1) || '我'; };
  const myNick = () => D().user.nick || uName();
  const getC = (id) => D().contacts.find((x) => x.id === id);
  const wxOk = (x) => !x.live || (x.friend && !x.wx); const dmOnly = (x) => x.live && !(x.friend && !x.wx);
  const cName = (x) => x.remark || x.nick || x.name;
  const charAvUrl = () => { try { const c = getCtx(); const ch = c.characters[c.characterId]; return ch && ch.avatar ? '/thumbnail?type=avatar&file=' + encodeURIComponent(ch.avatar) : ''; } catch (e) { return ''; } };
  const userAvUrl = () => { try { const c = getCtx(); const f = (c && c.user_avatar) || win.user_avatar; return f ? '/thumbnail?type=persona&file=' + encodeURIComponent(f) : ''; } catch (e) { return ''; } };
  const cAv = (x) => x.avatar || (x.isChar ? charAvUrl() : '');
  const uAv = () => D().user.avatar || userAvUrl();
  const av = (url, name, cls) => (url ? `<img class="xyp-av ${cls || ''}" src="${esc(url)}" data-n="${esc(first(name))}" alt="">` : `<span class="xyp-av xyp-avt ${cls || ''}">${esc(first(name))}</span>`);

  // ---------- 正文内容（给小手机角色看）----------
  const cleanText = (s) => {
    const tags = ['think', 'thinking', 'reasoning', 'details', 'style', 'script'].concat(String(cfg.strip || '').split(/[,，\s]+/).map((x) => x.replace(/[^\w\u4e00-\u9fa5-]/g, '')).filter(Boolean));
    return String(s || '').replace(/```[\s\S]*?```/g, '').replace(new RegExp('<(' + tags.join('|') + ')(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1>', 'gi'), '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  };
  const storyText = (n, maxChars) => {
    const c = getCtx(); const chat = (c && c.chat) || []; const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < n; i--) {
      const m = chat[i]; if (!m || m.is_system) continue;
      const t = cleanText(m.mes); if (!t) continue;
      out.unshift((m.is_user ? uName() : (m.name || c.name2 || '角色')) + '：' + clip(t, m.is_user ? 300 : 700));
    }
    const s = out.join('\n'); return s.length > maxChars ? s.slice(s.length - maxChars) : s;
  };
  const charCard = () => {
    try { const c = getCtx(); const ch = c.characters[c.characterId]; const d = ch.data || {}; return clip(cleanText(ch.description || d.description || ''), 1000) + (ch.personality || d.personality ? ' ' + clip(ch.personality || d.personality, 250) : ''); } catch (e) { return ''; }
  };
  const knows = (x) => {
    if (!cfg.know) return false;
    if (x.know === 'yes') return true; if (x.know === 'no') return false; if (x.isChar) return true;
    const hay = storyText(30, 30000); return [x.name, x.remark].filter(Boolean).some((n) => hay.includes(n));
  };

  // ---------- 调用 API ----------
  const apiUrl = (u) => { const b = (u == null ? cfg.url : u).trim().replace(/\/+$/, ''); if (/\/chat\/completions$/.test(b)) return b; return b + (/\/v\d+$/.test(b) ? '' : '/v1') + '/chat/completions'; };
  const callAPI = async (messages, opt) => {
    opt = opt || {}; const t0 = Date.now(); let t1 = 0;
    if (opt.onText) { const fn = opt.onText; opt = { ...opt, onText: (x) => { if (!t1) t1 = Date.now() - t0; return fn(x); } }; }
    try { return await callAPI0(messages, opt); } finally { try { console.info('[xy-phone] API(' + (opt.f || '-') + ') 总耗时 ' + (Date.now() - t0) + 'ms' + (t1 ? '，首字 ' + t1 + 'ms' : '')); } catch (e) { /* ignore */ } }
  };
  const callAPI0 = async (messages, opt) => {
    opt = opt || {};
    if (!opt.nowb) { const wt = await wbText(messages.filter((m) => opt.f !== 'live' || m.role !== 'system').map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((q) => q.text || '').join(''))).join('\n'), opt.wbl); if (wt) { const wm = { role: 'system', content: '【世界书（补充设定，按需参考）】\n' + wt }; messages = messages[0] && messages[0].role === 'system' ? [messages[0], wm].concat(messages.slice(1)) : [wm].concat(messages); } }
    { let mk = opt.mask; if (!mk && opt.f === 'live') { try { mk = [uName(), lvNick()]; } catch (e) { mk = null; } } if (mk && mk[0] && mk[1] && mk[0] !== mk[1]) messages = messages.map((m) => (typeof m.content === 'string' ? { ...m, content: m.content.split(mk[0]).join(mk[1]) } : m)); }
    const ap = (cfg.ap && opt.f && cfg.ap[opt.f]) || {}; const own = !!(ap.url && ap.url.trim()); const A = own ? ap : cfg;
    if (A.url && A.url.trim() && opt.onText && win.TextDecoder) {
      let full = '';
      try {
        const r0 = await win.fetch(apiUrl(A.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (A.key || '').trim() }, body: JSON.stringify({ model: (A.model || '').trim() || (own ? cfg.model.trim() : '') || 'gpt-4o-mini', messages, stream: true, temperature: opt.temp != null ? opt.temp : (Number(cfg.temp) || 0.9), max_tokens: opt.max || cfg.max }) });
        if (r0.ok && r0.body && r0.body.getReader) {
          const rd = r0.body.getReader(); const dec = new win.TextDecoder(); let raw = '', carry = '';
          for (;;) {
            const { done, value } = await rd.read(); if (done) break; const ch = dec.decode(value, { stream: true }); raw += ch; carry += ch; const parts = carry.split('\n'); carry = parts.pop();
            parts.forEach((ln) => { ln = ln.trim(); if (ln.indexOf('data:') !== 0) return; const dd = ln.slice(5).trim(); if (dd === '[DONE]') return; try { const j = JSON.parse(dd); const c = j.choices && j.choices[0]; const t = c && ((c.delta && c.delta.content) || (c.message && c.message.content) || c.text); if (t) full += t; } catch (e) { /* ignore */ } });
            if (full) opt.onText(full);
          }
          if (full) return full;
          try { const j = JSON.parse(raw); const t = j.choices[0].message ? j.choices[0].message.content : j.choices[0].text; if (t) return String(t); } catch (e) { /* ignore */ }
        }
      } catch (e) { if (full) return full; }
    }
    if (A.url && A.url.trim()) {
      const r = await win.fetch(apiUrl(A.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (A.key || '').trim() }, body: JSON.stringify({ model: (A.model || '').trim() || (own ? cfg.model.trim() : '') || 'gpt-4o-mini', messages, temperature: opt.temp != null ? opt.temp : (Number(cfg.temp) || 0.9), max_tokens: opt.max || cfg.max }) });
      if (!r.ok) throw new Error('接口返回 ' + r.status + '：' + clip(await r.text(), 120));
      const j = await r.json(); const t = j && j.choices && j.choices[0] && (j.choices[0].message ? j.choices[0].message.content : j.choices[0].text);
      if (!t) throw new Error('接口没有返回内容'); return String(t);
    }
    if ((cfg.model || '').trim() && stOK()) { try { return await stGen(messages, opt, cfg.model.trim()); } catch (e) { console.warn('[xy-phone] 酒馆接口指定模型失败，改用酒馆默认模型', e); } }
    const gc = getCtx(); const g = (gc && gc.generateRaw) || win.generateRaw;
    if (typeof g !== 'function') throw new Error('还没有设置 API：请到「设置」里填接口地址和密钥');
    const t = await g({ ordered_prompts: messages, should_silence: true, max_chat_history: 0 });
    if (!t) throw new Error('酒馆当前连接没有返回内容，建议到「设置」里单独填 API'); return String(t);
  };

  // 聊天图片：缩小后存浏览器本地（不放进聊天数据，避免体积过大），最多留30张
  const STK_KEY = 'xy_phone_stk';
  let stkMem = null; const stkLoad = () => { if (!stkMem) { try { const a = JSON.parse(store.get(STK_KEY, '[]')); stkMem = Array.isArray(a) ? a.filter((q) => q && q.id && q.src) : []; } catch (e) { stkMem = []; } } return stkMem.slice(); };
  const stkSave = (a) => { try { stkMem = a.slice(-60); store.set(STK_KEY, JSON.stringify(stkMem)); } catch (e) { tip('存储空间不足，请删掉一些表情'); } };
  const stkAdd = (src) => { const a = stkLoad(); a.push({ id: 'k' + Date.now().toString(36) + Math.floor(Math.random() * 99), src }); stkSave(a); };
  const stkRef = (q) => (/^https?:/.test(q.src) ? q.src : 'S' + q.id);
  const openStk = (man) => { const l = stkLoad(); const cid = cur().id;
    showDlg(`<div class="bx"><b>表情包${man ? '（点表情删除）' : ''}</b><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:42vh;overflow-y:auto;margin:10px 0">${l.length ? l.map((q) => `<div data-act="${man ? 'stkdel' : 'stksend'}" data-id="${esc(q.id)}" style="position:relative;cursor:pointer"><img class="xyp-stk" style="width:100%;height:auto;aspect-ratio:1;" src="${esc(q.src)}" alt="">${man ? '<i style="position:absolute;right:2px;top:2px;background:#000;color:#fff;border-radius:50%;width:16px;height:16px;line-height:16px;font-size:11px;text-align:center;font-style:normal">✕</i>' : ''}</div>`).join('') : '<div style="grid-column:1/-1;opacity:.6;font-size:13px;padding:16px 0">还没有表情包，点下面上传</div>'}</div><div class="xyp-center"><span class="xyp-btn" data-act="stkadd">＋网址</span><span class="xyp-btn" data-act="stkpick">＋相册</span>${l.length ? `<span class="xyp-btn${man ? ' pri' : ''}" data-act="stkman">${man ? '完成' : '整理'}</span>` : ''}</div><div class="bt"><span data-act="dlgno">关闭</span></div></div>`); openStk.cid = cid; openStk.man = !!man; };
  const IMGS_KEY = 'xy_phone_imgs';
  let imgMem = null; const imgAll = () => { if (!imgMem) { try { imgMem = JSON.parse(store.get(IMGS_KEY, '{}')) || {}; } catch (e) { imgMem = {}; } } return imgMem; };
  const imgGet = (id) => imgAll()[id] || '';
  const imgPut = (url) => { imgMem = null; let m = Object.assign({}, imgAll()); const id = 'i' + Date.now().toString(36) + Math.floor(Math.random() * 99); m[id] = url; const ks = Object.keys(m); while (ks.length > 30 || (ks.length > 1 && JSON.stringify(m).length > 3500000)) delete m[ks.shift()]; store.set(IMGS_KEY, JSON.stringify(m)); imgMem = m; return 'L' + id; };
  const igReady = () => { const a = (cfg.ap && cfg.ap.ig) || {}; return !!(cfg.igOn && (a.url || '').trim() && (a.model || '').trim()); };
  const igShrink = (src, mx, q) => new Promise((res, rej) => { const im = new win.Image(); im.crossOrigin = 'anonymous'; im.onerror = () => rej(new Error('x')); im.onload = () => { try { const k = Math.min(1, (mx || 480) / Math.max(im.width, im.height)); const cv = doc.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', q || 0.78)); } catch (e) { rej(e); } }; im.src = src; });
  let igBad = false;
  const igGen = async (p, o) => {
    const a = cfg.ap.ig; const neg = (cfg.igNeg || '').trim(); const pp = ((cfg.igPre || '').trim() ? cfg.igPre.trim() + ', ' : '') + p; const b = a.url.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|images\/generations)$/, ''); const v1 = b + (/\/v\d+$/.test(b) ? '' : '/v1'); const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (a.key || '').trim() };
    const viaImg = async () => { const r = await win.fetch(v1 + '/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: a.model.trim(), prompt: clip(pp, 700), n: 1, ...(neg ? { negative_prompt: neg } : {}) }) }); if (!r.ok) throw new Error('图片接口返回 ' + r.status + '：' + clip(await r.text(), 90)); const j = await r.json(); const d = j && j.data && j.data[0]; const s = d && (d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url); if (!s) throw new Error('图片接口没有返回图片'); return s; };
    const viaChat = async () => { const r = await win.fetch(v1 + '/chat/completions', { method: 'POST', headers: H, body: JSON.stringify({ model: a.model.trim(), messages: [{ role: 'user', content: '请生成一张图片：' + clip(pp, 700) + (neg ? '。避免：' + neg : '') }] }) }); if (!r.ok) throw new Error('对话接口返回 ' + r.status + '：' + clip(await r.text(), 90)); const j = await r.json(); const m = j && j.choices && j.choices[0] && j.choices[0].message; if (!m) throw new Error('对话接口没有返回内容'); let s = ''; const im = m.images && m.images[0]; if (im) s = (im.image_url && im.image_url.url) || im.url || ''; if (!s) { const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''); const q = c.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+\/=]+/) || c.match(/https?:\/\/[^\s)"'\]\\]+/); if (q) s = q[0]; } if (!s) throw new Error('对话接口里没有图片'); return s; };
    let src; try { src = await viaImg(); } catch (e1) { try { src = await viaChat(); } catch (e2) { igBad = true; throw new Error(String(e1.message || e1) + '；' + String(e2.message || e2) + (/fetch|Failed|NetworkError/i.test(String(e1.message || e1)) ? '（可能是浏览器跨域被拦，或地址不对）' : '')); } }
    try { src = await igShrink(src, o && o.max, o && o.q); } catch (e) { /* 保留原样 */ }
    igBad = false; return imgPut(src);
  };
  const igMsg = (cid) => { if (!igReady()) return; const l = D().msgs[cid] || []; const m = l[l.length - 1]; if (!m || m.k !== 'timg') return; m.ig = 1; igGen(m.t).then((id) => { m.img = id; delete m.ig; save(); renderMsgs(); }).catch((e) => { delete m.ig; renderMsgs(); tip('生图失败，保留文字：' + (e.message || e)); }); };
  const imgSrc = (v) => (v && v[0] === 'S' && /^S[a-z0-9]{4,}$/.test(v) ? ((stkLoad().find((q) => 'S' + q.id === v) || {}).src || '') : v && v[0] === 'L' && !/^L?https?:/.test(v) ? imgGet(v.slice(1)) : v || '');
  const toBig = (file, max) => new Promise((res, rej) => { const fr = new win.FileReader(); fr.onerror = () => rej(new Error('读取失败')); fr.onload = () => { const im = new win.Image(); im.onerror = () => rej(new Error('不是图片')); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const cv = doc.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.7)); }; im.src = fr.result; }; fr.readAsDataURL(file); });
  // 使用酒馆当前连接（密钥在酒馆服务端）+ 指定模型
  const stOK = () => { const c = getCtx(); return !!(c && c.chatCompletionSettings && c.getRequestHeaders); };
  const stGen = async (messages, opt, model) => {
    const c = getCtx(); const s0 = c.chatCompletionSettings;
    const body = { type: 'quiet', messages, model, temperature: opt.temp != null ? opt.temp : (Number(cfg.temp) || 0.9), max_tokens: opt.max || cfg.max, stream: false, chat_completion_source: s0.chat_completion_source, reverse_proxy: s0.reverse_proxy, proxy_password: s0.proxy_password, custom_url: s0.custom_url, custom_include_headers: s0.custom_include_headers, custom_include_body: s0.custom_include_body, custom_exclude_body: s0.custom_exclude_body, azure_base_url: s0.azure_base_url, azure_deployment_name: s0.azure_deployment_name, azure_api_version: s0.azure_api_version };
    const r = await win.fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('酒馆接口返回 ' + r.status + '：' + clip(await r.text(), 100));
    const j = await r.json(); const ch = j && j.choices && j.choices[0];
    const t = (ch && (ch.message ? ch.message.content : ch.text)) || (j && Array.isArray(j.content) && j.content.map((q) => q.text || '').join('')) || (j && j.text);
    if (!t) throw new Error('酒馆接口没有返回内容'); return String(t);
  };
  const fetchModels = async () => {
    if ((cfg.url || '').trim()) {
      const u = apiUrl(cfg.url).replace(/\/chat\/completions$/, '/models');
      const r = await win.fetch(u, { headers: { Authorization: 'Bearer ' + (cfg.key || '').trim() } }); if (!r.ok) throw new Error('接口返回 ' + r.status);
      const j = await r.json(); const a = (j.data || j.models || []).map((q) => (typeof q === 'string' ? q : q.id || q.name)).filter(Boolean); if (!a.length) throw new Error('没有取到模型'); return a;
    }
    const c = getCtx(); const s0 = c && c.chatCompletionSettings; if (!s0) throw new Error('读不到酒馆连接，请先在酒馆里连接 API');
    const src = s0.chat_completion_source; const set = new Set();
    doc.querySelectorAll('select[id^="model_"]').forEach((sel) => { const p = sel.closest('[data-source]'); if (p && String(p.dataset.source).split(',').map((q) => q.trim()).includes(src)) sel.querySelectorAll('option').forEach((op) => { if (op.value) set.add(op.value); }); });
    if (!set.size && c.getRequestHeaders) { const r = await win.fetch('/api/backends/chat-completions/status', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ reverse_proxy: s0.reverse_proxy, proxy_password: s0.proxy_password, chat_completion_source: src, custom_url: s0.custom_url }) }); if (r.ok) { const j = await r.json(); (j.data || []).forEach((q) => { const id = typeof q === 'string' ? q : q.id; if (id) set.add(id); }); } }
    if (!set.size) throw new Error('没取到模型：请先在酒馆里连接 API，或在上面填地址和密钥');
    return [...set];
  };
  const scTxt = () => { const k = cfg.scLen || 'auto'; const m = k === 'auto' ? (igReady() && !igBad ? 'long' : 'short') : k; return { short: '1句，不超过40字', mid: '2句，约80字', long: '3到4句' }[m] || '1句，不超过40字'; };
  const ST_BASE = { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1', deepseek: 'https://api.deepseek.com/v1', groq: 'https://api.groq.com/openai/v1', mistralai: 'https://api.mistral.ai/v1', xai: 'https://api.x.ai/v1' };
  const stRead = async () => {
    const c = getCtx(); const s0 = c && c.chatCompletionSettings; if (!s0 || !c.getRequestHeaders) throw new Error('读不到酒馆连接，请先在酒馆里连接 API');
    const src = s0.chat_completion_source; const url = src === 'custom' ? s0.custom_url : (s0.reverse_proxy || ST_BASE[src]);
    if (!url) throw new Error('当前连接（' + src + '）不是通用接口，没法直连，继续用酒馆连接即可');
    const sk = 'api_key_' + src; let key = '';
    try { const r = await win.fetch('/api/secrets/view', { method: 'POST', headers: c.getRequestHeaders(), body: '{}' }); if (r.ok) { const j = await r.json(); if (j && typeof j[sk] === 'string') key = j[sk]; else if (j && j[sk] && j[sk].value) key = String(j[sk].value); } } catch (e) { /* ignore */ }
    if (!key) { try { const r = await win.fetch('/api/secrets/find', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ key: sk }) }); if (r.ok) { const j = await r.json(); if (j && j.value) key = String(j.value); } } catch (e) { /* ignore */ } }
    if (!key && s0.proxy_password) key = s0.proxy_password;
    return { url, key };
  };
  // ---------- 小手机用的世界书 ----------
  const WBS_KEY = 'xy_phone_wbs'; let wbCache = null, wbCacheL = null;
  const saveWbs = (a) => { try { store.set(WBS_KEY, JSON.stringify(a)); return true; } catch (e) { tip('存储空间不足，世界书没存下'); return false; } };
  const loadWbs = () => { try { const a = JSON.parse(store.get(WBS_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const normBook = (j) => { let es = j && (j.entries || (j.data && j.data.character_book && j.data.character_book.entries) || (j.character_book && j.character_book.entries)); if (!es) return null; es = Array.isArray(es) ? es : Object.values(es); return es.filter((e) => e && e.content && e.disable !== true && e.enabled !== false).map((e) => ({ k: [].concat(e.key || e.keys || []).filter(Boolean).map(String), c: String(e.content), con: !!e.constant })); };
  const cardChar = () => { const c = getCtx(); return c && c.characters && c.characters[c.characterId]; };
  const wbId = (e) => e.c.slice(0, 24) + e.c.length;
  const wbEntries = (o) => { if (!wbCache) { if (!o.wbl) { o.wbl = 1; wbText('').then(() => { if (cur().p === 'settings') render(); }); } return '<div class="xyp-tip">正在读取条目……</div>'; } const off = cfg.wbOff || []; const es = wbCache.books.flat(); if (!es.length) return '<div class="xyp-tip">还没有可用条目</div>'; return `<div class="xyp-tip">条目开关（${es.length} 条，取消勾选 = 不用）</div><div style="max-height:220px;overflow:auto;padding:4px 14px">${es.map((e) => `<label style="display:block;font-size:12px;margin:3px 0"><input type="checkbox" data-wbe="${esc(wbId(e))}" ${off.includes(wbId(e)) ? '' : 'checked'}> ${esc((e.k.slice(0, 2).join('/') || '常驻') + '：' + clip(e.c, 16))}</label>`).join('')}</div>`; };
  const wbText = async (mt, live) => {
    const m = cfg.wbMode; if (live) { if (cfg.lvWb === false) return ''; } else if (!m || m === 'off') return ''; const max = live ? 600 : (Number(cfg.wbMax) || 800); const c = getCtx();
    try {
      if (!live && m === 'follow') { if (!c || !c.getWorldInfoPrompt) return ''; const chat = (c.chat || []).slice(-6).map((x) => (x && x.mes) || '').reverse(); const r = await c.getWorldInfoPrompt(chat, 8192, true); return clip(String(r.worldInfoString || '').trim(), max); }
      if (live) { const sel = cfg.lvWbSel || 'card'; if (!wbCacheL || wbCacheL.sel !== sel || Date.now() - wbCacheL.t > 30000) { const books = []; if (sel === 'card') { const ch = cardChar(); if (ch) { const cb = ch.data && ch.data.character_book && normBook(ch.data.character_book); if (cb) books.push(cb); const nm = ch.data && ch.data.extensions && ch.data.extensions.world; if (nm && c.loadWorldInfo) { const nb = normBook(await c.loadWorldInfo(nm)); if (nb) books.push(nb); } } } else if (sel.indexOf('n:') === 0) { const nb = c && c.loadWorldInfo && normBook(await c.loadWorldInfo(sel.slice(2))); if (nb) books.push(nb); } else if (sel.indexOf('i:') === 0) { const b = loadWbs().find((q) => q.id === sel.slice(2)); if (b) books.push(b.es); } wbCacheL = { t: Date.now(), sel, books }; } const hit = []; wbCacheL.books.forEach((es) => es.forEach((e) => { if (e.con && !(cfg.wbOff || []).includes(wbId(e))) hit.push(e.c); })); return clip([...new Set(hit)].join('\n'), max); }
      if (!wbCache || Date.now() - wbCache.t > 30000) {
        const books = []; const ch = cardChar();
        if (cfg.wbCard && ch) { const cb = ch.data && ch.data.character_book && normBook(ch.data.character_book); if (cb) books.push(cb); const nm = ch.data && ch.data.extensions && ch.data.extensions.world; if (nm && c.loadWorldInfo) { const nb = normBook(await c.loadWorldInfo(nm)); if (nb) books.push(nb); } }
        for (const n of (cfg.wbNames || [])) { const nb = c && c.loadWorldInfo && normBook(await c.loadWorldInfo(n)); if (nb) books.push(nb); }
        const imp = loadWbs(); (cfg.wbImp || []).forEach((id) => { const b = imp.find((q) => q.id === id); if (b) books.push(b.es); });
        wbCache = { t: Date.now(), books };
      }
      const lo = mt.toLowerCase(); const hit = [];
      wbCache.books.forEach((es) => es.forEach((e) => { if (!(cfg.wbOff || []).includes(wbId(e)) && (e.con || e.k.some((k) => lo.includes(k.toLowerCase())))) hit.push(e.c); }));
      return clip([...new Set(hit)].join('\n'), max);
    } catch (e) { return ''; }
  };
  const lvWbSelUI = () => { const c = getCtx(); let names = []; try { names = (c && c.getWorldInfoNames && c.getWorldInfoNames()) || []; } catch (e) { names = []; } const imp = loadWbs(); const sel = cfg.lvWbSel || 'card'; const op = (v, t) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(t)}</option>`; return `<div class="xyp-f"><label>直播用哪本</label><select data-cfg="lvWbSel">${op('card', '本卡绑定世界书')}${names.map((n) => op('n:' + n, n)).join('')}${imp.map((b) => op('i:' + b.id, b.name + '（导入）')).join('')}</select></div><div class="xyp-tip">只能选一本，直播只带这一本里的常驻（蓝灯）条目，最多 600 字；破限类世界书很占字数，建议不要选。</div>`; };
  const igUI = (o) => { const a = (cfg.ap && cfg.ap.ig) || {}; const ok = cfg.igOn && a.url && a.model; return `<div class="xyp-h" style="display:flex;justify-content:space-between;align-items:center">生图 API 接口<input type="checkbox" data-cfgb="igOn" ${cfg.igOn ? 'checked' : ''}></div>${cfg.igOn ? `
<div class="xyp-f"><label>地址</label><input data-ap="ig.url" value="${esc(a.url || '')}" placeholder="https://xxx.com/v1（OpenAI 兼容 /images/generations）"></div>
<div class="xyp-f"><label>密钥</label><input data-ap="ig.key" type="password" value="${esc(a.key || '')}"></div>
<div class="xyp-f"><label>模型</label><input data-act="pickm" data-k="ig" readonly value="${esc(a.model || '')}" placeholder="点击选择模型"><span class="xyp-btn" data-act="fetchig" style="margin:0">拉取</span></div>
<div class="xyp-f"><label>画风/画师串</label><input data-cfg="igPre" value="${esc(cfg.igPre || '')}" placeholder="可选，附在每张图提示词前"></div>
<div class="xyp-f"><label>负面提示词</label><input data-cfg="igNeg" value="${esc(cfg.igNeg || '')}" placeholder="可选，如：lowres, bad hands, text"></div>
<div class="xyp-center"><span class="xyp-btn" data-act="igtest">测试生图</span></div>${o.igt ? (typeof o.igt === 'string' ? `<div class="xyp-tip">${esc(o.igt)}</div>` : `<div class="xyp-center"><img class="xyp-pic" src="${esc(imgSrc(o.igt.img))}"></div>`) : ''}
${tog('igSave', '直播图允许保存', '放大后可点「保存图片」或长按；关闭则不能保存。角色图册里的图始终不能保存')}` : ''}
<div class="xyp-tip">${ok ? '已开启：微信「文字图片」和直播间的「画面」会生成真正的图片；生成失败时保留文字。' : cfg.igOn ? '已打开开关，但还没填地址、拉取并选好模型，目前仍使用文字描述。' : '关闭中：图片用文字描述。开启后每张图会调用一次生图接口（可能收费）。'}</div>`; };
  const PRE_KEY = 'xy_phone_presets'; const PKEYS = ['url', 'key', 'model', 'ap', 'igOn', 'wbMode', 'wbCard', 'wbNames', 'wbImp', 'wbOff', 'wbMax'];
  const loadPre = () => { try { const a = JSON.parse(store.get(PRE_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const savePre = (a) => store.set(PRE_KEY, JSON.stringify(a));
  const preUI = (o) => { const l = loadPre(); return `<div class="xyp-h">预设（API + 世界书，一键切换）</div>${l.map((p, i) => `<div class="xyp-f"><label style="flex:1;width:auto">${esc(p.name)}</label><span class="xyp-btn" data-act="preuse" data-i="${i}" style="margin:0">应用</span><span class="xyp-btn" data-act="preov" data-i="${i}" style="margin:0 0 0 4px">覆盖</span><span data-act="predel" data-i="${i}" style="cursor:pointer;padding:0 8px">${o.pdel === i ? '确认✕' : '✕'}</span></div>`).join('')}<div class="xyp-center"><span class="xyp-btn pri" data-act="presave">保存当前设置为预设</span></div>`; };
  const wbCount = () => (cfg.wbCard ? 1 : 0) + (cfg.wbNames || []).length + (cfg.wbImp || []).length;
  const wbUI = (o) => {
    const c = getCtx(); const names = (c && c.getWorldInfoNames && c.getWorldInfoNames()) || []; const imp = loadWbs(); const ch = cardChar(); const bn = ch && ch.data && ch.data.extensions && ch.data.extensions.world;
    const md = cfg.wbMode || 'off'; const B = (m, t) => `<span class="xyp-btn${md === m ? ' pri' : ''}" data-act="wbmode" data-m="${m}">${t}</span>`;
    const T = (on, tg, v, t) => `<span class="xyp-btn${on ? ' pri' : ''}" data-act="wbtog" data-t="${tg}" data-v="${esc(v)}">${on ? '✓ ' : ''}${t}</span>`;
    return `<div class="xyp-h">世界书（小手机用）</div>
<div class="xyp-center" style="flex-wrap:wrap;gap:6px">${B('off', '关闭')}${B('follow', '跟随酒馆')}${B('pick', '选用部分')}</div>
${md === 'pick' ? `<div class="xyp-center" style="flex-wrap:wrap;gap:6px"><span class="xyp-btn" data-act="wbpick">选择世界书（已选 ${wbCount()}）</span><span class="xyp-btn" data-act="wbent">条目开关</span></div>` : ''}
<div class="xyp-center"><span class="xyp-btn" data-act="wbcard">一键开启本卡世界书</span><span class="xyp-btn" data-act="wbimp">导入世界书</span></div>
<div class="xyp-f"><label>最多字数</label><input data-cfg="wbMax" type="number" min="200" step="100" value="${esc(cfg.wbMax || 800)}"></div>
<div class="xyp-tip">只在小手机自己的请求里附上，不会进入正文。「跟随」= 当前酒馆里被触发的世界书条目；「选用」= 常驻条目 + 关键词出现在最近内容里的条目。导入的世界书只存在本浏览器，不用再导进酒馆。</div>`;
  };
  // ---------- 微信聊天 ----------
  const busy = {}; const errs = {};
  const gTxt = (m, who) => ((m.r === 'u' ? who : (getC(m.w) ? cName(getC(m.w)) : '成员')) + '：' + clip(mtxt(m), 40));
const grpCtx = (x) => { if (cfg.grpLink === false || x.isGroup) return ''; const d = D(); return d.contacts.filter((g) => g.isGroup && (g.members || []).includes(x.id)).map((g) => { const ms = (d.msgs[g.id] || []).filter((m) => m.k !== 'sys').slice(-6); return ms.length ? `你在微信群聊「${g.name}」里，群里最近的聊天（你都看到了）：\n` + ms.map((m) => gTxt(m, nickFor(x))).join('\n') : ''; }).filter(Boolean).join('\n'); };
const dmCtxForGroup = (mem, u) => { if (cfg.grpLink === false) return ''; const d = D(); return mem.map((m) => { const ms = (d.msgs[m.id] || []).filter((q) => q.k !== 'sys').slice(-3); return ms.length ? `${m.name}与${u}的私聊最近几句（只有${m.name}自己知道，其他成员不一定知道）：` + ms.map((q) => (q.r === 'u' ? u : m.name) + '：' + clip(mtxt(q), 40)).join(' / ') : ''; }).filter(Boolean).join('\n'); };
const buildChat = (x, flag, vis) => {
    const d = D(); const u = nickFor(x); const k = knows(x); const story = k ? storyText(Number(cfg.ctxN) || 6, (Number(cfg.ctxN) || 6) * 800) : '';
    const persona = x.isChar ? '角色设定：' + charCard() : (x.persona ? '人物设定：' + x.persona : '（没有详细设定，请根据名字、备注和与用户的关系合理扮演）');
    const len = { short: '每次回复1~3条很短的消息（每条不超过30字）', mid: '每次回复2~5条消息（每条不超过60字）' }[cfg.len] || '';
    const sys = [`你正在扮演微信里的联系人「${x.name}」，对面是用户「${u}」${x.remark ? `（用户给你的备注是「${x.remark}」）` : ''}。` + (x.rel ? `你和对方的关系：${x.rel}。` : ''),
      persona,
grpCtx(x),
fcChatRule(x),
k && story ? `你已经知道的近期剧情（只使用你亲身经历或知情的部分，不要凭空知道别人的秘密）：\n${story}` : `你不知道对方最近经历了什么，只根据聊天内容回应。`,
      (cfg.upSync && x.pid ? upCtx(x.pid) : '') + (cfg.dmLink !== false && linkOf(x) ? `你们此前在${x.live ? '微信' : '直播平台私信'}里聊过（你都记得）：${dmSum(linkOf(x).id)}。\n` : '') + (x.rmf > 0 ? (x.rmf--, '对方刚把你移出了粉丝列表，你可以询问原因或挽留，也可以不在意，按你的人设。\n') : '') + (x.live ? `你是直播平台的主播，对方是你直播间的观众${x.friend ? '，你们已经交换了微信' : '，目前只在直播平台私信'}。${liveCtx(x)}` : '') + (flag === 'loc' ? `\n用户请求查看你的位置。你自己决定是否同意（符合人设和你们的关系）：同意就单独一行写「【定位】具体地点」（符合当前剧情和时间），再正常说话；不同意就自然拒绝，不要写【定位】。` : flag === 'exch' ? `\n对方提出交换微信联系方式。你自己决定是否同意（符合人设和相处情况）：同意就单独一行写「【同意】」并正常说话，表示你会主动加对方微信；不同意就委婉拒绝，不要写【同意】。` : ''),
      `先读清聊天记录里谁对谁做了什么、谁是主动方：${u}说的话和做的事是${u}的，不要当成自己的，也不要把双方角色对调或反过来问对方；以你自己的身份和立场接着回应。语气严格贴合人设原本的性格和说话习惯，不要写成霸道总裁、命令式或油腻的口吻；性格软萌就保持软萌，口语化、自然。不要输出<标签>、「甲→乙：」这类格式或名字前缀，只写消息正文。`,
      (cfg.sty || '').trim() ? '额外要求（必须遵守）：' + cfg.sty.replace(/\{\{user\}\}/g, u) : '',
      (() => { const pf0 = x.pid && (LV().prof || {})[x.pid]; return pf0 && !pf0.sf && !pf0.gone ? `如果你愿意关注${u}（比如对方请你关注你），就在回复里单独写一行【关注】，这样才真的关注；不愿意就不要说已经关注。` : ''; })(),
      `只输出你发的微信消息，一条消息一行，不要旁白、动作描写、引号和说明；口语化，像真人发微信；${len}；保持人设，和聊天记录连贯。`].filter(Boolean).join('\n\n');
    const nt = (m) => (m.note ? `，备注「${m.note}」` : '');
    const hist = (d.msgs[x.id] || []).filter((m) => m.k !== 'sys').slice(-10).map((m) => {
      const role = m.r === 'u' ? 'user' : 'assistant'; let content;
      if (m.r === 'u' && m.k === 'img' && m.st) content = `（${u}发了一个表情包，用来表达心情）`; else if (m.r === 'u' && m.k === 'img') { const kind = m.fl ? '闪照（只能看一次）' : '图片'; if (!m.seen) { const src = imgSrc(m.img); content = vis && src ? [{ type: 'text', text: `（${u}发来一张${kind}，请根据画面内容自然回应）` }, { type: 'image_url', image_url: { url: src } }] : `（${u}发来一张${kind}，你看不清具体内容，可以自然地问问拍的是什么）`; } else content = `（${u}之前发来过一张${m.fl ? '闪照，你已经看过一次，现在无法再看' : '图片'}）`; }
      else if (m.r === 'u' && m.k) content = { voice: `（${u}给你发来一条语音，内容是：${m.t}）`, gift: `（${u}送了你礼物：${m.t}）`, loc: `（${u}发来了自己的定位：${m.t}）`, req: `（${u}想查看你的位置，请求你共享定位）`, pay: `（${u}给你转账¥${m.amt}${nt(m)}，你已收款）`, rp: `（${u}给你发了红包¥${m.amt}${nt(m)}，你已领取）`, timg: `（${u}发来一张图片。图片内容是：${m.t}。你看到的是一张与这段描述很相似的图片）`, call: `（${m.t}）` }[m.k];
      else if (m.k === 'loc') content = `（你共享了定位：${m.t}）`; else if (m.k === 'call') content = `（${m.t}）`; else content = m.t;
      return { role, content };
    });
    if (!hist.length || hist[hist.length - 1].role !== 'user') hist.push({ role: 'user', content: '（请继续回复）' });
    return [{ role: 'system', content: sys }, ...hist];
  };
  const pushMsg = (id, r, t, ts, w, k) => { const d = D(); (d.msgs[id] || (d.msgs[id] = [])).push({ r, t, ts: ts || Date.now(), ...(w ? { w } : {}), ...(k ? { k } : {}) }); };
  // 特殊消息（语音/礼物/定位/请求）在不同场合的文字描述
  const mtxt = (m) => ({ voice: '（语音）', gift: '（礼物）', loc: '（定位）', req: '（请求查看位置）', pay: '（转账）', rp: '（红包）', img: '（图片）', timg: '（图片）', call: '（通话）' }[m.k] || '') + m.t;
  const pushX = (id, r, t, k, ex) => { pushMsg(id, r, t, Date.now(), null, k); const l = D().msgs[id]; Object.assign(l[l.length - 1], ex || {}); return l[l.length - 1]; };
  const grpMembers = (x) => (x.members || []).map(getC).filter(Boolean);
  const buildGroup = (x) => {
    const d = D(); const u = myNick(); const mem = grpMembers(x); const story = cfg.know && mem.some(knows) ? storyText(Number(cfg.ctxN) || 6, (Number(cfg.ctxN) || 6) * 800) : '';
    const cards = mem.map((m) => `【${m.name}】` + (m.isChar ? clip(charCard(), 500) : (m.persona || '普通人')) + (m.rel ? `（与${u}的关系：${m.rel}）` : '')).join('\n');
    const sys = [`你在扮演微信群聊「${x.name}」里的成员，群里还有用户「${u}」。成员设定：\n${cards}`,
      story ? `近期剧情（每位成员只使用自己亲身经历或知情的部分）：\n${story}` : '成员们不知道用户最近经历了什么，只根据聊天内容回应。',
dmCtxForGroup(mem, u),
      '根据聊天记录，让合适的1~3位成员发言（不必每人都说），每条消息一行，格式「成员名：内容」；不要旁白、动作描写和说明；口语化，像真人发微信；每条不超过40字；保持各自人设。'].join('\n\n');
    const hist = (d.msgs[x.id] || []).slice(-12).map((m) => (m.r === 'u' ? { role: 'user', content: u + '：' + m.t } : { role: 'assistant', content: ((getC(m.w) && cName(getC(m.w))) || '成员') + '：' + m.t }));
    if (!hist.length || hist[hist.length - 1].role !== 'user') hist.push({ role: 'user', content: '（请继续）' });
    return [{ role: 'system', content: sys }, ...hist];
  };
  const parseGroup = (x, out) => {
    const mem = grpMembers(x); const find = (n) => mem.find((m) => m.name === n || m.remark === n);
    const res = []; String(out || '').split(/\n+/).forEach((l) => { const m = l.trim().match(/^(.{1,20}?)\s*[:：]\s*([\s\S]+)$/); if (!m) return; const who = find(m[1].trim()); if (who) res.push({ w: who.id, t: m[2].trim().replace(/^["“「]+|["”」]+$/g, '') }); });
    return res.slice(0, 6);
  };
  const askReply = async (id, flag) => {
    if (busy[id]) return; const x = getC(id); if (!x) return;
    busy[id] = true; errs[id] = ''; renderMsgs();
    try {
      const seenIds = x.isGroup ? [] : (D().msgs[id] || []).filter((m) => m.r === 'u' && m.k === 'img' && !m.seen);
      const nmE = x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mkLines = (txt, fin) => { let t = String(txt || '').replace(/<think>[\s\S]*?<\/think>/g, ''); if (!fin && /<think>/.test(t)) return []; let a = t.split(/\n+/); if (!fin) a.pop(); return a.map((s0) => s0.trim().replace(/<[^<>\n]{1,20}>/g, '').replace(/^[^\s:：→]{1,12}\s*[→>＞]\s*[^\s:：]{1,12}\s*[:：]\s*/, '').trim().replace(new RegExp('^(?:' + nmE + '|' + (x.remark ? x.remark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '$^') + ')\\s*[:：]\\s*'), '').replace(/^["“「]+|["”」]+$/g, '').trim()).filter(Boolean).slice(0, 6); };
      const pend = [], pushedTxt = []; let pumpP = null, fed = 0;
      const watchingNow = () => winEl.classList.contains('on') && cur().p === 'chat' && cur().id === id;
      const pump = () => { if (pumpP) return; const pr = (async () => { while (pend.length) { const t = pend.shift(); pushMsg(id, 'c', t, Date.now()); if (watchingNow()) renderMsgs(); if (pend.length) await new Promise((rs) => setTimeout(rs, 700 + Math.random() * 500)); } })(); pumpP = pr; pr.then(() => { if (pumpP === pr) pumpP = null; }); };
      const stFeed = (txt) => { const ls = mkLines(txt, false); for (; fed < ls.length; fed++) { if (!/【定位】|【同意】/.test(ls[fed])) { const tt = ls[fed].replace(/【关注】\s*/g, '').trim(); if (tt) { pend.push(tt); pushedTxt.push(tt); } } } pump(); };
      let out; try { out = await callAPI(x.isGroup ? buildGroup(x) : buildChat(x, flag, true), x.isGroup ? { max: cfg.max, f: 'wx' } : { max: cfg.max, f: 'wx', onText: stFeed, mask: x.isChar || x.kr ? null : [uName(), nickFor(x)] }); } catch (e1) { if (!seenIds.length) throw e1; out = await callAPI(buildChat(x, flag, false), { max: cfg.max, f: 'wx', mask: x.isChar || x.kr ? null : [uName(), nickFor(x)] }); }
      seenIds.forEach((m) => { m.seen = 1; });
      if (x.isGroup) {
        const items = parseGroup(x, out); if (!items.length) throw new Error('没有成员回复，可再试一次');
        for (let i = 0; i < items.length; i++) { pushMsg(id, 'c', items[i].t, Date.now() + i, items[i].w); if (i < items.length - 1) { if (winEl.classList.contains('on') && cur().p === 'chat' && cur().id === id) renderMsgs(); await new Promise((rs) => setTimeout(rs, 700 + Math.random() * 500)); } } save();
        if (!(winEl.classList.contains('on') && cur().p === 'chat' && cur().id === id)) { x.unread = (x.unread || 0) + items.length; notify(x, items[0].t); }
        return;
      }
      out = fcTake(out, x); const lines = mkLines(out, true);
      let place = ''; let agree = false; let fol = false;
      for (let q = lines.length - 1; q >= 0; q--) { if (/【关注】/.test(lines[q])) { fol = true; lines[q] = lines[q].replace(/【关注】\s*/g, '').trim(); if (!lines[q]) { lines.splice(q, 1); continue; } } if (/^【定位】/.test(lines[q])) { place = lines[q].replace(/^【定位】\s*/, '').trim(); lines.splice(q, 1); } else if (/【同意】/.test(lines[q])) { agree = true; lines[q] = lines[q].replace(/【同意】\s*/g, '').trim(); if (!lines[q]) lines.splice(q, 1); } }
      if (!fol && x.pid && lines.some(claimsFollow)) fol = true; if (fol) followX(x);
      if (!lines.length && !place && !agree) throw new Error('对方没有回复内容');
      { const done = pushedTxt.slice(); lines.forEach((t) => { const k = done.indexOf(t); if (k >= 0) done.splice(k, 1); else pend.push(t); }); pump(); while (pumpP) await pumpP; }
      if (place) { pushMsg(id, 'c', place, Date.now() + 20, null, 'loc'); x.share = true; x.loc = { place, detail: '', ts: Date.now() }; pushEvent(`${cName(x)}同意向${myNick()}共享定位（${place}）`, true); lines.push('［已共享定位］' + place); }
      if (agree && x.live && !x.friend) { x.friend = true; { const dd = D(); const x2 = { id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 99), isChar: false, live: false, auto: true, name: x.name, remark: x.remark || '', rel: '直播认识', persona: x.persona, avatar: x.avatar || '', know: x.know || 'auto', dmOf: x.id, pid: x.pid, real: x.real || '' }; dd.contacts.push(x2); x.wx = x2.id; pushMsg(x2.id, 'c', `${cName(x)}已通过微信好友（对方主动添加了你）`, Date.now() + 30, null, 'sys'); } pushMsg(id, 'c', `${cName(x)}已通过微信好友（对方主动添加了你）`, Date.now() + 30, null, 'sys'); pushEvent(`${myNick()}在直播里认识的「${cName(x)}」与${myNick()}交换了微信，成为好友（${cName(getC('char'))}不一定知道；此人设定：${clip(x.persona, 50)}，之后正文里可以自然出现这个人）`); lines.push('已添加你为微信好友'); }
      save();
      const watching = winEl.classList.contains('on') && cur().p === 'chat' && cur().id === id;
      if (!watching) { x.unread = (x.unread || 0) + lines.length; notify(x, lines[0]); }
    } catch (e) { errs[id] = e.message || String(e); } finally { busy[id] = false; renderMsgs(); }
  };
  const regen = (id) => { const l = D().msgs[id] || []; let n = l.length; while (n > 0 && l[n - 1].r === 'c') n--; if (n === l.length) { tip('最后一条是你发的，点 ↻ 让TA回复'); return; } l.length = n; save(); renderMsgs(); askReply(id); };
  let imgPend = '';
  const sendMsg = (id, text) => { setTimeout(syncSend, 0); text = String(text || '').trim(); if (!text) return; { const rn = uName(); const cx = getC(id); if (cx && !cx.isChar && rn && rn !== '我' && text.includes(rn)) cx.kr = true; } pushMsg(id, 'u', text); save(); renderMsgs(); if (cfg.auto) autoWait(id); };
  const pushEvent = (t, kn) => { const d = D(); (d.events || (d.events = [])).push({ t, ts: Date.now(), ...(kn ? { kn: 1 } : {}) }); d.events = d.events.slice(-12); save(); };

  // ---------- 查手机（内容由 AI 现编，存下来，可刷新）----------
  const LUE = [['time', '时间', '开始时间，如11-12 23:40'], ['dur', '时长', '如12分钟'], ['tool', '工具', '用到的道具，没有写徒手'], ['fan', '想象', '当时想象的内容，一句话'], ['proc', '过程', '过程描写40~80字']];
  const SEC = {
    wechat: { n: '微信', ico: '💬', bg: '#07c160', ask: '生成4~5个{c}与不同人（不含{u}）的微信聊天，每个5~8条消息，聊天对象要符合{c}的身份与人际关系，并与近期剧情不矛盾', fmt: '{"chats":[{"name":"对方称呼","relation":"与{c}的关系","msgs":[{"from":"me或them","text":"内容"}]}]}' },
    wallet: { n: '钱包', ico: '💰', bg: '#f59e0b', ask: '生成钱包：余额和最近8笔收支，符合{c}的身份、消费习惯和近期剧情', fmt: '{"balance":"12345.67","items":[{"title":"商家或事由","amount":"-28.50或+3000","time":"11-13 09:20","note":"可选备注"}]}' },
    notes: { n: '备忘录', ico: '📝', bg: '#eab308', ask: '生成4条备忘录（待办、想法、心事、提醒等），反映{c}的性格与近期心态，与{u}有关的内容也可以有', fmt: '{"notes":[{"title":"标题","time":"11-12 23:10","text":"正文，可多行"}]}' },
    album: { n: '相册', ico: '🖼️', bg: '#6366f1', ask: '生成6张照片的文字描述（相册里的照片或截图），符合{c}的生活与近期剧情', fmt: '{"photos":[{"caption":"照片内容的具体描述","time":"11-10 18:32","place":"地点，可空"}]}' },
    calls: { n: '通话记录', ico: '📞', bg: '#10b981', ask: '生成最近8条通话记录，包含来电、去电、未接，对方要符合{c}的人际关系，也可以有{u}', fmt: '{"calls":[{"name":"对方","type":"来电或去电或未接","time":"11-13 20:05","dur":"3分12秒或空"}]}' },
  };
  SEC.lue = { n: '手记', ico: '♡', bg: '#111', ask: () => `生成{c}最近的4条自慰打卡记录，符合{c}的设定、性格与近期剧情（想象内容可涉及{u}），只写下面格式里列出的项`, fmt: () => '{"logs":[{' + LUE.filter(([k]) => cfg.lue[k] || k === 'time').map(([k, , h]) => `"${k}":"${h}"`).join(',') + '}]}' };
  SEC.video = { n: '♥\uFE0E视频', ico: '♥', bg: '#111', ask: '生成{c}偷偷看的5条成人向（18禁）视频记录，每条有文字标题和一两句内容简介，符合{c}的性癖口味与近期剧情，不要与剧情矛盾', fmt: () => '{"videos":[{"title":"视频标题","desc":"一两句内容","time":"观看时间，如11-12 23:40"' + (cfg.vid && cfg.vid.thought ? ',"thought":"角色看的时候心里的想法，第一人称，一两句"' : '') + '}]}' };
SEC.usage = { n: '使用记录', ico: '📊', bg: '#0ea5e9', max: 3200, ask: '生成{c}今天24小时的手机使用记录，包含每个小时的使用频率、使用分钟数、主要软件和在做什么。必须与近期剧情和当前场景一致：剧情里{c}与{u}在一起相处、聊天、亲热、开会、睡觉、工作的时段，手机使用频率要很低甚至为0；不要和剧情矛盾', fmt: '{"hours":[{"f":0到10的使用频率,"m":这个小时的使用分钟数,"a":"主要软件","d":"在做什么，没用手机写未使用"}共24项，依次是0点到23点],"apps":[{"name":"软件名","min":"全天分钟数"}],"note":"一句话概括今天的手机使用"}' };
  const ADULT = ['lue', 'video']; const secKeys = () => Object.keys(SEC).filter((k) => cfg.liveAdult !== 'off' || !ADULT.includes(k));
  // 容错：模型常在文本里写英文双引号/换行，导致 JSON 报错；这里自动修复
  const fixJSON = (t) => {
    let o = ''; let ins = false;
    for (let k = 0; k < t.length; k++) {
      const ch = t[k];
      if (!ins) { if (ch === '"') ins = true; o += ch; continue; }
      if (ch === '\\') { o += ch + (t[k + 1] || ''); k++; continue; }
      if (ch === '"') { let n = k + 1; while (n < t.length && /\s/.test(t[n])) n++; if (n >= t.length || ',:}]'.includes(t[n])) { ins = false; o += ch; } else o += '\\"'; continue; }
      if (ch === '\n') { o += '\\n'; continue; } if (ch === '\r' || ch === '\t') { o += ' '; continue; }
      o += ch;
    }
    if (ins) o += '"'; const st = []; let q = false;
    for (let k = 0; k < o.length; k++) { const ch = o[k]; if (q) { if (ch === '\\') k++; else if (ch === '"') q = false; } else if (ch === '"') q = true; else if (ch === '{' || ch === '[') st.push(ch === '{' ? '}' : ']'); else if (ch === '}' || ch === ']') st.pop(); }
    return o.replace(/,\s*$/, '') + st.reverse().join('');
  };
  const parseJSON = (s) => { s = String(s || '').replace(/```(?:json)?/gi, ''); const a = s.indexOf('{'); if (a < 0) throw new Error('返回内容不是 JSON，请重试'); const b = s.lastIndexOf('}'); const raw = s.slice(a, b > a ? b + 1 : s.length); try { return JSON.parse(raw); } catch (e) { try { return JSON.parse(fixJSON(s.slice(a))); } catch (e2) { throw new Error('返回内容格式有误，请重试（文本里别用英文引号）'); } } };
  const genBusy = {}; const genErr = {};
  const genCP = async (sec, silent) => {
    if (secLocked(sec)) { if (!silent) tip('手机被锁定，该软件无法生成'); return; }
    if (genBusy[sec]) return; genBusy[sec] = true; genErr[sec] = ''; render();
    try {
      const S = SEC[sec]; const c = cName(getC('char')); const u = myNick(); const d = D();
      const thread = (d.msgs.char || []).slice(-8).map((m) => (m.r === 'u' ? u : c) + '：' + m.t).join('\n');
      const rep = (s) => (typeof s === 'function' ? s() : s).replace(/\{c\}/g, c).replace(/\{u\}/g, u);
      const out = await callAPI([
        { role: 'system', content: `你要为角色「${c}」生成他手机里的内容，供用户翻看。内容要符合角色设定与剧情，细节具体、有生活感，不要与剧情矛盾。只输出 JSON，不要代码块和说明；文本里的对话用「」，不要出现英文双引号。` },
        { role: 'user', content: `角色设定：\n${charCard()}\n\n近期剧情：\n${storyText(Number(cfg.ctxN) || 6, 1800) || '（暂无）'}\n\n${u}与${c}最近的微信聊天：\n${thread || '（暂无）'}\n\n请生成【${S.n}】：${rep(S.ask)}${sec === 'usage' ? usageHint() : ''}\n输出格式：${rep(S.fmt)}` },
      ], { max: S.max || 1800, f: 'cp' });
      d.cp[sec] = { data: usageFix(parseJSON(out), sec), ts: Date.now() }; if (!silent) markViewed(sec); save();
    } catch (e) { genErr[sec] = e.message || String(e); } finally { genBusy[sec] = false; render(); }
  };
  const vBusy = {};
  const genThought = async (i) => {
    const d = D(); const v = d.cp.video && d.cp.video.data && (d.cp.video.data.videos || [])[i]; if (!v || vBusy[i]) return; vBusy[i] = true; render();
    try {
      const c = cName(getC('char')); const u = myNick();
      const out = await callAPI([{ role: 'system', content: `你是角色「${c}」，现在要写出你偷偷看某个视频时心里的想法，第一人称，一两句话，真实具体，符合你的设定与近期剧情（可涉及${u}）。只输出想法本身，不要引号和说明。` },
        { role: 'user', content: `角色设定：\n${charCard()}\n\n近期剧情：\n${storyText(3, 1500) || '（暂无）'}\n\n要求：想法要写成他看完后代入想象${myNick()}用类似的方式对待他，写出想象的画面，再写一点他想到之后身体的反应。\n视频标题：${v.title}\n内容：${v.desc || ''}` }], { max: 200, f: 'cp' });
      v.thought = String(out).trim().replace(/^["“「]+|["”」]+$/g, ''); save();
    } catch (e) { genErr.video = e.message || String(e); } finally { vBusy[i] = false; render(); }
  };
  // 一键生成/刷新：依次生成全部软件的内容（不算“翻看”，不会被当成你看过）
  let allBusy = null;
  const genAll = async () => {
    if (allBusy) return; const keys = secKeys(); allBusy = { i: 0, n: keys.length }; render(); let bad = 0;
    for (const k of keys) { allBusy.i++; render(); await genCP(k, true); if (genErr[k]) bad++; }
    allBusy = null; render();
    toast.innerHTML = '<b>查手机</b>' + (bad ? `已完成，${bad} 项失败，可单独进去重试` : '全部内容已生成'); toast.dataset.id = ''; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 4000);
  };
  const markViewed = (sec) => { if (cfg.ghost) return; const d = D(); if (!d.viewed.some((v) => v.sec === sec)) d.viewed.push({ sec, ts: Date.now() }); };
  const secSummary = (sec) => {
    const d = D(); const o = d.cp[sec] && d.cp[sec].data; if (!o) return '';
    try {
      if (sec === 'wechat') return '微信：与' + (o.chats || []).map((x) => x.name).join('、') + '的聊天';
      if (sec === 'wallet') return `钱包：余额${o.balance}，最近${(o.items || []).slice(0, 3).map((x) => x.title + x.amount).join('、')}`;
      if (sec === 'notes') return '备忘录：' + (o.notes || []).map((x) => '《' + x.title + '》' + clip(String(x.text).replace(/\s+/g, ' '), 20)).join('；');
      if (sec === 'album') return '相册：' + (o.photos || []).slice(0, 4).map((x) => clip(x.caption, 22)).join('；');
      if (sec === 'lue') return '手记：最近' + (o.logs || []).length + '次记录';
      if (sec === 'video') return '视频：' + (o.videos || []).slice(0, 3).map((x) => clip(x.title, 14)).join('；');
      if (sec === 'calls') return '通话：' + (o.calls || []).slice(0, 5).map((x) => x.name + x.type).join('、');
    } catch (e) { /* ignore */ }
    return '';
  };

  // ---------- 正文知道小手机里的事（发送前插入一条短系统消息）----------
  const buildSync = () => {
    if (!cfg.sync) return ''; const d = D(); const u = myNick(); const keep = Number(cfg.keepN) || 0; const parts = []; let callLong = 0;
    d.contacts.forEach((x) => {
      if (dmOnly(x) && !(cfg.lsync && cfg.lsDm !== false)) return;
      const all = d.msgs[x.id] || []; if (!all.length) return;
      let ms = all.filter((m) => m.ts > d.syncTs && !m.src && m.src !== 0);
      if (x.isChar && keep) { const k = all.filter((m) => !(m.src >= 0)).slice(-keep); ms = k.length > ms.length ? k : ms; }
      const shortDm = dmOnly(x) && all.length <= 20; ms = ms.filter((m) => m.k !== 'sys' && !(m.k === 'call' && m.cs === 'done')).slice(shortDm ? -3 : -8); if (!ms.length) return;
      parts.push((x.isGroup ? `${u}所在的群聊「${x.name}」` : `${u}与${cName(x)}${x.rel ? '（' + x.rel + '）' : ''}`) + '：\n' + ms.filter((m) => m.k !== 'sys').map((m) => (m.r === 'u' ? u : (x.isGroup && getC(m.w) ? cName(getC(m.w)) : cName(x))) + '：' + clip(mtxt(m), m.k === 'call' && m.ts > d.syncTs ? (callLong = 1, 300) : (dmOnly(x) && all.length <= 20 ? 30 : 60))).join('\n'));
    });
    const vs = d.viewed.filter((v) => v.ts > d.syncTs && (cfg.liveAdult !== 'off' || !ADULT.includes(v.sec))).map((v) => secSummary(v.sec)).filter(Boolean);
    if (vs.length) parts.push(`${u}刚翻看了${cName(getC('char'))}的手机：` + vs.map((s) => clip(s, 160)).join('；'));
    const evN = cfg.cpKnow === 'once' ? 1 : 3; let recent = ''; try { const ch = (getCtx().chat || []).filter((m) => m && !m.is_user && m.mes).slice(-2); recent = ch.map((m) => m.mes).join('\n'); } catch (er) { /* ignore */ }
    (d.events || []).forEach((e) => { if (e.n && !e.done) { const ks = [...String(e.t).matchAll(/「([^」]{2,})」/g)].map((q) => q[1].slice(0, 6)); if (ks.some((k) => recent.includes(k))) e.done = 1; } });
    const ne = (d.events || []).filter((e) => !e.done && (e.ts > d.syncTs || (e.n || 0) < evN)); const kn = ne.filter((e) => e.kn).map((e) => e.t); const evs = ne.filter((e) => !e.kn).map((e) => e.t);
    if (kn.length) parts.push('手机上发生、' + cName(getC('char')) + '知道的事：' + kn.join('；'));
    if (evs.length) parts.push('手机上的其他事：' + evs.join('；') + '（直播等私下行为，角色通常不知道，是否知道由你按剧情判断）');
    if (!parts.length) return '';
    ne.forEach((e) => { e.n = (e.n || 0) + 1; });
    return clip('【小手机】' + u + '的手机动态，仅作背景：是否反应由你按剧情和性格定，不必立刻回应、不要复述原文。\n' + parts.join('\n'), 650 + (callLong ? 280 : 0));
  };
  // 角色自己手机里的内容：角色本人清楚（含与别人的聊天），持续提示给正文，user只知道翻看过的
  const buildCp = () => {
    if (!cfg.cpKnow || cfg.cpKnow === 'off') return ''; const d = D(); const c = cName(getC('char')); const u = myNick(); const ps = [];
    secKeys().forEach((k) => {
      const o = d.cp[k] && d.cp[k].data; if (!o) return; if ((cfg.cpKnow === 'once' || cfg.cpKnow === 'n3') && !(d.cp[k].ts > d.syncTs)) return;
      try {
        if (k === 'wechat') ps.push('微信：' + (o.chats || []).slice(0, 5).map((x) => `${x.name}（${x.relation || ''}）` + (x.msgs || []).slice(-3).map((m) => (m.from === 'me' ? c : x.name) + '说' + clip(m.text, 22)).join('，')).join('；'));
        else if (k === 'wallet') ps.push(`钱包：余额${o.balance}，` + (o.items || []).slice(0, 2).map((x) => x.title + x.amount).join('、'));
        else if (k === 'notes') ps.push('备忘录：' + (o.notes || []).slice(0, 4).map((x) => '《' + x.title + '》' + clip(String(x.text).replace(/\s+/g, ' '), 14)).join('；'));
        else if (k === 'album') ps.push('相册：' + (o.photos || []).slice(0, 3).map((x) => clip(x.caption, 14)).join('；'));
        else if (k === 'calls') ps.push('通话：' + (o.calls || []).slice(0, 4).map((x) => x.name + x.type).join('、'));
        else if (k === 'lue') ps.push('手记：' + (o.logs || []).slice(0, 3).map((x) => [x.time, x.tool, x.fan && '想象' + clip(x.fan, 12)].filter(Boolean).join(' ')).join('；'));
        else if (k === 'video') ps.push('视频：' + (o.videos || []).slice(0, 3).map((x) => clip(x.title, 14)).join('；'));
      } catch (e) { /* ignore */ }
    });
    if (!ps.length) return '';
    return clip(`【${c}的手机】${c}自己清楚的手机内容（含和别人的聊天），${u}只知道翻看过的。仅作背景，相关时自然体现，不要复述：\n` + ps.join('\n'), 450);
  };
  const buildLive = () => {
    if (!cfg.lsync) return ''; const L = LV(); const N = Math.max(1, Number(cfg.lsN) || 1); let recent = ''; try { recent = (getCtx().chat || []).slice(-6).map((m) => (m && m.mes) || '').join('\n'); } catch (e) { /* ignore */ }
    if (!recent) return ''; const out = []; const seen = new Set();
    ['normal', 'r18', 'keep'].forEach((m) => (L.rooms[m] || []).forEach((r) => {
      const key = r.pid || r.name; const x = r.cid && getC(r.cid); const talked = !!(x && (x.friend || (D().msgs[x.id] || []).some((q) => q.r === 'u'))); if (!r.name || seen.has(key) || !(talked || recent.includes(r.name))) return; seen.add(key); const bits = []; const lg = (r.log || []).length > 30; const Nr = x && x.friend ? (cfg.cpKnow === 'once' ? 1 : 3) : N;
      const pf = r.pid && L.prof && L.prof[r.pid];
      if (cfg.lsPost !== false && pf) { const ps = (pf.posts || []).filter((q) => (q.n || 0) < Nr).slice(0, lg ? 3 : 1); ps.forEach((q) => { q.n = (q.n || 0) + 1; }); if (ps.length) bits.push('最新动态：' + ps.map((q) => clip(q.t, lg ? 40 : 24)).join('；')); }
      if (cfg.lsRoom && r.log && r.log.length > (r.sl || 0)) { const k = r.log.filter((q) => q.k === 'c' || q.k === 's').slice(lg ? -2 : -1).map((q) => clip(q.t, lg ? 40 : 26)); if (k.length) { bits.push('直播间：' + k.join('；')); r.sn = (r.sn || 0) + 1; if (r.sn >= Nr) { r.sl = r.log.length; r.sn = 0; } } }
      if (bits.length) out.push(r.name + '：' + bits.join('；'));
    }));
    if (!out.length) return ''; save();
    return clip('【直播】主播近况，仅作背景，不必复述：\n' + out.join('\n'), 240);
  };
  const buildUp = () => { if (!cfg.upSync) return ''; const L = LV(); const ps = (L.me && L.me.posts) || []; const N = Math.max(1, Number(cfg.lsN) || 1); const a = ps.filter((p) => (p.n || 0) < N).slice(0, 2); if (!a.length) return ''; a.forEach((p) => { p.n = (p.n || 0) + 1; }); save(); return clip('【直播软件】' + lvNick() + '发了动态：' + a.map((p) => '「' + clip(p.t, 40) + '」' + ((p.cm || []).length ? '，评论：' + p.cm.slice(0, 3).map((q) => q.w + '：' + clip(q.t, 14)).join('；') : '')).join('；'), 200); };
  const MARK_RE = /<手机>[\s\S]*?<\/手机>/g;
  const onReady = (data) => {
    try {
      if (!data || !Array.isArray(data.chat)) return;
      data.chat.forEach((m) => { if (m && typeof m.content === 'string' && m.content.includes('<手机>')) m.content = m.content.replace(MARK_RE, '').trim(); });
      if (data.dryRun) return;
      try { batScan(); } catch (e) {} const t = [buildBat(), buildUse(), buildSync(), fcRule(), buildCp(), buildLive(), buildUp(), buildNpc(), buildLock(), hintText()].filter(Boolean).join('\n'); if (!t) return; if (data.chat.some((m) => m && m.content === t)) return;
      data.chat.splice(Math.max(0, data.chat.length - 2), 0, { role: 'system', content: t });
    } catch (e) { console.warn('[st-phone]', e); }
  };
  const hintText = () => {
    if (!D().used && !Object.values(D().msgs || {}).some((q) => q && q.length)) return '';
    const a = []; const addS = cfg.addC === 'story' || cfg.addC === 'both';
    if (cfg.story) a.push(`${uName()}或其他人用手机发了消息时，写「发送人→接收人：消息原文」`);
    if (addS) a.push(`出现了通讯录里没有的、有名字的新人物时，写「+联系人 名字｜身份与关系」（已有：${clip(D().contacts.filter((x) => !x.isGroup && wxOk(x)).map((x) => x.name).join('、'), 60)}）`);
    return a.length ? `【手机】回复末尾可另起一行写<手机>…</手机>，里面${a.join('；')}，多条各占一行；没有就不写。` : '';
  };
  const npcOn = () => cfg.addC === 'npc' || cfg.addC === 'both';
  const buildNpc = () => { if (!npcOn()) return ''; const a = D().contacts.filter((x) => x.npc); if (!a.length) return ''; return clip('【手机通讯录NPC】' + a.map((x) => `${x.name}（${clip(x.rel, 10)}）`).join('、') + '。后文可自然出现，不必强行安排。', 170); };
  let npcBusy = false;
  const genNpc = async (manual) => {
    if (npcBusy) return; npcBusy = true; if (manual) render();
    try {
      const d = D(); const c = cName(getC('char')); const u = myNick(); const names = d.contacts.map((x) => x.name).join('、');
      const out = await callAPI([{ role: 'system', content: '你为角色扮演故事随机创建一个新的NPC（路人以外有一定戏份的人物），符合世界观与近期剧情，不要和已有人物重名。只输出JSON，不要代码块和说明。' },
        { role: 'user', content: `角色设定：\n${charCard()}\n\n近期剧情：\n${storyText(3, 1500) || '（暂无）'}\n\n已有人物：${names}\n\n请随机生成1个NPC，格式：{"name":"姓名","rel":"与${c}或${u}的关系，6字内","persona":"身份、性格、说话方式，50字内"}` }], { max: 300, f: 'wx' });
      const o = parseJSON(out); const nm = String(o.name || '').trim(); if (!nm || d.contacts.some((x) => x.name === nm)) throw new Error('生成的NPC重名或为空，请再试');
      const x = { id: 'n' + Date.now().toString(36), isChar: false, npc: true, auto: true, name: nm, remark: '', rel: String(o.rel || '').trim(), persona: String(o.persona || '').trim(), avatar: '', know: 'auto' };
      d.contacts.push(x); save(); notify(x, '新联系人：' + clip(x.rel + ' ' + x.persona, 24));
    } catch (e) { if (manual) { toast.innerHTML = '<b>NPC</b>' + esc(e.message || e); toast.dataset.id = ''; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 5000); } } finally { npcBusy = false; if (winEl.classList.contains('on')) render(); }
  };
  const addAuto = (name, desc) => {
    const d = D(); name = String(name || '').trim(); if (!name || name === uName() || name === myNick()) return null;
    if (d.contacts.some((x) => x.name === name || x.remark === name || (x.isChar && (x.name.includes(name) || name.includes(x.name))))) return null;
    const x = { id: 'n' + Date.now().toString(36) + Math.floor(Math.random() * 99), isChar: false, auto: true, name, remark: '', rel: clip(String(desc || '').split(/[，,。]/)[0], 12), persona: String(desc || '').trim(), avatar: '', know: 'auto' };
    d.contacts.push(x); return x;
  };
  // 正文里写到的发消息：回复末尾的 <手机>发送人→接收人：内容</手机>，生成完自动进小手机
  const parseMarks = (text) => {
    const out = [];
    [...String(text || '').matchAll(/<手机>([\s\S]*?)<\/手机>/g)].forEach((b) => b[1].split(/\n+/).forEach((line) => {
      const ad = line.trim().match(/^\+\s*联系人\s*(.{1,20}?)\s*[｜|]\s*(.+)$/); if (ad) { out.push({ add: 1, name: ad[1], desc: ad[2] }); return; }
      const m = line.trim().match(/^(.{1,20}?)\s*(?:→|—>|->|＞|>)\s*(.{1,20}?)\s*[:：]\s*([\s\S]+)$/);
      if (m) out.push({ from: m[1].trim(), to: m[2].trim(), text: m[3].trim().replace(/^["“「]+|["”」]+$/g, '') });
    }));
    return out;
  };
  const isUserName = (n) => n === uName() || n === myNick() || /^(我|用户|user|\{\{user\}\})$/i.test(n);
  const findContact = (n) => D().contacts.find((x) => x.name === n || x.remark === n) || null;
  const ingest = (mid) => {
    const c = getCtx(); const chat = (c && c.chat) || []; const i = typeof mid === 'number' && chat[mid] ? mid : chat.length - 1; const m = chat[i];
    if (!m || m.is_user) return; const d = D();
    Object.keys(d.msgs).forEach((k) => { d.msgs[k] = d.msgs[k].filter((x) => x.src !== i); });
    const items = parseMarks(m.mes); const fresh = [];
    items.forEach((it, j) => {
      if (it.add) { const nx = addAuto(it.name, it.desc); if (nx) fresh.push({ x: nx, t: '新联系人：' + clip(it.desc, 24) }); return; }
      let other; let mine;
      if (isUserName(it.from)) { other = it.to; mine = true; } else if (isUserName(it.to)) { other = it.from; mine = false; } else return;
      let x = findContact(other);
      if (!x) { x = { id: 'n' + Date.now().toString(36) + j, isChar: false, name: other, remark: '', rel: '', persona: '', avatar: '', know: 'auto', auto: true }; d.contacts.push(x); }
      (d.msgs[x.id] || (d.msgs[x.id] = [])).push({ r: mine ? 'u' : 'c', t: it.text, ts: Date.now() + j, src: i });
      if (!mine) { x.unread = (x.unread || 0) + 1; fresh.push({ x, t: it.text }); }
    });
    save(); fresh.forEach((f) => notify(f.x, f.t)); if (winEl.classList.contains('on')) render();
  };
  const hideMarks = (all) => {
    try {
      const els = [...doc.querySelectorAll('#chat .mes_text')]; (all ? els : els.slice(-3)).forEach((el) => {
        if (!el.textContent.includes('手机')) return; const h = el.innerHTML; if (!/(?:&lt;|<)手机(?:&gt;|>)/.test(h)) return;
        const BODY = '(?:&lt;|<)手机(?:&gt;|>)[\\s\\S]*?(?:&lt;|<)\\/手机(?:&gt;|>)';
        const n = h.replace(new RegExp('<p>\\s*' + BODY + '\\s*</p>', 'g'), '').replace(new RegExp(BODY, 'g'), ''); if (n !== h) el.innerHTML = n;
      });
    } catch (e) { /* ignore */ }
  };
  const onReceived = (mid) => { try { fcScan(mid); } catch (e) {  } try { ingest(mid); } catch (e) { console.warn('[st-phone]', e); } syncDone(); try { const d = D(); d.npcN = (d.npcN || 0) + 1; if (npcOn() && cfg.url.trim() && d.npcN % 6 === 0 && d.contacts.filter((x) => x.npc).length < 5) genNpc(false); } catch (e) { /* ignore */ } };
  const syncDone = () => { try { const d = D(); d.syncTs = Date.now(); d.viewed = []; save(); } catch (e) { /* ignore */ } };

  // ---------- 界面 ----------
  const CSS = `
#${ROOT_ID}{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#111}
#${ROOT_ID} *{box-sizing:border-box}
.xyp-fab{position:fixed;width:42px;height:42px;border-radius:13px;background:linear-gradient(145deg,#343946,#14161c);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.22);user-select:none;touch-action:none;z-index:9991;transition:transform .18s ease}
.xyp-fab svg{display:block;pointer-events:none}.xyp-fab:active{transform:scale(.92)}
@media (hover:hover){.xyp-fab:hover{transform:translateY(-2px)}}
.xyp-fab.has-new{animation:xypring 2.2s ease-out infinite}@keyframes xypring{0%{box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.16),0 0 0 0 rgba(250,81,81,.55)}100%{box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.16),0 0 0 13px rgba(250,81,81,0)}}
.xyp-fab.th-bw,.xyp-fab.th-night,.xyp-fab.th-clr{border-radius:0;background:#fff;color:#111;box-shadow:3px 3px 0 #111;border:1px solid #111;transition:transform .1s,box-shadow .1s}
.xyp-fab.th-night{background:#0a0a0a;color:#e9e9e9;border-color:#e9e9e9;box-shadow:3px 3px 0 #e9e9e9}
.xyp-fab.th-bw:active,.xyp-fab.th-night:active,.xyp-fab.th-clr:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #111}.xyp-fab.th-night:active{box-shadow:1px 1px 0 #e9e9e9}
.xyp-fab.th-bw.has-new,.xyp-fab.th-night.has-new,.xyp-fab.th-clr.has-new{animation:none}
.xyp-fab.th-bw.has-new::after,.xyp-fab.th-night.has-new::after,.xyp-fab.th-clr.has-new::after{border-radius:50%;background:#fa5151;border:1px solid #fff}.xyp-fab.th-night.has-new::after{background:#fa5151;border-color:#0a0a0a}
@media (prefers-reduced-motion:reduce){.xyp-fab{animation:none!important;transition:none!important}}
.xyp-apiw{position:fixed;z-index:9993;font:13px/1.5 'Noto Sans SC',system-ui,sans-serif;color:#111}.xyp-apiw .aw-pill{display:flex;align-items:center;gap:7px;height:30px;padding:0 11px;background:#fff;border:1px solid #111;box-shadow:3px 3px 0 #111;cursor:pointer;user-select:none;touch-action:none;font-size:12px;letter-spacing:.04em;white-space:nowrap}.xyp-apiw .aw-pill i{width:7px;height:7px;background:#111;display:block}.xyp-apiw .aw-pill:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #111}.xyp-apiw .aw-panel{position:absolute;width:268px;max-width:calc(100vw - 16px);max-height:70vh;overflow:auto;background:#fff;border:1px solid #111;box-shadow:4px 4px 0 #111;padding:10px 12px 12px;box-sizing:border-box}.xyp-apiw .aw-h{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #111;padding-bottom:7px;margin-bottom:6px}.xyp-apiw .aw-h span{cursor:pointer;padding:0 4px}.xyp-apiw .aw-s{font-size:11px;letter-spacing:.2em;color:#777;margin:10px 0 4px}.xyp-apiw label{display:block;font-size:11px;color:#555;margin-top:6px}.xyp-apiw input{width:100%;box-sizing:border-box;border:1px solid #111;border-radius:0;background:#fff;color:#111;padding:6px 8px;font-size:13px;outline:none}.xyp-apiw input:focus{box-shadow:2px 2px 0 #111}.xyp-apiw .aw-r{display:flex;gap:8px;align-items:center;margin-top:8px}.xyp-apiw .aw-r input{flex:1;min-width:0}.xyp-apiw .aw-b{flex:none;border:1px solid #111;background:#111;color:#fff;padding:5px 10px;font-size:12px;cursor:pointer;user-select:none}.xyp-apiw .aw-b:active{background:#fff;color:#111}.xyp-apiw .aw-m{font-size:12px;color:#555;word-break:break-all}.xyp-apiw .aw-i{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #ccc;padding:6px 8px;margin-top:6px;cursor:pointer}.xyp-apiw .aw-i b{display:block;font-size:13px}.xyp-apiw .aw-i small{display:block;font-size:11px;color:#777;word-break:break-all}.xyp-apiw .aw-i.on{border-color:#111;background:#111;color:#fff}.xyp-apiw .aw-i.on small{color:#bbb}.xyp-apiw .aw-i span{padding:2px 6px;color:inherit;opacity:.7}.xyp-apiw.th-night{color:#e9e9e9}.xyp-apiw.th-night :is(.aw-pill,.aw-panel){background:#0a0a0a;border-color:#e9e9e9;box-shadow:3px 3px 0 #e9e9e9;color:#e9e9e9}.xyp-apiw.th-night .aw-pill i{background:#e9e9e9}.xyp-apiw.th-night .aw-h{border-color:#e9e9e9}.xyp-apiw.th-night input{background:#0a0a0a;color:#e9e9e9;border-color:#e9e9e9}.xyp-apiw.th-night .aw-b{background:#e9e9e9;color:#0a0a0a;border-color:#e9e9e9}.xyp-apiw.th-night .aw-i{border-color:#444}.xyp-apiw.th-night .aw-i.on{background:#e9e9e9;color:#0a0a0a;border-color:#e9e9e9}.xyp-apiw.th-night .aw-i.on small{color:#555}.xyp-apiw .aw-b.aw-x{background:#fff;color:#111}.xyp-apiw .aw-panel{width:244px;padding:7px 9px 9px;font-size:12px}.xyp-apiw .aw-h{padding-bottom:5px;margin-bottom:2px}.xyp-apiw .aw-f{display:flex;align-items:center;gap:6px;margin-top:5px}.xyp-apiw .aw-f label{flex:none;width:28px;margin:0;font-size:12px;color:#555}.xyp-apiw .aw-f input{flex:1;min-width:0}.xyp-apiw input{padding:4px 6px;font-size:12px}.xyp-apiw .aw-r{margin-top:7px}.xyp-apiw .aw-b{padding:4px 9px}.xyp-apiw .aw-m{font-size:11px;min-height:0;margin-top:3px}.aw-ml{max-height:30vh;overflow-y:auto;margin:4px 0}.aw-mi{padding:6px 4px;border-bottom:1px solid rgba(128,128,128,.25);font-size:12px;cursor:pointer;word-break:break-all}.xyp-apiw .aw-m:empty{display:none}.xyp-apiw .aw-s{margin:8px 0 2px;letter-spacing:.12em}.xyp-apiw .aw-i{padding:4px 7px;margin-top:4px}.xyp-apiw .aw-i b{font-size:12px}.xyp-apiw .aw-i small{font-size:10px}.xyp-apiw .aw-pill{height:24px;padding:0 8px;gap:5px;font-size:11px;box-shadow:2px 2px 0 #111;max-width:96px}.xyp-apiw .aw-pill i{width:6px;height:6px}.xyp-apiw .aw-pill span{overflow:hidden;text-overflow:ellipsis}.xyp-apiw .aw-i{display:flex;align-items:center;padding:3px 7px;margin-top:3px}.xyp-apiw .aw-i>div{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.xyp-apiw .aw-i b,.xyp-apiw .aw-i small{display:inline;font-size:12px}.xyp-apiw .aw-i small{font-size:10px;margin-left:4px}.xyp-apiw .aw-i span{padding:0 4px}.xyp-apiw .aw-panel{width:232px}
.xyp-win{position:fixed;width:380px;height:690px;max-height:94vh;background:#ededed;border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;z-index:9992;border:1px solid #cfcfcf}
.xyp-win.on{display:flex}
.xyp-bar{height:46px;flex:none;display:grid;grid-template-columns:48px 1fr 36px 40px 48px;align-items:center;background:#f7f7f7;border-bottom:1px solid #dcdcdc;cursor:grab;touch-action:none;user-select:none}
.xyp-bar b{text-align:center;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xyp-bar span{font-size:20px;line-height:46px;text-align:center;cursor:pointer;color:#333}
.xyp-bar span.r{font-size:14px}
.xyp-scr{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;position:relative}
.xyp-pg{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
.xyp-home{padding:26px 20px}
.xyp-clock{text-align:center;font-size:44px;font-weight:300;margin:24px 0 36px;letter-spacing:2px}
.xyp-apps{display:grid;grid-template-columns:repeat(4,1fr);gap:20px 8px}
.xyp-app{text-align:center;cursor:pointer;touch-action:pan-y;-webkit-touch-callout:none;user-select:none}.xyp-app.drag{position:relative;z-index:6;transition:none!important;filter:drop-shadow(0 8px 10px rgba(0,0,0,.3));cursor:grabbing}
.xyp-app i{display:flex;width:54px;height:54px;margin:0 auto 6px;border-radius:14px;align-items:center;justify-content:center;font-size:26px;font-style:normal;color:#fff}
.xyp-app b{font-size:12px;font-weight:500}
.xyp-tabs{flex:none;display:grid;grid-template-columns:repeat(4,1fr);background:#f7f7f7;border-top:1px solid #dcdcdc}
.xyp-tabs div{padding:9px 0 8px;text-align:center;font-size:12px;color:#777;cursor:pointer}
.xyp-tabs div.on{color:#07c160;font-weight:600}
.xyp-li{display:flex;align-items:center;gap:12px;padding:11px 14px;background:#fff;border-bottom:1px solid #f0f0f0;cursor:pointer}
.xyp-li .m{flex:1;min-width:0}
.xyp-li .m b{display:block;font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xyp-li .m small{display:block;font-size:12px;color:#888;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xyp-li .t{font-size:11px;color:#aaa;align-self:flex-start;margin-top:4px}
.xyp-av{width:42px;height:42px;border-radius:6px;object-fit:cover;flex:none;display:block}
.xyp-avt{display:flex;align-items:center;justify-content:center;background:#c8ccd2;color:#fff;font-size:18px;font-weight:600}
.xyp-av.sm{width:34px;height:34px;font-size:15px}
.xyp-av.lg{width:72px;height:72px;font-size:28px;border-radius:10px}
.xyp-msgs{flex:1;min-height:0;overflow-y:auto;padding:12px 10px;-webkit-overflow-scrolling:touch}
.xyp-row{display:flex;gap:8px;margin:10px 0;align-items:flex-start}
.xyp-row.me{flex-direction:row-reverse}
.xyp-bub{max-width:68%;padding:9px 12px;border-radius:8px;font-size:15px;line-height:1.5;background:#fff;word-break:break-word;white-space:pre-wrap;position:relative}
.xyp-row.me .xyp-bub{background:#95ec69}
.xyp-gw{max-width:68%}.xyp-gw .xyp-bub{max-width:100%}.xyp-who{font-size:11px;color:#888;margin:0 0 3px 2px}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-who{color:var(--sub)}
.xyp-time{text-align:center;font-size:11px;color:#aaa;margin:8px 0}
.xyp-sys{text-align:center;font-size:12px;color:#b45309;margin:8px 14px}
.xyp-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#999;animation:xypd 1s infinite}
.xyp-dots span:nth-child(2){animation-delay:.2s}.xyp-dots span:nth-child(3){animation-delay:.4s}
@keyframes xypd{0%,80%,100%{opacity:.25}40%{opacity:1}}
.xyp-chead{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 14px;font-size:12px;color:#666;background:#f7f7f7;border-bottom:1px solid #e5e5e5;cursor:pointer}.xyp-chead b{font-weight:500;color:#07c160;white-space:nowrap}.xyp-chead span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-chead{background:var(--bg);color:var(--sub);border-bottom:1px solid var(--line);letter-spacing:.08em}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-chead b{color:var(--k)}
.xyp-comp{flex:none;display:flex;gap:6px;align-items:flex-end;padding:8px;background:#f7f7f7;border-top:1px solid #dcdcdc}
.xyp-comp textarea{flex:1;min-height:36px;max-height:110px;resize:none;border:0;border-radius:6px;padding:8px 10px;font:inherit;font-size:15px;outline:none;background:#fff}
.xyp-comp button,.xyp-btn{border:0;border-radius:6px;padding:0 12px;height:36px;background:#fff;font-size:14px;cursor:pointer;color:#111}
.xyp-comp button.pri,.xyp-btn.pri{background:#07c160;color:#fff}
.xyp-btn{display:inline-block;line-height:36px;margin:4px 6px 4px 0}
.xyp-btn.dng{background:#fa5151;color:#fff}
.xyp-form{padding:12px 0 30px}
.xyp-f{background:#fff;padding:10px 14px;border-bottom:1px solid #f0f0f0;display:flex;gap:10px;align-items:flex-start}
.xyp-f label{width:72px;flex:none;font-size:14px;color:#555;padding-top:6px}
.xyp-f input,.xyp-f textarea,.xyp-f select{flex:1;min-width:0;border:0;border-bottom:1px solid #e5e5e5;padding:6px 2px;font:inherit;font-size:14px;outline:none;background:transparent}
.xyp-f textarea{min-height:74px;resize:vertical;border:1px solid #e5e5e5;padding:6px}
.xyp-h{padding:14px 14px 6px;font-size:12px;color:#888}
.xyp-sqb{position:sticky;top:0;z-index:5;padding:8px 14px;background:var(--bg,#fff);border-bottom:1px solid rgba(128,128,128,.25)}.xyp-sqb input{width:100%;box-sizing:border-box;padding:7px 10px;font-size:14px}.xyp-sqh{display:none!important}.xyp-sqn{padding:24px;text-align:center;font-size:13px;opacity:.6}
.xyp-tip{padding:6px 14px;font-size:12px;color:#888;line-height:1.5}
.xyp-center{text-align:center;padding:14px}
.xyp-chips{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:10px 14px 2px;font-size:12px;color:#666}.xyp-chips label{display:flex;align-items:center;gap:3px;cursor:pointer}.xyp-chips span{width:100%;font-size:11px;color:#999}
.xyp-card{background:#fff;margin:8px 10px;border-radius:8px;padding:11px 13px}
.xyp-card summary{cursor:pointer;font-size:14px;font-weight:600;list-style:none}
.xyp-card .tx{white-space:pre-wrap;font-size:14px;line-height:1.6;margin-top:8px;color:#333}
.xyp-card small{display:block;color:#999;font-size:11px;margin-top:3px}
.xyp-bal{background:#fff;margin:10px;border-radius:8px;padding:18px;text-align:center}
.xyp-bal b{display:block;font-size:32px;font-weight:600;margin-top:6px}
.xyp-bal.out,.amt.out{color:#111}.amt.in{color:#fa9d3b}
.xyp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 10px}
.xyp-ph{background:#fff;border-radius:8px;overflow:hidden;font-size:12px}
.xyp-ph div.pic{height:96px;background:linear-gradient(135deg,#d9dde3,#b8bec8);display:flex;align-items:center;justify-content:center;font-size:30px;color:#fff}
.xyp-ph p{margin:0;padding:8px 9px;line-height:1.5;color:#333}.xyp-ph small{display:block;color:#999;font-size:11px;margin-top:3px}
.xyp-call{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#fff;border-bottom:1px solid #f0f0f0;font-size:15px}
.xyp-call.miss b{color:#fa5151}.xyp-call small{display:block;font-size:12px;color:#999;margin-top:3px}
.xyp-tog{display:flex;justify-content:space-between;align-items:center;gap:10px}
.xyp-tog input{flex:none;width:20px;height:20px}

.xyp-win:is(.th-bw,.th-night,.th-clr){--bg:#fff;--bg2:#f4f4f1;--k:#111;--sub:#7b7b76;--line:#dddcd8;background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:4px;box-shadow:8px 8px 0 rgba(0,0,0,.14);font-family:'Noto Serif SC','Source Han Serif SC','Noto Serif CJK SC','Songti SC','STSong',serif}
.xyp-win.th-night{--bg:#0e0e0e;--bg2:#191919;--k:#ececea;--sub:#8b8b86;--line:#2d2d2b;box-shadow:8px 8px 0 rgba(255,255,255,.07)}
.xyp-win.th-clr{--bg:#f8f5ee;--bg2:#efe9dc;--k:#1d3b34;--sub:#6f7f78;--line:#cfd6cd;box-shadow:8px 8px 0 rgba(29,59,52,.16)}
.xyp-fab.th-clr{background:#f8f5ee;color:#1d3b34;border-color:#1d3b34;box-shadow:3px 3px 0 #1d3b34}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bar{background:var(--bg);border-bottom:1px solid var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bar b{font-weight:600;letter-spacing:.32em;font-size:14px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bar span{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-scr,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-pg,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-msgs{background:var(--bg);color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-clock{font-weight:200;font-size:58px;letter-spacing:.14em;margin:18px 0 34px;padding-bottom:22px;border-bottom:1px solid var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-apps{gap:26px 8px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app i{background:transparent!important;border:1px solid var(--k);border-radius:2px;font-size:0;color:var(--k);transition:background .15s,color .15s}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app i::before{font-size:22px;font-weight:600;font-family:inherit}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app:hover i{background:var(--k)!important;color:var(--bg)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-apps.dragging .xyp-app:not(.drag):hover i{background:transparent!important;color:var(--k)}
.xyp-apps.dragging .xyp-app:not(.drag){pointer-events:none}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app b{font-size:11px;font-weight:500;letter-spacing:.22em;margin-left:.22em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=wx] i::before,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=wechat] i::before{content:'微'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=cp] i::before{content:'查'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=settings] i::before{content:'设'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=live] i::before{content:'播'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=mywal] i::before{content:'钱'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=loc] i::before{content:'位'}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=shop] i::before{content:'购'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=theme] i::before{content:'美'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=wallet] i::before{content:'钱'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=notes] i::before{content:'记'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=album] i::before{content:'影'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=calls] i::before{content:'话'}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=usage] i::before{content:'用'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=__all] i::before{content:'↻'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=plock] i::before{content:'锁'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=lue] i::before{content:'♡'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-sec=video] i::before{content:'♥'}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-tabs{background:var(--bg);border-top:1px solid var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-tabs div{color:var(--sub);letter-spacing:.22em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-tabs div.on{color:var(--k);font-weight:700;box-shadow:inset 0 -2px 0 var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-li{background:var(--bg);border-bottom:1px solid var(--line)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-li:hover{background:var(--bg2)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-li .m small,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-li .t{color:var(--sub)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-av{border-radius:2px;border:1px solid var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-avt{background:var(--bg2);color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bub{background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0;line-height:1.7}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-row.me .xyp-bub{background:var(--k);color:var(--bg)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-time{color:var(--sub);letter-spacing:.18em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-sys{color:var(--k);border-top:1px dashed var(--k);border-bottom:1px dashed var(--k);padding:6px 0}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dots span{background:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-comp{background:var(--bg);border-top:1px solid var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-comp textarea{background:var(--bg);color:var(--k);border:1px solid var(--line);border-radius:0;font-family:inherit}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-comp button,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-btn{background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0;letter-spacing:.1em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-comp button.pri,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-btn.pri{background:var(--k);color:var(--bg)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-btn.dng{background:var(--bg);color:var(--k);border-style:dashed}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f{background:var(--bg);border-bottom:1px solid var(--line)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f label,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-h,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-tip{color:var(--sub)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-h{letter-spacing:.22em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f input,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f select,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f textarea{color:var(--k);font-family:inherit;border-color:var(--line)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-f select option{background:var(--bg);color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]{accent-color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-card{background:var(--bg);border:1px solid var(--k);border-radius:0}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-card .tx{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-card small,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-call small,.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ph small{color:var(--sub)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bal{background:var(--bg);border:1px solid var(--k);border-radius:0;letter-spacing:.2em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bal b{font-weight:300;letter-spacing:.06em}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-call{background:var(--bg);border-bottom:1px solid var(--line)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .amt.in{color:var(--k);font-weight:700}.xyp-win:is(.th-bw,.th-night,.th-clr) .amt.out{color:var(--sub)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-call.miss{box-shadow:inset 3px 0 0 var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-call.miss b{color:var(--k);text-decoration:underline}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ph{background:var(--bg);border:1px solid var(--k);border-radius:0}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ph p{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ph div.pic{background:repeating-linear-gradient(135deg,var(--bg2) 0 6px,var(--bg) 6px 12px);border-bottom:1px solid var(--k);color:var(--k);font-size:0}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ph div.pic::before{content:'PHOTO';font-size:10px;letter-spacing:.35em}
.xyp-th{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border-bottom:1px solid #f0f0f0;cursor:pointer}
.xyp-th .sw{display:flex;width:46px;height:34px;border:1px solid #999;flex:none;overflow:hidden}.xyp-th .sw i{flex:1}
.xyp-th .m{flex:1;min-width:0}.xyp-th .m b{display:block;font-size:15px;font-weight:500}.xyp-th .m small{display:block;color:#888;font-size:12px;margin-top:3px}
.xyp-th .ck{font-size:18px;color:#07c160;width:20px;text-align:center}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-th{background:var(--bg);border-bottom:1px solid var(--line)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-th .m small{color:var(--sub)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-th .ck{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-th .sw{border-color:var(--k)}
.xyp-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;color:#555;padding:0 14px 10px}
.xyp-nav{flex:none;display:flex;justify-content:center;gap:70px;padding:8px 0 calc(8px + env(safe-area-inset-bottom,0px));background:#f7f7f7;border-top:1px solid #dcdcdc;user-select:none}
.xyp-nav span{font-size:17px;color:#555;cursor:pointer;width:46px;text-align:center;line-height:22px}.xyp-nav span:active{opacity:.5}
.xyp-bdg{display:inline-block;min-width:16px;height:16px;line-height:16px;border-radius:8px;background:#fa5151;color:#fff;font-size:11px;font-weight:500;text-align:center;margin-left:6px;padding:0 4px;vertical-align:1px}
.xyp-fab.has-new::after{content:'';position:absolute;top:1px;right:1px;width:11px;height:11px;border-radius:50%;background:#fa5151;border:2px solid #fff}
.xyp-toast{position:fixed;z-index:9993;max-width:240px;padding:9px 12px;border-radius:8px;background:#fff;color:#111;box-shadow:0 4px 18px rgba(0,0,0,.28);font-size:13px;line-height:1.5;cursor:pointer;display:none;border:1px solid #e3e3e3}
.xyp-toast.on{display:block}.xyp-toast b{display:block;font-size:12px;color:#07c160;margin-bottom:2px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-nav{background:var(--bg);border-top:1px solid var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-nav span{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bdg{background:#fa5151;color:#fff;border-radius:8px}
.xyp-rhead{position:relative}.xyp-rk{position:absolute;right:8px;bottom:4px;font-size:11px;line-height:1;padding:4px 8px;border:1px solid var(--line,#bbb);border-radius:3px;background:var(--bg,#fff);color:var(--k,#111);cursor:pointer;z-index:2}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-rk{border-color:var(--k);border-radius:0}.xyp-tg{display:inline-block;font-size:10px;font-weight:400;padding:0 5px;margin-left:6px;border:1px solid var(--line,#bbb);color:var(--sub,#888);vertical-align:1px;border-radius:2px;letter-spacing:0}.xyp-app{position:relative}.xyp-app .xyp-dot{position:absolute;top:-3px;left:calc(50% + 13px);width:12px;height:12px;border-radius:50%;background:#fa5151;border:2px solid #fff;box-sizing:content-box;pointer-events:none}.xyp-tabs .xyp-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#fa5151;margin-left:3px;vertical-align:5px}.xyp-dmfab.has-new::after{content:'';position:absolute;top:0;right:0;width:10px;height:10px;border-radius:50%;background:#fa5151;border:2px solid #fff}
@media (max-width:600px){.xyp-win:not(.mini){left:0!important;top:0!important;width:100vw;height:100vh;height:100dvh;max-height:none;border-radius:0;border:0}.xyp-win:not(.mini) .xyp-bar{cursor:default}}
.xyp-lc{display:inline-block;width:8px;height:8px;border:1.5px solid currentColor;border-radius:50%;margin-left:6px;vertical-align:1px;opacity:.75}
.xyp-plus{display:none;flex:none;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 12px;background:#f7f7f7;border-top:1px solid #dcdcdc;text-align:center}.xyp-plus.on{display:grid}
.xyp-plus span{font-size:12px;cursor:pointer;padding:8px 0;border-radius:8px;background:#fff}.xyp-plus span b{display:block;font-size:20px;font-weight:500;margin-bottom:2px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-plus{background:var(--bg);border-top:1px solid var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-plus span{background:var(--bg);border:1px solid var(--k);border-radius:0}
.xyp-vt{font-size:12px;opacity:.75;margin-top:4px;border-top:1px dashed currentColor;padding-top:4px}.xyp-gi{display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border:1px solid currentColor;border-radius:4px;font-size:12px;margin-right:6px}
.xyp-map{height:120px;margin:10px;border-radius:8px;background:repeating-linear-gradient(0deg,#e4e8ee 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,#e4e8ee 0 1px,transparent 1px 22px),#f1f4f8;position:relative}.xyp-map i{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#111;box-shadow:0 0 0 6px rgba(0,0,0,.15)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-map{background:repeating-linear-gradient(0deg,var(--line) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,var(--line) 0 1px,transparent 1px 22px),var(--bg);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-map i{background:var(--k)}
.xyp-seg{display:flex;margin:10px 14px 4px;border:1px solid #bbb;border-radius:6px;overflow:hidden}.xyp-seg span{flex:1;text-align:center;padding:8px 0;font-size:14px;cursor:pointer}.xyp-seg span.on{background:#111;color:#fff}.xyp-lvbar{display:flex;align-items:stretch;gap:8px;margin:10px 14px 4px}.xyp-lvbar .xyp-seg{flex:1;margin:0}.xyp-lvmenu{display:inline-block;box-sizing:border-box;margin:4px 0 0 8px;padding:4px 12px;border:1px solid #bbb;border-radius:6px;text-align:center;line-height:1.5;font-size:12px;cursor:pointer;user-select:none;vertical-align:top}.xyp-lvmenu.on{background:#111;color:#fff}.xyp-lvp{margin:6px 14px;border:1px solid #bbb;border-radius:6px;padding:4px 0}.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-lvmenu,.xyp-lvp){border-color:var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lvmenu.on{background:var(--k);color:var(--bg)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-seg{border-color:var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-seg span.on{background:var(--k);color:var(--bg)}
.xyp-rhead>div{flex:1;min-width:0}.xyp-pfh{display:flex;justify-content:flex-end}.xyp-pfh span{cursor:pointer;padding:4px 8px}#xyp-rav{cursor:pointer;flex:none;display:block}.xyp-rhead{display:flex;align-items:center;gap:10px;flex:none;padding:8px 14px;background:#f7f7f7;border-bottom:1px solid #e5e5e5}.xyp-rhead b{font-size:15px}.xyp-rhead small{display:block;color:#888;font-size:12px;margin-top:2px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-rhead{background:var(--bg);border-bottom:1px solid var(--k)}
.xyp-ls{margin:10px 0;padding:9px 12px;background:#fff;border-radius:8px;font-size:14px;line-height:1.6}.xyp-ls b{display:block;font-size:12px;color:#07c160;margin-bottom:2px}.xyp-lv{font-size:13px;margin:5px 2px;color:#444}.xyp-lv b{color:#888;font-weight:500}.xyp-lg{text-align:center;font-size:12px;margin:8px 0;color:#b45309}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ls{background:var(--bg);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-ls b{color:var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lv{color:var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lg{color:var(--k);border-top:1px dashed var(--k);border-bottom:1px dashed var(--k);padding:4px 0}
.xyp-gl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.xyp-gl span{padding:9px 0;border-radius:8px;background:#f0f0f0;font-size:13px;cursor:pointer}.xyp-gl small{display:block;color:#888;font-size:11px;margin-top:2px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-gl span{background:var(--bg);border:1px solid var(--k);border-radius:0;color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox],.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]{-webkit-appearance:none!important;appearance:none!important;width:17px!important;height:17px!important;min-width:17px;margin:0 6px 0 0;border:1.5px solid var(--k,#111)!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important;vertical-align:-3px;cursor:pointer;transition:background .12s}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]::before,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]::before{content:none!important;display:none!important}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]::after,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]::after{content:'✓'!important;display:block!important;position:static!important;width:auto!important;height:auto!important;background:none!important;border:0!important;transform:none!important;font-size:13px;font-weight:700;line-height:14px;text-align:center;color:transparent;transition:color .2s}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:checked::after,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:checked::after,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:active::after,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:active::after{color:var(--bg,#fff)}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:checked:active::after,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:checked:active::after{color:var(--k,#111)}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:checked,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:checked{background:var(--k,#111)!important}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:active,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:active{background:var(--k,#111)!important;transition:background .2s ease-out!important}
.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=checkbox]:checked:active,.xyp-win:is(.th-bw,.th-night,.th-clr) input[type=radio]:checked:active{background:var(--bg,#fff)!important}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-btn,.xyp-plus span,.xyp-seg span,.xyp-gl span,.xyp-comp button,.xyp-dlg .bt span,.xyp-lock .pad b){transition:background-color .15s,color .15s,box-shadow .15s}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-btn,.xyp-plus span,.xyp-seg span,.xyp-gl span,.xyp-comp button,.xyp-dlg .bt span,.xyp-lock .pad b):active{background-color:var(--k)!important;color:var(--bg)!important;transition:background-color .2s ease-out,color .2s ease-out}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-btn.pri,.xyp-seg span.on,.xyp-comp button.pri,.xyp-dlg .bt .ok):active{background-color:var(--bg)!important;color:var(--k)!important;box-shadow:inset 0 0 0 1px var(--k)}
#xyp-scr{position:relative}.xyp-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5}
.xyp-fx i{position:absolute;bottom:70px;font-style:normal;opacity:0;animation:xypfl var(--d,1.6s) ease-out forwards}
@keyframes xypfl{0%{transform:translate(0,0) scale(.5);opacity:1}100%{transform:translate(var(--x,0),-280px) scale(1.3);opacity:0}}
.xyp-fly{position:absolute;left:100%;white-space:nowrap;font-size:13px;padding:2px 9px;border-radius:12px;background:rgba(0,0,0,.5);color:#fff;animation:xypfy 6.5s linear forwards}
@keyframes xypfy{to{transform:translateX(-520px)}}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-fly{background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-fx i{color:var(--k)}
.xyp-sc{margin:10px 0;padding:8px 12px;border-left:2px solid #999;color:#666;font-size:13px;line-height:1.75;font-style:italic}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-sc{border-left-color:var(--k);color:var(--sub)}
.xyp-bk{position:absolute;right:0;top:50%;width:var(--w,0px);height:116px;margin-top:-58px;background:rgba(20,20,24,.82);border-radius:58px 0 0 58px;pointer-events:none;opacity:0;z-index:40;display:flex;align-items:center;overflow:hidden;color:#fff;transition:opacity .15s,background-color .15s}.xyp-bk.on{opacity:1}.xyp-bk b{font-size:26px;font-weight:400;padding-left:10px;line-height:1;transition:transform .2s}.xyp-bk.rdy{background:#000}.xyp-bk.rdy b{transform:translateX(-4px) scale(1.15)}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bk{border-radius:0;background:var(--k);color:var(--bg);border:1px solid var(--bg)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-bk.rdy{background:var(--k)}
.xyp-plus{grid-template-columns:repeat(4,1fr);gap:7px;padding:9px 12px}.xyp-plus span{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:52px;padding:0;border-radius:10px;font-size:11px;color:#444;background:#fff}.xyp-plus span svg{width:20px;height:20px;display:block}.xyp-plus span em{font-style:normal;line-height:1}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-plus span{color:var(--k);border-radius:0;transition:background-color .15s,color .15s}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-plus span:active{background:var(--k);color:var(--bg)}
.xyp-bub.xyp-bx{padding:0;background:none!important;border:0!important;color:inherit;white-space:normal}
.xyp-pay,.xyp-rp{width:210px;border-radius:8px;overflow:hidden;color:#fff;background:#f79c3e;font-size:13px}.xyp-rp{background:#e4574a}.xyp-pay .a,.xyp-rp .a{display:flex;align-items:center;gap:8px;padding:10px 12px 4px}.xyp-pay b,.xyp-rp b{font-size:19px;font-weight:500}.xyp-pay small,.xyp-rp small{display:block;padding:0 12px 8px;opacity:.92}.xyp-pay .s,.xyp-rp .s{padding:4px 12px;font-size:11px;background:rgba(0,0,0,.14)}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-pay,.xyp-rp){background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-pay,.xyp-rp) .s{background:var(--k);color:var(--bg)}
.xyp-pic{max-width:170px;max-height:210px;display:block;border-radius:6px}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-pic{border-radius:0;border:1px solid var(--k)}
.xyp-fl,.xyp-ti,.xyp-cd{display:flex;gap:8px;align-items:center;padding:9px 12px;background:#fff;border:1px solid #e3e3e3;border-radius:8px;font-size:13px;line-height:1.5;color:#111}.xyp-fl{border-style:dashed}.xyp-ti{display:block;width:190px}.xyp-ti svg{display:block;margin-bottom:5px;opacity:.5}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-fl,.xyp-ti,.xyp-cd){background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-fl{border-style:dashed}
.xyp-dlgi{display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:8px;border:1px solid #ccc;border-radius:6px;font:inherit;font-size:14px;background:transparent;color:inherit}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dlgi{border:1px solid var(--k);border-radius:0}
.xyp-vcall{flex:1;min-height:0;display:flex;flex-direction:column;background:#222 center/cover no-repeat;color:#fff}.xyp-ct{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px 8px}.xyp-ct .xyp-av{width:72px;height:72px;font-size:28px}.xyp-ct b{font-size:18px;font-weight:500}.xyp-ct small{opacity:.8}
.xyp-cl{flex:1;min-height:0;overflow:auto;padding:8px 16px;display:flex;flex-direction:column;gap:10px}.xyp-cx{align-self:flex-start;max-width:88%;padding:8px 12px;background:rgba(255,255,255,.16);font-size:14px;line-height:1.6;border-radius:8px}.xyp-cx em{display:block;font-style:italic;opacity:.75;font-size:12.5px}.xyp-cu{align-self:flex-end;max-width:88%;padding:8px 12px;background:rgba(255,255,255,.92);color:#111;font-size:14px;border-radius:8px}
.xyp-cc{flex:none;display:flex;gap:6px;align-items:flex-end;padding:8px 10px 12px;background:rgba(0,0,0,.35)}.xyp-cc textarea{flex:1;min-width:0;border:0;border-radius:6px;padding:8px;font:inherit;font-size:14px;resize:none;background:rgba(255,255,255,.92);color:#111}.xyp-cc button{border:0;border-radius:6px;height:36px;padding:0 12px;background:#fff;color:#111;font-size:14px;cursor:pointer}.xyp-cc button.pri{background:#07c160;color:#fff}.xyp-cc button.dn{background:#e4574a;color:#fff}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-cx,.xyp-cu,.xyp-cc button,.xyp-cc textarea){border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-cc button.pri{background:#fff;color:#111}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-cc button.dn{background:#111;color:#fff;border:1px solid #fff}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-vcall{background-color:#111}
.xyp-ring p{margin:10px 0 4px}.xyp-comp button[data-act=regen]{padding:0 10px}
.xyp-lvbar{flex:none;display:flex;gap:5px;align-items:center;padding:4px 8px;background:#f7f7f7;border-top:1px solid #dcdcdc}.xyp-lvbar i{flex:1}.xyp-lvbar span{font-size:12px;line-height:1;padding:6px 9px;border-radius:6px;background:#fff;border:1px solid #e3e3e3;cursor:pointer;white-space:nowrap;user-select:none}.xyp-lvbar span:active{background:#e8e8e8}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lvbar{background:var(--bg);border-top:1px solid var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lvbar span{background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0;transition:background-color .15s,color .15s}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lvbar span:active{background:var(--k);color:var(--bg)}
.xyp-lvb{margin-left:8px;font-size:10px;letter-spacing:.1em;color:#ef4444;vertical-align:1px}.xyp-lvb::before{content:'● ';animation:xypbl 1.3s infinite}@keyframes xypbl{50%{opacity:.2}}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lvb{color:var(--k)}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is(.xyp-form,.xyp-chips) :is(input,select,textarea):not([type=checkbox]):not([type=radio]){border:1px solid var(--k)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:var(--k);padding:6px 8px;outline:none}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-form select{-webkit-appearance:none;appearance:none}
.xyp-sub summary{list-style:none;cursor:pointer}.xyp-sub summary::-webkit-details-marker{display:none}.xyp-sub summary::after{content:' ›'}.xyp-sub[open] summary::after{content:' ⌄'}
@keyframes xypin{from{opacity:0;transform:translateY(12px) scale(.97)}}
@keyframes xyppf{from{opacity:0;transform:translateX(16px)}}@keyframes xyppb{from{opacity:0;transform:translateX(-16px)}}
@keyframes xyppop{from{opacity:0;transform:translateY(8px) scale(.85)}}
@keyframes xypnew{from{opacity:0;transform:translateY(8px)}}
.xyp-win.on{animation:xypin .24s cubic-bezier(.2,.8,.2,1)}
#xyp-scr.pf{animation:xyppf .2s ease-out}#xyp-scr.pb{animation:xyppb .2s ease-out}
#xyp-scr.pf .xyp-app,#xyp-scr.pb .xyp-app{animation:xyppop .34s cubic-bezier(.2,.9,.3,1.2) backwards}
#xyp-scr .xyp-app:nth-child(2){animation-delay:.04s}#xyp-scr .xyp-app:nth-child(3){animation-delay:.08s}#xyp-scr .xyp-app:nth-child(4){animation-delay:.12s}#xyp-scr .xyp-app:nth-child(5){animation-delay:.16s}#xyp-scr .xyp-app:nth-child(6){animation-delay:.2s}#xyp-scr .xyp-app:nth-child(n+7){animation-delay:.24s}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-app[data-p=album] i::before{content:'图'}
#xyp-scr>:not(.xyp-desk):not(.xyp-fx){zoom:.92}
.xyp-win:not(.mini) #xyp-scr>:not(.xyp-desk):not(.xyp-fx){zoom:1.06}
.xyp-win:is(.th-bw,.th-night,.th-clr) :is([data-act=newc],[data-act=newg],[data-act=genc]) .xyp-av{background:var(--bg)!important;color:var(--k)!important;border:1px solid var(--k);width:28px;height:28px;font-size:13px}
.xyp-comp:has(#xyp-lin){padding:3px 6px;gap:4px}.xyp-comp:has(#xyp-lin) textarea{padding:3px 8px;font-size:12px;min-height:0}.xyp-comp:has(#xyp-lin) button{padding:3px 10px;font-size:12px}
.xyp-comp button.sb{display:flex;align-items:center;justify-content:center;padding:0 12px}
.xyp-dlg .bx{max-height:78%;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.xyp-f input[type=color]{width:46px;flex:none;height:30px;padding:0;border:1px solid #bbb;background:none}.xyp-app i{transition:transform .14s}.xyp-app:active i{transform:scale(.9)}
.xyp-btn,.xyp-comp button,.xyp-plus span{transition:transform .1s,background .15s}.xyp-btn:active,.xyp-comp button:active,.xyp-plus span:active{transform:scale(.95)}.xyp-li:active{background:rgba(128,128,128,.12)}
.xypnew{animation:xypnew .22s ease-out}
.xyp-dlg.on .bx{animation:xyppop .2s ease-out}.xyp-toast.on{animation:xypnew .25s ease-out}
.xyp-banner{position:fixed;z-index:9994;display:none;box-sizing:border-box;padding:10px 14px;border-radius:10px;background:#fff;color:#111;border:1px solid #cfcfcf;box-shadow:0 6px 22px rgba(0,0,0,.3);font-size:13px;line-height:1.5;cursor:pointer;touch-action:none;transform:translateY(-130%);opacity:0;transition:transform .28s ease,opacity .28s ease}.xyp-banner.on{display:block}.xyp-banner.in{transform:none;opacity:1}.xyp-banner b{display:block;font-size:12px;color:#07c160;margin-bottom:2px}.xyp-banner small{font-size:10px;color:#999;float:right}.xyp-lock{animation:xypin .3s ease-out}
@media (prefers-reduced-motion:reduce){.xyp-win,.xyp-win *,.xyp-toast,.xyp-lock{animation:none!important}}
.xyp-dlg{position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:24px}.xyp-dlg.on{display:flex}
.xyp-dlg .bx{background:#fff;color:#111;border-radius:12px;padding:20px 18px 14px;width:100%;max-width:290px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35)}.xyp-dlg .bx b{display:block;font-size:16px;margin-bottom:8px}.xyp-dlg .bx p{margin:0 0 16px;font-size:13px;line-height:1.6;color:#555}.xyp-dlg .bt{display:flex;gap:10px}.xyp-dlg .bt span{flex:1;height:38px;line-height:38px;border-radius:8px;cursor:pointer;font-size:14px;background:#f0f0f0}.xyp-dlg .bt span.ok{background:#07c160;color:#fff}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dlg .bx{background:var(--bg);color:var(--k);border:1px solid var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dlg .bx p{color:var(--sub)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dlg .bt span{background:var(--bg);border:1px solid var(--k);border-radius:0;color:var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-dlg .bt span.ok{background:var(--k);color:var(--bg)}
.xyp-lock{position:absolute;left:0;right:0;top:46px;bottom:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:linear-gradient(160deg,#2a2d34,#14151a);color:#fff;text-align:center;user-select:none}
.xyp-lock.on{display:flex}.xyp-lock .lname{font-size:14px;font-weight:500;letter-spacing:.45em;text-indent:.45em;opacity:.8;margin-bottom:10px}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lock .lname{opacity:1;padding:3px 12px;border:1px solid var(--k)}
.xyp-lock .lt{font-size:56px;font-weight:200;letter-spacing:2px;line-height:1}.xyp-lock .ld{font-size:13px;opacity:.7;margin-bottom:6px}
.xyp-lock .dots{display:flex;gap:14px;height:14px;margin:8px 0 4px}.xyp-lock .dots i{width:12px;height:12px;border-radius:50%;border:1.5px solid currentColor}.xyp-lock .dots i.f{background:currentColor}
.xyp-lock .pad{display:grid;grid-template-columns:repeat(3,62px);gap:12px}
.xyp-lock .pad b{height:62px;line-height:62px;border-radius:50%;border:1px solid rgba(255,255,255,.35);font-size:23px;font-weight:300;cursor:pointer}.xyp-lock .pad b:active{background:rgba(255,255,255,.25)}.xyp-lock .pad b.e{border:0;visibility:hidden}
.xyp-lock .fp{position:absolute;left:50%;bottom:70px;margin-left:-30px;width:60px;height:60px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.9}.xyp-lock .fp i{width:32px;height:32px;border-radius:50%;border:2px solid currentColor;display:block;transition:transform .15s}.xyp-lock .fp:active i{transform:scale(.8)}
.xyp-lock small{font-size:12px;opacity:.6;position:absolute;left:0;right:0;bottom:40px}
.xyp-lock.bad .dots{animation:xypshake .3s}@keyframes xypshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.xyp-win.mini .xyp-lock .lt{font-size:42px}.xyp-win.mini .xyp-lock .pad{grid-template-columns:repeat(3,50px);gap:9px}.xyp-win.mini .xyp-lock .pad b{height:50px;line-height:50px;font-size:19px}.xyp-win.mini .xyp-lock .fp{width:50px;height:50px;margin-left:-25px;bottom:46px}.xyp-win.mini .xyp-lock .fp i{width:26px;height:26px}.xyp-win.mini .xyp-lock small{bottom:22px}
.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lock{background:var(--bg);color:var(--k);font-family:inherit}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lock .pad b{border-color:var(--k);border-radius:0}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lock .pad b:active{background:var(--bg2)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-lock .lt{font-weight:200;letter-spacing:.14em}
.xyp-win.mini{width:min(300px,86vw);height:min(520px,74vh);max-height:none;border-radius:18px;border:1px solid #cfcfcf;font-size:13px}
#xyp-mini{font-size:16px!important}
#xyp-rs,#xyp-rz{display:none}
.xyp-win.mini .xyp-bar{grid-template-columns:48px 1fr 34px 34px 38px 44px}.xyp-win.dsk .xyp-bar{grid-template-columns:48px 1fr 34px 34px 44px}.xyp-bar #xyp-pin{display:flex;align-items:center;justify-content:center;opacity:.55;transition:transform .15s}.xyp-bar #xyp-pin.on{opacity:1;transform:rotate(-35deg)}.xyp-bar #xyp-pin.on svg{fill:currentColor}.xyp-win.dsk #xyp-mini{display:none}
.xyp-win.mini #xyp-rs{display:block;text-align:center;font-size:15px;cursor:pointer;opacity:.7}
.xyp-win.mini #xyp-rz{display:block;position:absolute;left:0;bottom:0;width:26px;height:26px;cursor:nesw-resize;touch-action:none;z-index:8}
#xyp-rz::after{content:'';position:absolute;left:6px;bottom:6px;width:9px;height:9px;border-left:2px solid #888;border-bottom:2px solid #888}
.xyp-rbg{position:absolute;inset:0;background-size:cover;background-position:center top;z-index:0;display:none}.xyp-scr.rb .xyp-rbg{display:block}
.xyp-scr>.xyp-rhead,.xyp-scr>.xyp-msgs,.xyp-scr>.xyp-lvbar,.xyp-scr>.xyp-comp{position:relative;z-index:1}
.xyp-scr.rb>.xyp-msgs{background:transparent!important}
.xyp-scr.rb #xyp-log>*{background:rgba(0,0,0,.42)!important;color:#fff!important;border-radius:8px;padding:4px 9px;width:fit-content;max-width:94%}.xyp-scr.rb #xyp-log b{color:#ffd9a0}
.xyp-zoom{display:none;position:absolute;right:10px;bottom:100px;z-index:2;width:34px;height:34px;align-items:center;justify-content:center;background:rgba(0,0,0,.45);color:#fff;border-radius:8px;cursor:pointer}.xyp-scr.rb .xyp-zoom{display:flex}.xyp-scr.rv .xyp-zoom{display:none!important}
.xyp-pfa{margin-top:12px}.xyp-pfa small{display:block;margin-top:6px;font-size:11px;color:var(--sub,#888)}.xyp-pfc2{margin-top:4px;padding:6px 8px;background:var(--bg2,#f2f2f2);font-size:12px;line-height:1.6}
.xyp-pf{padding-bottom:20px}.xyp-pfc{position:relative;margin:14px 14px 0;padding:22px 16px 14px;border:1px solid var(--k,#111);text-align:center;background:var(--bg2,#f6f6f3)}.xyp-pfc .xyp-av.lg{width:84px;height:84px;margin:0 auto;font-size:32px}.xyp-pfn{font-size:19px;font-weight:600;letter-spacing:.2em;margin:12px 0 6px}.xyp-pfr{display:inline-block;font-size:12px;color:var(--sub,#888);border:1px dashed var(--line,#bbb);padding:3px 12px;cursor:pointer}.xyp-pfs{display:flex;margin-top:14px;border-top:1px solid var(--line,#ddd);padding-top:10px;font-size:11px;color:var(--sub,#888)}.xyp-pfs div{flex:1}.xyp-pfs b{display:block;font-size:15px;color:var(--k,#111);font-weight:600}.xyp-pfe{position:absolute;right:4px;top:4px;padding:6px;cursor:pointer}.xyp-pft{display:flex;justify-content:space-between;align-items:center;margin:20px 14px 10px;font-size:13px;letter-spacing:.3em;font-weight:600}.xyp-pfl{margin:0 14px 0 18px;border-left:1px solid var(--k,#111);padding-left:14px}.xyp-pfp{position:relative;padding:0 0 16px}.xyp-pfp::before{content:'';position:absolute;left:-18px;top:6px;width:7px;height:7px;background:var(--k,#111)}.xyp-pfp p{margin:0;font-size:14px;line-height:1.6}.xyp-pfp small{font-size:11px;color:var(--sub,#888)}.xyp-win .xyp-mefab{bottom:124px;overflow:hidden;padding:0}.xyp-mefab .xyp-av{width:100%;height:100%;border-radius:50%;border:0!important;font-size:16px}.xyp-nav span svg{display:inline-block;vertical-align:middle}
.xyp-dmfab{display:none;position:absolute;right:14px;bottom:62px;z-index:9;width:42px;height:42px;border-radius:50%;background:#fff;color:#111;border:1px solid #cfcfcf;box-shadow:0 2px 6px rgba(0,0,0,.25);align-items:center;justify-content:center;cursor:pointer}
#xyp-rs{display:none;align-items:center;justify-content:center}.xyp-win.mini #xyp-rs{display:flex!important}
.xyp-lvbar span{display:inline-flex;align-items:center;justify-content:center}
.xyp-rvs{display:none}.xyp-scr.rv .xyp-rvs{display:block;position:absolute;right:14px;bottom:16px;z-index:4;background:rgba(0,0,0,.65);color:#fff;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer}
.xyp-comp:has(.stkb) #xyp-in{padding-right:38px!important}.xyp-comp button.stkb{margin-left:-38px;position:relative;z-index:1;background:transparent!important;border:0!important;box-shadow:none!important;padding:0 6px!important;width:34px;min-width:0;height:36px;display:flex;align-items:center;justify-content:center;color:inherit;opacity:.65}.xyp-comp button.stkb svg{width:22px;height:22px}
.xyp-win.mini #xyp-scr>:not(.xyp-desk):not(.xyp-fx){zoom:calc(.92*var(--ms,1))}.xyp-win.mini .xyp-desk,.xyp-win.mini .xyp-bar,.xyp-win.mini .xyp-nav{zoom:var(--ms,1)}
#xyp-lin{height:32px!important;min-height:32px!important;box-sizing:border-box;padding:6px 10px!important;line-height:20px;font-size:14px}.xyp-comp button[data-act=rsend]{height:32px!important;line-height:32px!important;padding:0 12px!important;min-width:0;font-size:13px;margin:0}
#xyp-lin{height:32px!important;min-height:32px!important;box-sizing:border-box;padding:6px 10px!important;line-height:20px;font-size:14px}.xyp-comp button[data-act=rsend]{height:32px!important;line-height:32px!important;padding:0 12px!important;min-width:0;font-size:13px;margin:0}
.xyp-fab b{pointer-events:none}.xyp-fi{display:flex;flex-wrap:wrap;gap:8px;padding:6px 14px}.xyp-fic{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border:1px solid #ccc;border-radius:10px;cursor:pointer;background:#fff;color:#111;font-size:18px}.xyp-fic.on{border-color:#07c160;box-shadow:0 0 0 1px #07c160 inset}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-fic{border-radius:0;border-color:var(--line);background:var(--bg);color:var(--k)}.xyp-win:is(.th-bw,.th-night,.th-clr) .xyp-fic.on{border-color:var(--k);box-shadow:0 0 0 1px var(--k) inset}
.xyp-stk{width:96px;height:96px;object-fit:contain;display:block}
.xyp-rimg,.xyp-rvx{display:none}
.xyp-scr.rv .xyp-rimg{display:block;position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:3}
.xyp-scr.rv .xyp-rvx{display:block;position:absolute;left:14px;bottom:16px;z-index:4;background:rgba(0,0,0,.65);color:#fff;padding:8px 16px;border-radius:18px;font-size:13px;cursor:pointer}
.xyp-scr.rv #xyp-log,.xyp-scr.rv .xyp-lvbar,.xyp-scr.rv .xyp-comp{visibility:hidden}
.xyp-lvbar .zb{display:none}.xyp-scr.rb .xyp-lvbar .zb{display:inline-block}
.xyp-rimg.ns,img[data-noav]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
`;

  if (win.__stPhoneCleanup) { try { win.__stPhoneCleanup(); } catch (e) { /* ignore */ } }
  const oldRoot = doc.getElementById(ROOT_ID); if (oldRoot) oldRoot.remove();
  const oldStyle = doc.getElementById('xyp-style'); if (oldStyle) oldStyle.remove();
  const style = doc.createElement('style'); style.id = 'xyp-style'; style.textContent = CSS; doc.head.appendChild(style);
  const root = doc.createElement('div'); root.id = ROOT_ID;
  root.innerHTML = `<div class="xyp-fab" id="xyp-fab" title="竹影小手机"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 5.2h3"/><circle cx="12" cy="18.3" r=".7" fill="currentColor"/></svg></div><div class="xyp-win" id="xyp-win"><div id="xyp-rz" title="拖动调整大小"></div><span class="xyp-dmfab xyp-mefab" id="xyp-mefab" data-act="mylive" title="我的直播主页"></span><span class="xyp-dmfab" id="xyp-dmfab" data-act="dmlist" title="主播私信"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5h16v11H10l-5 4v-4H4z"/></svg></span><div class="xyp-bar" id="xyp-bar"><span id="xyp-back">‹</span><b id="xyp-title">小手机</b><span id="xyp-rs" title="重置大小"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/></svg></span><span id="xyp-pin" title="图钉：固定窗口（点空白处不收起）"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></svg></span><span id="xyp-mini" title="缩小/放大">—</span><span id="xyp-close">✕</span></div><div class="xyp-scr" id="xyp-scr"></div><div class="xyp-nav"><span data-act="nback" title="返回"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M16 4.5 7 12l9 7.5z"/></svg></span><span data-act="nhome" title="主屏幕"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7.5"/></svg></span></div><div class="xyp-lock" id="xyp-lock"></div><div class="xyp-dlg" id="xyp-dlg"></div></div><div class="xyp-toast" id="xyp-toast"></div><div class="xyp-banner" id="xyp-banner"></div>`;
  doc.body.appendChild(root);
  const $ = (id) => doc.getElementById(id);
  const fab = $('xyp-fab'); const winEl = $('xyp-win'); const scr = $('xyp-scr');

  // 通用确认弹窗
  const dlgEl = $('xyp-dlg'); let dlgFn = null; let dlgNo = null; let dlgTwo = 0;
const confirmBox = (title, text, fn, no, two) => { dlgFn = fn; dlgNo = no || null; dlgTwo = two ? 1 : 0; dlgEl.innerHTML = `<div class="bx"><b>${esc(title)}</b><p>${esc(text)}</p><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="dlgok">确认</span></div></div>`; dlgEl.classList.add('on'); };
  const closeBox = () => { dlgFn = null; dlgNo = null; dlgTwo = 0; dlgEl.classList.remove('on'); };
const ageGate = (fn) => { confirmBox('年龄确认', '查手机和直播里含有成人向（R18）内容。请确认你已年满18岁。', () => { cfg.adultAsk = true; cfg.adultOk = true; cfg.liveAdult = 'on'; saveCfg(); showDlg('<div class="bx"><b>R18内容已开启</b><p>查手机和直播里的成人向内容已开启，可在 设置 → R18内容 里关闭。</p><div class="bt"><span class="ok" data-act="dlgno">知道了</span></div></div>'); fn(); }, () => { cfg.adultAsk = true; cfg.liveAdult = 'off'; saveCfg(); showDlg('<div class="bx"><b>R18内容已关闭</b><p>查手机和直播里的成人向内容已关闭，可在 设置 → R18内容 里开启。</p><div class="bt"><span class="ok" data-act="dlgno">知道了</span></div></div>'); fn(); }, true); };
  // 锁屏：每次打开小手机时需要解锁；设了密码用数字键盘，没设密码则轻触圆圈（像指纹）
  const hpw = (t) => { let h = 5381; for (const c of 'xyp' + t) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return String(h); };
  let lkBuf = '';
  const lockEl = $('xyp-lock');
  const renderLock = () => {
    const d = new Date(); const wk = '日一二三四五六'[d.getDay()]; const n = cfg.pw ? Number(cfg.pwLen) || 4 : 0;
    lockEl.innerHTML = `<div class="lname">竹影小手机</div><div class="lt">${hhmm(d)}</div><div class="ld">${d.getMonth() + 1}月${d.getDate()}日 星期${wk}</div>` + (cfg.pw
      ? `<div class="dots">${Array.from({ length: n }, (_, i) => `<i class="${i < lkBuf.length ? 'f' : ''}"></i>`).join('')}</div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<b data-act="lk" data-k="${k}">${k}</b>`).join('')}<b class="e"></b><b data-act="lk" data-k="0">0</b><b data-act="lkdel">⌫</b></div>`
      : `<div class="fp" data-act="lkfp"><i></i></div><small>轻触圆圈解锁</small>`);
  };
  const setLock = (v) => { lkBuf = ''; lockEl.classList.toggle('on', !!v); if (v) renderLock(); };
  const unlock = () => { setLock(false); };
  const lockKey = (k) => {
    if (!cfg.pw) return; const n = Number(cfg.pwLen) || 4; if (lkBuf.length >= n) return; lkBuf += k; renderLock();
    if (lkBuf === '1111') { unlock(); return; }
    if (lkBuf.length === n) { if (hpw(lkBuf) === cfg.pw) unlock(); else { lockEl.classList.add('bad'); setTimeout(() => { lkBuf = ''; lockEl.classList.remove('bad'); renderLock(); }, 320); } }
  };

  // 导航
  const nav = [{ p: 'home' }]; const cur = () => nav[nav.length - 1];
  let navDir = '';
  const go = (p, o) => { nav.push({ p, ...(o || {}) }); navDir = 'pf'; render(); };
  const back = () => { if (cur().p === 'call' && call) { endCall(); return; } if (nav.length > 1) nav.pop(); navDir = 'pb'; render(); };
  const home = () => { if (call) endCall(); nav.length = 1; navDir = 'pb'; render(); };
  const TITLES = { dms: '主播私信', live: '直播', mylv: '我的直播主页', prof: '主播主页', mywal: '钱包', shop: '购物', shopme: '我的订单', loc: '定位', home: '竹影小手机', wx: '微信', chat: '', contact: '联系人', settings: '设置', theme: '美化', album: '角色图册', mom: '朋友圈', cp: '查手机', cpsec: '', cpchat: '', call: '通话' };

  const ordered = (arr, key) => { const o = (cfg.order && cfg.order[key]) || []; return arr.map((x, i) => ({ x, i })).sort((a, b) => { const ia = o.indexOf(a.x.k); const ib = o.indexOf(b.x.k); return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || (a.i - b.i); }).map((z) => z.x); };
  const unrWx = () => D().contacts.some((x) => x.unread > 0 && wxOk(x)); const unrDm = () => D().contacts.some((x) => x.unread > 0 && dmOnly(x));
  const pageHome = () => {
    const d = new Date();
    const apps = [{ k: 'wx', h: '<i style="background:#07c160">💬</i><b>微信</b>' }, { k: 'cp', h: '<i style="background:#111">🔍</i><b>查手机</b>' }, { k: 'live', h: '<i style="background:#ef4444">📺</i><b>直播</b>' }, { k: 'mywal', h: '<i style="background:#f59e0b">👛</i><b>钱包</b>' }, { k: 'shop', h: '<i style="background:#f97316">🛒</i><b>购物</b>' }, { k: 'loc', h: '<i style="background:#3b82f6">📍</i><b>定位</b>' }, ...(albumOn() ? [{ k: 'album', h: '<i style="background:#0ea5e9">图</i><b>角色图册</b>' }] : []), { k: 'theme', h: '<i style="background:#a78bfa">🎨</i><b>美化</b>' }, { k: 'settings', h: '<i style="background:#8e8e93">⚙️</i><b>设置</b>' }];
    return `<div class="xyp-pg xyp-home xyp-desk"><div class="xyp-clock">${hhmm(d)}</div><div class="xyp-apps" data-ord="home">${ordered(apps, 'home').map((a) => `<div class="xyp-app" data-act="open" data-p="${a.k}">${a.h}${(a.k === 'wx' && unrWx()) || (a.k === 'live' && unrDm()) ? '<span class="xyp-dot"></span>' : ''}</div>`).join('')}</div><div class="xyp-tip" style="text-align:center;margin-top:30px">长按图标可拖动调整顺序</div></div>`;
  };
  const lastOf = (x) => { const a = D().msgs[x.id] || []; return a[a.length - 1]; };
  const pageWx = (o) => {
    const tab = o.tab || 'chats'; const d = D(); let body = '';
    if (tab === 'chats') {
      const list = d.contacts.filter((x) => wxOk(x) && (x.isChar || x.isGroup || x.pin || (d.msgs[x.id] || []).length)).sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || (((lastOf(b) || {}).ts || 0) - ((lastOf(a) || {}).ts || 0)));
      body = list.map((x) => { const m = lastOf(x); return `<div class="xyp-li" data-act="chat" data-id="${x.id}">${av(cAv(x), cName(x))}<div class="m"><b>${x.pin ? '📌 ' : ''}${esc(cName(x))}${x.share ? '<span class="xyp-lc"></span>' : ''}${x.unread ? `<span class="xyp-bdg">${x.unread}</span>` : ''}</b><small>${m ? esc(clip((x.isGroup && getC(m.w) ? cName(getC(m.w)) + '：' : '') + (m.k === 'sys' ? '' : mtxt(m)), 30)) : '点击开始聊天'}</small></div><span class="t">${m ? hhmm(m.ts) : ''}</span></div>`; }).join('');
    } else if (tab === 'mom') {
      body = pageMom({ as: 'u' }).replace(/^<div class="xyp-pg">/, '').replace(/<\/div>$/, '');
    } else if (tab === 'book') {
      body = `<div class="xyp-li" data-act="newc"><span class="xyp-av xyp-avt" style="background:#07c160">＋</span><div class="m"><b>添加联系人</b></div></div><div class="xyp-li" data-act="newg"><span class="xyp-av xyp-avt" style="background:#576b95">群</span><div class="m"><b>创建群聊</b></div></div><div class="xyp-li" data-act="genc"><span class="xyp-av xyp-avt" style="background:#8e8e93">？</span><div class="m"><b>生成联系人</b><small>${npcBusy || gcBusy ? '生成中……' : '补全正文里的角色 / 随机NPC'}</small></div></div>` + d.contacts.filter((x) => !x.live || x.friend).map((x) => `<div class="xyp-li" data-act="${x.isGroup ? 'editg' : 'edit'}" data-id="${x.id}">${av(cAv(x), cName(x))}<div class="m"><b>${esc(cName(x))}${x.share ? '<span class="xyp-lc"></span>' : ''}</b><small>${esc(x.isGroup ? '群聊 · ' + (x.members || []).length + '人' : (x.rel || (x.isChar ? '主角色' : '未设置关系')))}</small></div><span class="xyp-btn" data-act="chat" data-id="${x.id}" style="margin:0 6px 0 0">聊天</span>${x.isChar ? '' : `<span class="xyp-btn dng" data-act="delc2" data-id="${x.id}" style="margin:0">${o.dc === x.id ? '确认删除' : '删除'}</span>`}</div>`).join('');
    } else {
      body = `<div class="xyp-center">${av(uAv(), myNick(), 'lg')}<div style="margin-top:8px"><span class="xyp-btn" data-act="upav" data-t="user">更换头像</span>${d.user.avatar ? '<span class="xyp-btn" data-act="clrav" data-t="user">恢复默认</span>' : ''}</div></div>
<div class="xyp-f"><label>网名</label><input id="xyp-nick" value="${esc(d.user.nick)}" placeholder="${esc(uName())}" data-me="nick"></div>
<div class="xyp-tip">真名：${esc(uName())}（来自你的用户设定）。对方默认只知道你的网名，你在聊天里说出真名，或在联系人里设置「知道我的真名」后才会知道。</div>
<div class="xyp-f"><label>微信号</label><input id="xyp-wxid" value="${esc(d.user.wxid)}" placeholder="可不填" data-me="wxid"></div>
<div class="xyp-tip">网名只在小手机里使用，角色在聊天里会这样称呼你的网名；不填则用正文里的名字。</div>`;
    }
    return `<div class="xyp-pg">${body}</div><div class="xyp-tabs">${[['chats', '微信'], ['book', '通讯录'], ['mom', '朋友圈'], ['me', '我']].map(([k, n]) => `<div class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${n}${k === 'chats' && tab !== 'chats' && unrWx() ? '<span class="xyp-dot"></span>' : ''}</div>`).join('')}</div>`;
  };
  const pageGroup = (o) => {
    const d = D(); const g = o.id === 'new' ? { name: '', members: [] } : getC(o.id); if (!g) return '<div class="xyp-center">群聊不存在</div>';
    return `<div class="xyp-pg xyp-form"><div class="xyp-f"><label>群名</label><input id="xyp-g-name" value="${esc(g.name)}" placeholder="群聊名称"></div><div class="xyp-h">群成员（你默认在群里）</div>${d.contacts.filter((x) => !x.isGroup && wxOk(x)).map((x) => `<div class="xyp-f xyp-tog"><div>${esc(cName(x))}<span class="xyp-tip" style="padding:0 0 0 6px">${esc(x.rel || '')}</span></div><input type="checkbox" data-gm="${x.id}" ${(g.members || []).includes(x.id) ? 'checked' : ''}></div>`).join('')}
<div class="xyp-center"><span class="xyp-btn pri" data-act="saveg">保存</span>${o.id === 'new' ? '' : `<span class="xyp-btn" data-act="clrchat">清空聊天记录${o.cc ? '（再点确认）' : ''}</span><span class="xyp-btn dng" data-act="delc">${o.del ? '确认解散' : '解散群聊'}</span>`}</div></div>`;
  };
  const REL = ['恋人', '伴侣', '朋友', '同事', '上级', '下属', '家人', '同学', '邻居', '陌生人'];
  const pageContact = (o) => {
    const isNew = o.id === 'new'; const x = isNew ? { name: '', remark: '', rel: '', persona: '', avatar: '', know: 'auto' } : getC(o.id); if (!x) return '<div class="xyp-center">联系人不存在</div>';
    const avUrl = o.av !== undefined ? o.av : cAv(x);
    return `<div class="xyp-pg xyp-form"><div class="xyp-center" id="xyp-cav">${av(avUrl, x.remark || x.name || '新')}<div style="margin-top:8px"><span class="xyp-btn" data-act="upav" data-t="contact">更换头像</span><span class="xyp-btn" data-act="clrav" data-t="contact">恢复默认</span></div></div>
<div class="xyp-f"><label>网名</label><input id="xyp-f-name" value="${esc(x.isChar ? (x.nick || x.name) : x.name)}" placeholder="对方的网名"></div>
${x.isChar || x.isGroup ? '' : `<div class="xyp-f"><label>真名</label><input id="xyp-f-real" value="${esc(x.real || '')}" placeholder="真实姓名；和直播主播的真名相同就是同一个人"></div>`}
<div class="xyp-f"><label>备注</label><input id="xyp-f-remark" value="${esc(x.remark)}" placeholder="你给TA的备注，可不填"></div>
<div class="xyp-f"><label>关系</label><input id="xyp-f-rel" value="${esc(x.rel)}" list="xyp-rels" placeholder="如：恋人、同事"><datalist id="xyp-rels">${REL.map((r) => `<option value="${r}">`).join('')}</datalist></div>
${x.isChar ? `<details class="xyp-sub"><summary class="xyp-h">查看角色设定（卡面，只读）</summary><div class="xyp-code">${esc(clip(charCard(), 1800))}</div></details>` : `<div class="xyp-f"><label>设定</label><textarea id="xyp-f-persona" placeholder="TA是什么样的人？性格、身份、说话方式……写得越具体越像">${esc(x.persona)}</textarea></div>`}
${isNew || x.isGroup ? '' : `<div class="xyp-f"><label>主动打电话</label><select id="xyp-f-call"><option value="0" ${x.callOn ? '' : 'selected'}>关闭（默认）</option><option value="1" ${x.callOn ? 'selected' : ''}>开启（开着小手机时，TA可能来电）</option></select></div>
<div class="xyp-f"><label>通话背景</label><span style="flex:1;font-size:12px;opacity:.7">${(o.bg !== undefined ? o.bg : x.callBg) ? '已设置' : '未设置'}</span><span class="xyp-btn" data-act="upbg" style="margin:0">选择图片</span><span class="xyp-btn" data-act="clrbg" style="margin:0 0 0 6px">清除</span></div>`}
${isNew || x.isChar || x.isGroup ? '' : `<div class="xyp-f"><label>知道我的真名</label><select id="xyp-f-kr"><option value="0" ${x.kr ? '' : 'selected'}>不知道（只知道我的网名）</option><option value="1" ${x.kr ? 'selected' : ''}>知道</option></select></div>`}
<div class="xyp-f"><label>知晓正文</label><select id="xyp-f-know"><option value="auto" ${x.know === 'auto' ? 'selected' : ''}>自动（正文里出现过才知道）</option><option value="yes" ${x.know === 'yes' ? 'selected' : ''}>一直知道</option><option value="no" ${x.know === 'no' ? 'selected' : ''}>完全不知道</option></select></div>
<div class="xyp-center"><span class="xyp-btn pri" data-act="savec">保存</span>${isNew ? '' : `<span class="xyp-btn" data-act="pinc" data-id="${esc(x.id)}">${x.pin ? '取消置顶' : '置顶聊天'}</span><span class="xyp-btn" data-act="chat" data-id="${esc(x.id)}">发消息</span>`}${isNew ? '' : '<span class="xyp-btn" data-act="clrchat">清空聊天记录' + (o.cc ? '（再点确认）' : '') + '</span>'}${isNew || x.isChar ? '' : `<span class="xyp-btn dng" data-act="delc">${o.del ? '确认删除' : '删除联系人'}</span>`}</div></div>`;
  };
  const tog = (k, label, tip) => `<div class="xyp-f xyp-tog"><div><div style="font-size:14px">${label}</div>${tip ? `<div class="xyp-tip" style="padding:2px 0 0">${tip}</div>` : ''}</div><input type="checkbox" data-cfgb="${k}" ${cfg[k] ? 'checked' : ''}></div>`;
  let setQ = '';
  const applySq = () => { try {
    const inp = doc.getElementById('xyp-sq'); if (!inp) return; const pg = inp.closest('.xyp-pg'); if (!pg) return;
    const q = setQ.trim().toLowerCase(); const kids = Array.from(pg.children).filter((e) => !e.classList.contains('xyp-sqb'));
    pg.querySelectorAll('.xyp-sqn').forEach((e) => e.remove());
    kids.forEach((e) => e.classList.remove('xyp-sqh'));
    if (!q) return;
    const units = []; kids.forEach((e) => { if (e.classList.contains('xyp-tip') && units.length && !units[units.length - 1].h) units[units.length - 1].els.push(e); else units.push({ els: [e], h: e.classList.contains('xyp-h') }); });
    const txt = (u) => u.els.map((e) => { let s = e.textContent || ''; e.querySelectorAll('input,textarea').forEach((i) => { s += ' ' + (i.placeholder || ''); }); return s; }).join(' ').toLowerCase();
    let any = false, pend = null, pendHit = false;
    const flush = () => { if (pend) pend.els.forEach((e) => e.classList.toggle('xyp-sqh', !pendHit)); };
    units.forEach((u) => { if (u.h) { flush(); pend = u; pendHit = false; return; }
      const hit = txt(u).includes(q); u.els.forEach((e) => e.classList.toggle('xyp-sqh', !hit));
      if (hit) { any = true; pendHit = true; u.els.forEach((e) => { if (e.tagName === 'DETAILS') e.open = true; }); } });
    flush();
    if (!any) { const n = doc.createElement('div'); n.className = 'xyp-sqn'; n.textContent = '没有找到「' + setQ.trim() + '」相关的设置'; pg.appendChild(n); }
  } catch (e) { console.warn('[xy-phone] 搜索设置失败', e); } };
  const pageSettings = (o) => `<div class="xyp-pg xyp-form"><div class="xyp-sqb"><input id="xyp-sq" type="search" value="${esc(setQ)}" placeholder="搜索设置，如：世界书、锁屏、直播…"></div>${preUI(o)}<div class="xyp-h">接口（OpenAI 兼容）</div>
<div class="xyp-f"><label>地址</label><input data-cfg="url" value="${esc(cfg.url)}" placeholder="https://xxx.com/v1"></div>
<div class="xyp-f"><label>密钥</label><input data-cfg="key" type="password" value="${esc(cfg.key)}" placeholder="sk-..."></div>
<div class="xyp-f"><label>模型</label><input data-act="pickm" data-k="main" readonly value="${esc(cfg.model)}" placeholder="点击选择模型"><span class="xyp-btn" data-act="fetchm" style="margin:0">拉取</span></div><datalist id="xyp-ml">${(o.models || []).map((q) => `<option value="${esc(q)}">`).join('')}</datalist>
<div class="xyp-tip">${esc(o.mtip || '地址留空时，点「拉取」会读取酒馆当前连接的模型，选好后用酒馆的 API 和密钥，不用再填；换 API 后再点一次即可。')}</div>
<div class="xyp-f"><label>温度</label><input data-cfg="temp" type="number" step="0.1" min="0" max="2" value="${esc(cfg.temp)}"></div>
<div class="xyp-f"><label>最长输出</label><input data-cfg="max" type="number" step="50" min="50" value="${esc(cfg.max)}"></div>
<div class="xyp-center"><span class="xyp-btn" data-act="stfill">读取酒馆接口</span><span class="xyp-btn" data-act="stinfo" title="说明" style="padding-left:12px;padding-right:12px">?</span><span class="xyp-btn pri" data-act="test">测试连接</span><div class="xyp-tip" id="xyp-test">${esc(o.test || '地址留空时，会尝试使用酒馆当前连接。密钥只保存在本浏览器里。')}</div>${o.stinfo ? '<div class="xyp-tip" style="border:1px dashed var(--line,#bbb);padding:6px 8px;margin-top:6px;text-align:left">点「读取酒馆接口」会把酒馆当前连接的地址填进来。想连密钥一起读取，需要在酒馆的 config.yaml 里把 allowKeysExposure 设为 true，重启酒馆后再点一次。</div>' : ''}</div>
<details class="xyp-sub"><summary class="xyp-h">单独接口（可选，点开设置，留空则用上面的）</summary>
${['live:直播', 'wx:微信', 'cp:查手机'].map((q) => { const [k, n] = q.split(':'); const a = (cfg.ap && cfg.ap[k]) || {}; return `<div class="xyp-h" style="font-size:13px;margin-top:10px">${n}接口</div><div class="xyp-f"><label>地址</label><input data-ap="${k}.url" value="${esc(a.url || '')}" placeholder="地址，留空=用主接口"></div><div class="xyp-f"><label>密钥</label><input data-ap="${k}.key" type="password" value="${esc(a.key || '')}"></div><div class="xyp-f"><label>模型</label><input data-act="pickm" data-k="${k}" readonly value="${esc(a.model || '')}" placeholder="点击选择（留空=用主接口的模型）"></div>`; }).join('')}</details>
${igUI(o)}
${wbUI(o)}
<div class="xyp-center" style="margin:10px 0"><span class="xyp-btn pri" data-act="tkopen">省 token 模式</span></div>
<div class="xyp-h">开关</div>
${tog('auto', '发送后自动回复', '关掉后，需要点输入栏旁的 ↻ 让对方回复')}
${tog('sync', '让正文知道小手机里的事', '新聊天和翻看手机的内容会在下一次正文生成前，以一小段提示告诉正文（几十到几百字）')}
${tog('know', '小手机角色知晓正文', '关掉后，所有角色只按聊天内容回复，不读正文')}
<div class="xyp-f"><label>角色图册</label><select data-cfg="albumOff"><option value="" ${cfg.albumOff !== '1' ? 'selected' : ''}>显示</option><option value="1" ${cfg.albumOff === '1' ? 'selected' : ''}>关闭（桌面不显示图标）</option></select></div>
<div class="xyp-f"><label>朋友圈连通正文</label><select data-cfg="momSync"><option value="on" ${cfg.momSync !== 'off' ? 'selected' : ''}>连通（角色按规则知道）</option><option value="off" ${cfg.momSync === 'off' ? 'selected' : ''}>不连通</option></select></div>
<div class="xyp-f"><label>手机内容告知正文</label><select data-cfg="cpKnow"><option value="n3" ${cfg.cpKnow === 'n3' ? 'selected' : ''}>连续告知3层（正文提到就停）</option><option value="once" ${cfg.cpKnow === 'once' ? 'selected' : ''}>只告知一次（省）</option><option value="always" ${cfg.cpKnow === 'always' ? 'selected' : ''}>每层都带着（贵）</option><option value="off" ${cfg.cpKnow === 'off' ? 'selected' : ''}>不告知</option></select></div>
<div class="xyp-f"><label>低电量告知正文</label><select data-cfg="batTell"><option value="on" ${cfg.batTell === 'off' ? '' : 'selected'}>告知（电量15%以下、关机时）</option><option value="off" ${cfg.batTell === 'off' ? 'selected' : ''}>不告知</option></select></div>
<div class="xyp-f"><label>使用记录告知正文</label><select data-cfg="useTell"><option value="on" ${cfg.useTell === 'off' ? '' : 'selected'}>告知（每次生成后告知一次）</option><option value="off" ${cfg.useTell === 'off' ? 'selected' : ''}>不告知</option></select></div>

<div class="xyp-tip">模型没有记忆，只认发给它的文字。「一次」：角色手机内容生成后，只在下一层告诉正文一次（几百字），之后靠正文自己写进剧情来记住，不再重复；「每层都带着」每层都多发几百字，最稳但最费。</div>
<div class="xyp-h">角色说话补充（每次回复都会带上，越短越省）</div>
<div class="xyp-f"><textarea data-cfg="sty" rows="3" placeholder="如：说话温柔自然，称呼我的名字，回复简短口语化">${esc(cfg.sty || '')}</textarea></div>
<details class="xyp-sub" id="xyp-lvset"${lvSetOpen ? ' open' : ''}><summary class="xyp-h">直播设置（点开）</summary>
${tog('upSync', '用户动态连接正文', '开启后，你在直播软件发的动态和互关主播的评论，会告诉正文，也会让私信、微信里的互关主播知道（默认关）')}
<div class="xyp-f"><label>新互关主播可看</label><select data-cfg="upSee"><option value="first" ${cfg.upSee === 'first' || !cfg.upSee ? 'selected' : ''}>最新一条动态（省）</option><option value="all" ${cfg.upSee === 'all' ? 'selected' : ''}>全部动态（较费）</option><option value="none" ${cfg.upSee === 'none' ? 'selected' : ''}>不可以看（只有发动态前就互关的能看）</option></select></div>
${tog('grpLink', '群聊与私聊互通', '开启时：成员在私聊里知道自己所在群里最近的聊天，群聊里也知道成员和你私聊的最近几句（每次多带一两百字）；关闭则互相不知道')}
${tog('dmLink', '直播私聊与微信联通', '加了主播微信后，微信和直播私聊的聊天记录各自独立；开启时主播在微信里仍记得私聊内容（每次回复多带几十到几百字），关闭则完全独立')}
${tog('lsync', '直播内容连接正文', '默认关。开启后可选择哪些内容告诉正文；只有正文里出现过、或和你有过私聊/加了微信的主播才会报告，没生成、没刷新的不会报告')}
${cfg.lsync ? `${tog('lsPost', '　① 主播动态', '')}
${tog('lsRoom', '　② 直播间内容（画面和主播话语）', '')}
${tog('lsDm', '　③ 主播在直播软件的私聊内容', '转到微信后的聊天不受这里管理，跟随主设置')}
<div class="xyp-f"><label>提醒次数</label><select data-cfg="lsN"><option value="1" ${String(cfg.lsN) === '1' ? 'selected' : ''}>只提醒一次（默认）</option><option value="2" ${String(cfg.lsN) === '2' ? 'selected' : ''}>提醒2次</option><option value="3" ${String(cfg.lsN) === '3' ? 'selected' : ''}>提醒3次</option><option value="5" ${String(cfg.lsN) === '5' ? 'selected' : ''}>提醒5次</option></select></div>` : ''}
<div class="xyp-f"><label>直播内容出现速度</label><select data-cfg="lpace"><option value="fast" ${cfg.lpace === 'fast' ? 'selected' : ''}>快（0.2~0.45秒一条）</option><option value="mid" ${!cfg.lpace || cfg.lpace === 'mid' ? 'selected' : ''}>中（0.45~0.8秒一条，默认）</option><option value="slow" ${cfg.lpace === 'slow' ? 'selected' : ''}>慢（0.65~1.15秒一条）</option></select></div>
<div class="xyp-f"><label>直播画面文字</label><select data-cfg="scLen"><option value="auto" ${(cfg.scLen || 'auto') === 'auto' ? 'selected' : ''}>自动（有生图写长，没生图写短）</option><option value="short" ${cfg.scLen === 'short' ? 'selected' : ''}>短（1句）</option><option value="mid" ${cfg.scLen === 'mid' ? 'selected' : ''}>中（2句）</option><option value="long" ${cfg.scLen === 'long' ? 'selected' : ''}>长（3~4句）</option></select></div>
${tog('lvWb', '直播带世界书（只带常驻）', '生成直播间、进直播间、继续看时，只带世界书里的常驻（蓝灯）条目，最多 600 字；关闭则直播完全不带世界书，更省 token')}
${cfg.lvWb !== false ? lvWbSelUI() : ''}
<div class="xyp-f"><label>R18内容</label><select data-cfg="liveAdult"><option value="on" ${cfg.liveAdult !== 'off' ? 'selected' : ''}>开启（查手机、直播、私密相册的成人内容）</option><option value="off" ${cfg.liveAdult === 'off' ? 'selected' : ''}>关闭</option></select></div>
</details>
${tog('story', '正文发消息自动同步', '正文写到有人发手机消息时，回复末尾会多写一行标记（自动隐藏），生成完自动显示在小手机里')}
${tog('fab', '显示悬浮按钮「机」', '')}
${tog('apiw', '快速切换 API 悬浮窗', '开启后屏幕上多一个小窗，点开可以直接改小手机的地址 / 密钥 / 模型，也能存多套预设一键切换')}
<div class="xyp-f"><label>过滤标签</label><input data-cfg="strip" value="${esc(cfg.strip)}" placeholder="如 状态栏,tucao（逗号分隔）"></div>
<div class="xyp-tip">小手机读取正文时，会忽略这些标签包住的内容（思考块、代码块已默认忽略）。</div>
${isD() ? tog('entSend', '回车发送（仅电脑）', '聊天、弹幕输入框和各类输入弹窗（如打赏备注）：Enter 发送/确定，Shift+Enter 换行') + tog('hk', '启用快捷键（仅电脑）', '默认：Ctrl+Z 保存图片/预设，← 返回上一页，Esc 收起') + '<div class="xyp-f"><label>快捷键</label><span class="xyp-btn" data-act="hkset" style="margin:0">修改快捷键</span></div>' : ''}
${tog('outClose', '点空白处收起小手机', '缩小的悬浮窗也适用；不会打断正在生成的回复')}
${tog('lock', '锁屏', '每次打开小手机都要先解锁；没设密码时，轻触锁屏上的圆圈即可解锁')}
<div class="xyp-f"><label>锁屏密码</label><input id="xyp-pw" type="password" inputmode="numeric" maxlength="8" placeholder="4~8位数字，留空=无密码"><span class="xyp-btn" data-act="savepw" style="margin:0">保存</span></div>
<div class="xyp-tip">${cfg.pw ? '已设置密码。' : '未设置密码。'}密码只起遮挡作用，不是高强度加密。</div>
<div class="xyp-f"><label>自动添加联系人</label><select data-cfg="addC"><option value="off" ${cfg.addC === 'off' ? 'selected' : ''}>关闭</option><option value="story" ${cfg.addC === 'story' ? 'selected' : ''}>正文出现过的角色</option><option value="npc" ${cfg.addC === 'npc' ? 'selected' : ''}>随机生成NPC</option><option value="both" ${cfg.addC === 'both' ? 'selected' : ''}>两者都要</option></select></div>
<div class="xyp-tip">「正文出现过的角色」：正文里出现有名字的新人物时，回复末尾会多写一行标记（隐藏），自动加进通讯录；「随机NPC」：每隔几层用你的API生成一个NPC，并告诉正文（约50字），后文可以让TA出现。</div>
<div class="xyp-f"><label>知晓条数</label><input data-cfg="ctxN" type="number" min="1" max="12" value="${esc(cfg.ctxN)}"></div>
<div class="xyp-tip">角色读取的最近正文楼层数，越多越懂剧情，也越花额度。</div>
<div class="xyp-f"><label>回复长度</label><select data-cfg="len"><option value="short" ${cfg.len === 'short' ? 'selected' : ''}>短（1~3条）</option><option value="mid" ${cfg.len === 'mid' ? 'selected' : ''}>中（2~5条）</option></select></div>
<div class="xyp-f"><label>常驻条数</label><input data-cfg="keepN" type="number" min="0" max="12" value="${esc(cfg.keepN)}"></div>
<div class="xyp-tip">正文每次都会看到最近几条和主角色的微信（0 = 只在新消息出现的那一次告诉正文）。</div>
<div class="xyp-h">其他</div>
<div class="xyp-center"><span class="xyp-btn" data-act="resetpos">重置位置</span><span class="xyp-btn dng" data-act="wipe">${o.wipe ? '确认清空（不可恢复）' : '清空本聊天小手机数据'}</span></div></div>`;
  const THEMES_KEY = 'st_phone_themes';
  const BUILTIN = [
    { id: 'orig', name: '原色', desc: '微信风格，绿色气泡', sw: ['#07c160', '#95ec69', '#ededed'] },
    { id: 'bw', name: '黑白', desc: '纸白底、黑线、衬线字，简约', sw: ['#111', '#fff', '#f4f4f1'] },
    { id: 'clr', name: '原色·雅', desc: '黑白版的排版与线条，换成奶白底与墨绿色', sw: ['#1d3b34', '#f8f5ee', '#efe9dc'] },
    { id: 'night', name: '黑白·夜', desc: '墨黑底、白线，同一套设计的深色版', sw: ['#ececea', '#0e0e0e', '#191919'] },
  ];
  const loadCustom = () => { try { const a = JSON.parse(store.get(THEMES_KEY, '[]')); return Array.isArray(a) ? a.filter((x) => x && x.id && typeof x.css === 'string') : []; } catch (e) { return []; } };
  let customTh = loadCustom();
  const saveCustom = () => store.set(THEMES_KEY, JSON.stringify(customTh));
  const SV = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const FAB_ICONS = [['phone', SV('<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 5.2h3"/><circle cx="12" cy="18.3" r=".7" fill="currentColor"/>')], ['chat', SV('<path d="M4 5h16v11H10l-5 4v-4H4z"/>')], ['heart', SV('<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>')], ['spark', SV('<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>')], ['paw', SV('<circle cx="7" cy="10" r="1.8"/><circle cx="11" cy="6.5" r="1.8"/><circle cx="16" cy="7" r="1.8"/><circle cx="19" cy="11.5" r="1.8"/><path d="M12 12c-3 0-5 3-5 5.2 0 1.8 1.5 2.3 3 2 1-.2 1.4-.5 2-.5s1 .3 2 .5c1.5.3 3-.2 3-2C17 15 15 12 12 12z"/>')], ['smile', SV('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>')], ['t:机', '<b>机</b>']];
  const FAB_COLS = [['', '跟随'], ['#111111', '黑'], ['#ffffff', '白'], ['#07c160', '绿'], ['#3b82f6', '蓝'], ['#ef4444', '红'], ['#ec4899', '粉']];
  function setFab() { const cc = cfg.fabC || ''; if (cc) { const n = parseInt(cc.slice(1), 16); const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); fab.style.background = cc; fab.style.color = lum > 150 ? '#111' : '#fff'; } else { fab.style.background = ''; fab.style.color = ''; }
    const id = cfg.fabIc || 'phone'; const f = FAB_ICONS.find((q) => q[0] === id); fab.innerHTML = id.startsWith('t:') ? `<b style="font-size:19px;font-weight:600;line-height:1">${esc(id.slice(2))}</b>` : (f ? f[1] : FAB_ICONS[0][1]); }
  const fabUI = () => { const cu = cfg.fabIc || 'phone'; return `<div class="xyp-h">悬浮窗图标</div><div class="xyp-fi">${FAB_ICONS.map((q) => `<span class="xyp-fic${cu === q[0] ? ' on' : ''}" data-act="fabic" data-id="${esc(q[0])}">${q[1]}</span>`).join('')}</div><div class="xyp-tip" style="padding:6px 14px 0">颜色（默认跟随主题）</div><div class="xyp-fi">${FAB_COLS.map((q) => `<span class="xyp-fic${(cfg.fabC || '') === q[0] ? ' on' : ''}" data-act="fabc" data-c="${q[0]}" title="${q[1]}" style="${q[0] ? 'background:' + q[0] + ';' : ''}font-size:12px">${q[0] ? '' : '跟随'}</span>`).join('')}</div><div class="xyp-f"><label>自定义</label><input id="xyp-fabt" maxlength="2" placeholder="一个字或表情，如 ♥ 🐶" value="${cu.startsWith('t:') && !FAB_ICONS.some((q) => q[0] === cu) ? esc(cu.slice(2)) : ''}"><span class="xyp-btn" data-act="fabt" style="margin:0">应用</span></div>`; };
  const pageTheme = (o) => {
    const all = [...BUILTIN, ...customTh.map((t) => ({ id: t.id, name: t.name || '自定义主题', desc: '导入的主题', sw: ['#888', '#ddd', '#fff'], custom: true }))];
    const cur0 = cfg.theme || 'orig';
    return `<div class="xyp-pg xyp-form"><div class="xyp-h">选择外观</div>${all.map((t) => `<div class="xyp-th" data-act="applyth" data-id="${esc(t.id)}"><div class="sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div><div class="m"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></div>${t.custom ? `<span class="xyp-btn" data-act="delth" data-id="${esc(t.id)}" style="margin:0">${o.delth === t.id ? '确认删除' : '删除'}</span>` : ''}<span class="ck">${t.id === cur0 ? '✓' : ''}</span></div>`).join('')}
${fabUI()}${decoHtml(o)}<div class="xyp-h">导入主题</div>
<div class="xyp-center"><span class="xyp-btn pri" data-act="impth">选择文件（.json / .css）</span><div class="xyp-tip" id="xyp-thmsg">${esc(o.msg || '')}</div></div>
<div class="xyp-f"><label>主题名</label><input id="xyp-th-name" placeholder="粘贴 CSS 时用"></div>
<div class="xyp-f"><label>CSS</label><textarea id="xyp-th-css" placeholder="直接粘贴主题的 CSS 代码"></textarea></div>
<div class="xyp-center"><span class="xyp-btn" data-act="pasteth">保存为主题</span></div>
<details style="padding:0 14px 20px"><summary class="xyp-tip" style="cursor:pointer">主题文件怎么写（想自己做主题的看这里）</summary><div class="xyp-code">JSON 格式：
{"name":"主题名","css":"……CSS 文本……"}
也可以直接导入一个 .css 文件，文件名就是主题名。

常用选择器（建议都写成 #xyp-win 开头，更不容易被默认样式盖掉）：
#xyp-win 整个手机窗口
.xyp-bar 顶部标题栏    .xyp-scr 内容区
.xyp-home 桌面   .xyp-clock 时间   .xyp-app 应用图标
.xyp-tabs 微信底部标签   .xyp-li 列表行
.xyp-av 头像   .xyp-row 一条消息   .xyp-bub 气泡
.xyp-row.me .xyp-bub 我的气泡
.xyp-comp 输入栏   .xyp-btn 按钮   .xyp-f 表单行
.xyp-card 备忘录卡片  .xyp-bal 钱包余额
.xyp-ph 相册照片  .xyp-call 通话记录</div></details></div>`;
  };
  const pageCp = () => `<div class="xyp-pg xyp-home"><div class="xyp-tip" style="text-align:center">翻看${esc(cName(getC('char')))}的手机。内容由 AI 按设定和剧情现编，翻看过的会保存。</div><div class="xyp-chips" style="justify-content:center"><label><input type="checkbox" data-cfgb="ghost" ${cfg.ghost ? 'checked' : ''}>无痕查看（${esc(cName(getC('char')))}不会知道你翻过手机、看过定位）</label></div>${cpStatus()}<div class="xyp-apps" data-ord="cp" style="margin-top:20px">${ordered(secKeys().concat('plock', '__all').map((k) => ({ k })), 'cp').map(({ k }) => k === 'plock' ? `<div class="xyp-app" data-act="sec" data-sec="plock"><i style="background:#ec4899">${plActive() ? '🔒' : '🔓'}</i><b>锁手机</b></div>` : k === '__all' ? `<div class="xyp-app" data-act="genall" data-sec="__all"><i style="background:#06b6d4">↻</i><b>${allBusy ? `生成中 ${allBusy.i}/${allBusy.n}` : '一键生成'}</b></div>` : `<div class="xyp-app" data-act="sec" data-sec="${k}"><i style="background:${SEC[k].bg}">${SEC[k].ico}</i><b>${SEC[k].n}</b></div>`).join('')}</div><div class="xyp-tip" style="text-align:center;margin-top:24px">长按图标可拖动调整顺序</div><div class="xyp-tip" style="text-align:center">「一键生成」会依次生成或刷新全部软件，约 ${secKeys().length} 次请求</div></div>`;

  const pageSec = (o) => {
    if (o.sec === 'plock') return pagePLock(o);
if ((o.sec === 'lue' || o.sec === 'video') && cfg.liveAdult === 'off') return '<div class="xyp-center" style="padding-top:70px"><div style="font-size:36px">🔞</div><div class="xyp-tip">R18内容已关闭，可在 设置 → R18内容 里开启</div></div>';
    if (secLocked(o.sec)) return `<div class="xyp-center" style="padding-top:70px"><div style="font-size:40px">🔒</div><div class="xyp-tip">手机被锁定，该软件暂时无法使用<br>剩余约 ${plLeft()}</div></div>`;
    const sec = o.sec; const S = SEC[sec]; const e = D().cp[sec]; const data = e && e.data;
    if (genBusy[sec]) return `<div class="xyp-center" style="padding-top:60px"><div class="xyp-dots"><span></span><span></span><span></span></div><div class="xyp-tip">正在生成……</div></div>`;
    let body = '';
    if (!data) body = `<div class="xyp-center" style="padding-top:50px"><div class="xyp-tip">还没有内容</div><span class="xyp-btn pri" data-act="gen" data-sec="${sec}">生成${S.n}</span>${genErr[sec] ? `<div class="xyp-sys">${esc(genErr[sec])}</div>` : ''}</div>`;
    else {
      try {
        if (sec === 'wechat') {
          const d = D(); const mine = (d.msgs.char || []);
          body = momRow('c') + `<div class="xyp-li" data-act="cpchat" data-i="-1">${av(uAv(), myNick())}<div class="m"><b>${esc(myNick())}</b><small>${mine.length ? esc(clip(mine[mine.length - 1].t, 30)) : '还没有聊天'}</small></div></div>` + (data.chats || []).map((c, i) => chatLocked(c.name) ? `<div class="xyp-li" style="opacity:.5">${av('', c.name)}<div class="m"><b>${esc(c.name)} 🔒</b><small>手机被锁定，无法联系</small></div></div>` : `<div class="xyp-li" data-act="cpchat" data-i="${i}">${av('', c.name)}<div class="m"><b>${esc(c.name)}</b><small>${esc(c.relation || '')}：${esc(clip(((c.msgs || [])[(c.msgs || []).length - 1] || {}).text, 24))}</small></div></div>`).join('');
        } else if (sec === 'wallet') {
          body = `<div class="xyp-bal">余额<b>¥ ${esc(data.balance)}</b></div>` + (data.items || []).map((x) => `<div class="xyp-call"><div>${esc(x.title)}<small>${esc(x.time || '')}${x.note ? ' · ' + esc(x.note) : ''}</small></div><span class="amt ${String(x.amount).trim().startsWith('+') ? 'in' : 'out'}">${esc(x.amount)}</span></div>`).join('');
        } else if (sec === 'usage') {
const hs = (data.hours || []).slice(0, 24).map(useNorm); const mx = Math.max(1, ...hs.map((v) => Number(v.f) || 0)); const sel = Number.isInteger(o.uh) ? o.uh : -1;
body = `<div class="xyp-card"><div class="tx">${esc(data.note || '')}</div><div style="display:flex;align-items:flex-end;gap:2px;height:96px;margin:10px 0 2px">${hs.map((v, i) => `<div data-act="usehr" data-h="${i}" title="${i}:00 约${v.m || 0}分钟" style="flex:1;height:100%;display:flex;align-items:flex-end;cursor:pointer"><div style="width:100%;background:currentColor;opacity:${i === sel ? 1 : .55};height:${Math.max(3, Math.round((Number(v.f) || 0) / mx * 100))}%"></div></div>`).join('')}</div><div style="display:flex;justify-content:space-between;font-size:10px;opacity:.6"><span>0时</span><span>6</span><span>12</span><span>18</span><span>23</span></div><div id="xyp-usedet" style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(128,128,128,.3)">${useDet(hs, sel)}</div></div>` + (data.apps || []).map((q) => `<div class="xyp-call"><div>${esc(q.name)}</div><span class="amt">${esc(q.min)}分钟</span></div>`).join('');
} else if (sec === 'notes') {
          body = (data.notes || []).map((n) => `<details class="xyp-card"><summary>${esc(n.title)}<small>${esc(n.time || '')}</small></summary><div class="tx">${esc(n.text)}</div></details>`).join('');
        } else if (sec === 'album') {
          body = `<div class="xyp-grid">${(data.photos || []).map((p) => `<div class="xyp-ph"><div class="pic">📷</div><p>${esc(p.caption)}<small>${esc(p.time || '')}${p.place ? ' · ' + esc(p.place) : ''}</small></p></div>`).join('')}</div>`;
        } else if (sec === 'lue') {
          body = (data.logs || []).map((x) => `<details class="xyp-card"><summary>${esc(x.time || '')}${x.dur ? ' · ' + esc(x.dur) : ''}${x.tool ? '<small>' + esc(x.tool) + '</small>' : ''}</summary>${x.fan ? `<div class="tx">想象：${esc(x.fan)}</div>` : ''}${x.proc ? `<div class="tx">${esc(x.proc)}</div>` : ''}</details>`).join('');
        } else if (sec === 'video') {
          body = (data.videos || []).map((x, i) => `<div class="xyp-card"><b style="font-size:14px">${esc(x.title)}</b><div class="tx" style="margin-top:4px">${esc(x.desc || '')}</div>${x.thought ? `<div class="tx" style="margin-top:6px">想法：${esc(x.thought)}</div>` : ''}<small>${esc(x.time || '')}</small><span class="xyp-btn" style="margin:8px 0 0;height:30px;line-height:30px;font-size:12px" data-act="vthought" data-i="${i}">${vBusy[i] ? '生成中……' : (x.thought ? '重新生成想法' : '生成TA的想法')}</span></div>`).join('');
        } else if (sec === 'calls') {
          body = (data.calls || []).map((c) => `<div class="xyp-call ${/未接/.test(c.type) ? 'miss' : ''}"><div><b style="font-weight:500">${esc(c.name)}</b><small>${esc(c.type)}${c.dur ? ' · ' + esc(c.dur) : ''}</small></div><small style="margin:0">${esc(c.time || '')}</small></div>`).join('');
        }
      } catch (er) { body = '<div class="xyp-sys">内容格式有误，请刷新</div>'; }
      body += `<div class="xyp-center"><span class="xyp-btn" data-act="gen" data-sec="${sec}">刷新（重新生成）</span>${genErr[sec] ? `<div class="xyp-sys">${esc(genErr[sec])}</div>` : ''}</div>`;
    }
    const vopt = sec === 'video' ? `<div class="xyp-chips"><span>生成项</span><label><input type="checkbox" data-vid="thought" ${cfg.vid && cfg.vid.thought ? 'checked' : ''}>看视频时的想法（也可在每条下单独生成）</label></div>` : '';
    const opt = sec === 'video' ? vopt : sec === 'lue' ? `<div class="xyp-chips"><span>生成项（越少越省）</span>${LUE.map(([k, n]) => `<label><input type="checkbox" data-lue="${k}" ${cfg.lue[k] ? 'checked' : ''}>${n}</label>`).join('')}</div>` : '';
    return `<div class="xyp-pg">${opt}${body}</div>`;
  };
  let call = null; let incoming = null;
  const fmtDur = (ms) => { const q = Math.floor(ms / 1000); return String(Math.floor(q / 60)).padStart(2, '0') + ':' + String(q % 60).padStart(2, '0'); };
  const pageCall = () => { const x = call && getC(call.id); if (!x) return '<div class="xyp-center" style="margin:40px">通话已结束</div>'; const bg = imgSrc(x.callBg);
    return `<div class="xyp-vcall" ${bg ? `style="background-image:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.6)),url('${esc(bg)}')"` : ''}><div class="xyp-ct">${av(cAv(x), cName(x), 'lg')}<b>${esc(cName(x))}</b><small>${call.mode === 'video' ? '视频通话' : '语音通话'} · <span id="xyp-ctm">${fmtDur(Date.now() - call.t0)}</span></small></div><div class="xyp-cl" id="xyp-cl"></div><div class="xyp-cc"><textarea id="xyp-cin" rows="1" placeholder="说点什么…"></textarea><label style="font-size:12px;color:#fff;display:flex;align-items:center;gap:2px;flex:none"><input type="checkbox" data-callmulti ${call.multi ? 'checked' : ''}>多发</label><button class="pri" data-act="callsend">${call.multi ? '接收' : '发送'}</button><button data-act="chup" class="dn">挂断</button></div></div>`; };
  const renderCall = () => { const el = $('xyp-cl'); if (!el || !call) return; el.innerHTML = call.log.map((q) => q.r === 'u' ? `<div class="xyp-cu">${esc(q.t)}</div>` : `<div class="xyp-cx">${esc(q.t).replace(/（[^）]*）|\([^)]*\)/g, (mm) => `<em>${mm}</em>`)}</div>`).join('') + (call.busy ? '<div class="xyp-cx"><em>……</em></div>' : '') + (call.err ? `<div class="xyp-sys">${esc(call.err)}</div>` : ''); el.scrollTop = el.scrollHeight; };
  const callTurn = async (hint) => {
    const x = getC(call.id); if (!x || call.busy) return; call.busy = true; call.err = ''; renderCall(); const u = myNick(); const k = knows(x); const story = k ? storyText(Number(cfg.ctxN) || 6, (Number(cfg.ctxN) || 6) * 400) : '';
    try {
      const sys = `你正在和「${u}」进行${call.mode === 'video' ? '视频' : '语音'}通话（${call.by === 'c' ? '你主动打过去的' : '对方打给你的'}）。` + (x.rel ? `你和对方的关系：${x.rel}。` : '') + '\n' + (x.isChar ? '角色设定：' + charCard() : (x.persona ? '人物设定：' + x.persona : '')) + (story ? `\n你知道的近期剧情：\n${story}` : '') + `\n每轮只输出你这一轮：先用（括号）写${call.mode === 'video' ? '你的动作、神态、镜头里能看到的环境' : '你的语气、呼吸、背景声音'}，再写你说的话；总共不超过90字；不要替${u}说话，不要旁白以外的说明；保持人设。`;
      const hist = call.log.map((q) => ({ role: q.r === 'u' ? 'user' : 'assistant', content: q.t })); if (!hist.length || hist[hist.length - 1].role !== 'user') hist.push({ role: 'user', content: hint || '（电话接通了，请你先开口）' });
      const out = String(await callAPI([{ role: 'system', content: sys }, ...hist], { max: 260, f: 'wx' })).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!out) throw new Error('对方没有回应'); call.log.push({ r: 'c', t: clip(out, 200) });
    } catch (e) { call.err = e.message || String(e); } finally { call.busy = false; renderCall(); }
  };
  const startCall = (id, mode, by) => { call = { id, mode, by, t0: Date.now(), log: [], busy: false }; go('call', { id }); callTurn(by === 'u' ? '（电话接通了，请你先开口）' : '（你拨出的电话被对方接起来了，请你先开口）'); };
  const endCall = () => {
    if (!call) return; const c = call; call = null; const x = getC(c.id); const dur = fmtDur(Date.now() - c.t0); const ml = c.mode === 'video' ? '视频' : '语音'; const u = myNick();
    if (x && c.log.length) { const sum = clip(c.log.filter((q) => q.t).slice(-8).map((q) => (q.r === 'u' ? u : cName(x)) + '：' + clip(q.t, 40)).join(' / '), 270); pushX(c.id, c.by, `${ml}通话，时长${dur}，内容摘要：${sum}`, 'call', { cs: 'done', cm: c.mode, dur }); { const full = clip(c.log.filter((q) => q.t).map((q) => (q.r === 'u' ? u : cName(x)) + '：' + clip(q.t, 50)).join(' / '), 320); pushEvent(`${u}与${cName(x)}通了${dur}的${ml}电话（${c.by === 'c' ? cName(x) + '打来' : u + '打去'}），通话内容：${full}`, !!x.isChar); } save(); }
    if (cur().p === 'call') back(); else render();
  };
  const ringIn = (x, mode) => {
    incoming = { id: x.id, mode }; const ml = mode === 'video' ? '视频' : '语音';
    showDlg(`<div class="bx xyp-ring"><b>${esc(cName(x))} 来电</b><p>邀请你${ml}通话</p><div class="bt"><span data-act="callno">拒绝</span><span class="ok" data-act="callyes">接听</span></div></div>`);
    incoming.tm = setTimeout(() => { if (incoming && incoming.id === x.id) { closeBox(); pushX(x.id, 'c', `${ml}通话，${cName(x)}打给${myNick()}，未接通`, 'call', { cs: 'miss', cm: mode }); incoming = null; save(); if (cur().p === 'chat' && cur().id === x.id) renderMsgs(); } }, 25000);
  };
  win.setInterval(() => { try { if (!winEl.classList.contains('on') || call || incoming || lockEl.classList.contains('on') || !dlgEl || dlgEl.classList.contains('on')) return; const cs = D().contacts.filter((x) => x.callOn && !x.isGroup); if (!cs.length || Math.random() > 0.12) return; ringIn(cs[Math.floor(Math.random() * cs.length)], Math.random() < 0.7 ? 'voice' : 'video'); } catch (e) { /* ignore */ } }, 45000);
  win.setInterval(() => { try { const t = $('xyp-ctm'); if (call && t) t.textContent = fmtDur(Date.now() - call.t0); } catch (e) { /* ignore */ } }, 1000);
  const pageCpChat = (o) => {
    const d = D(); let list; let who;
    if (o.i === -1) { list = (d.msgs.char || []).map((m) => ({ from: m.r === 'c' ? 'me' : 'them', text: m.t })); who = myNick(); } else { const c = ((d.cp.wechat || {}).data || {}).chats[o.i]; list = (c && c.msgs) || []; who = (c && c.name) || ''; }
    return `<div class="xyp-msgs">${list.map((m, li) => { const me = m.from === 'me'; return `<div class="xyp-row ${me ? 'me' : 'ot'}">${me ? av(cAv(getC('char')), cName(getC('char')), 'sm') : av(o.i === -1 ? uAv() : '', who, 'sm')}<div class="xyp-bub"${o.i !== -1 ? ` data-act="cpm" data-k="${li}"` : ''}>${esc(m.text)}</div></div>`; }).join('') || '<div class="xyp-center">没有内容</div>'}</div>${o.i !== -1 && !chatLocked(who) ? `<div class="xyp-comp"><textarea id="xyp-cpin" rows="1" placeholder="帮${esc(cName(getC('char')))}回复${esc(who)}…"></textarea><button data-act="cpreply" title="让对方回复">↻</button><button class="pri" data-act="cpsend">帮他发</button></div>` : ''}`;
  };
  // ===== p13：直播 / 钱包 / 定位 / 微信扩展 =====
  const LV = () => { const d = D(); return d.live || (d.live = { mode: 'normal', rooms: { normal: [], r18: [] } }); };
  const WAL_MAX = 10000000000;
  const W = () => { const d = D(); return d.wal || (d.wal = { bal: 1000, log: [] }); };
  const fmt$ = (n) => '¥' + (Math.round(n * 100) / 100).toLocaleString('en-US');
  const fmtT = (ts) => new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const adultOn = () => cfg.liveAdult !== 'off';
  const CHAT_GIFTS = [['奶茶', 30], ['玫瑰花', 20], ['巧克力', 60], ['红包', 200], ['鲜花束', 120], ['手表', 800]];
  const LIVE_GIFTS = [['小心心', 1], ['啤酒', 10], ['火箭', 100], ['跑车', 500], ['嘉年华', 1000], ['城堡', 2000]];
  const CGK = { chat: 'cgC', live: 'cgL' }; let cgKind = 'live';
  const cgArr = (k) => { const key = CGK[k]; if (!Array.isArray(cfg[key])) cfg[key] = []; return cfg[key]; };
  const gifts = (k) => (k === 'chat' ? CHAT_GIFTS : LIVE_GIFTS).concat(cgArr(k));
  const parseGift = (v) => { const m = String(v || '').trim().match(/^(.{1,10}?)[\s,，:：]+(\d{1,7})$/); return m ? [m[1].trim(), Number(m[2])] : null; };
  const pickGift = (k, title, fn) => { cgKind = k; pickBox(title, gifts(k), fn); const bt = dlgEl.querySelector('.bt'); if (bt) bt.insertAdjacentHTML('afterbegin', '<span data-act="cgmgr">自定义礼物</span>'); };
  const RK_POOL = ['夜航船', '山茶', '小满', '阿澈', '半糖', '雾岛', '月底见', '冬眠', '白日梦', '归鸟', '不眠', '柚子汽水', '迟到的雪', '鲸落', '云舒', '松子', '晚风', '栗子', '空白格', '追光'];
  const rkInit = (r) => { if (Array.isArray(r.rank)) return; const pool = RK_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 10); let sc = 800 + Math.floor(Math.random() * 3000); r.rank = pool.map((n) => { const v = { n, s: sc }; sc = Math.max(5, Math.floor(sc * (0.55 + Math.random() * 0.3))); return v; }); };
  const rkList = (r) => { rkInit(r); const me = Number(r.myTip) || 0; const all = r.rank.map((q) => ({ n: q.n, s: Number(q.s) || 0 })).concat(me > 0 ? [{ n: lvNick(), s: me, me: true }] : []); all.sort((a, b) => b.s - a.s || (a.me ? -1 : 0)); return all; };
  const rkShow = (r) => { const all = rkList(r); const mi = all.findIndex((q) => q.me); const top = all.slice(0, 10); showDlg(`<div class="bx"><b>🏆 打赏榜 · ${esc(r.name)}</b><div style="max-height:44vh;overflow-y:auto;text-align:left;margin:8px 0">${top.map((q, i) => `<div style="display:flex;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px;${q.me ? 'font-weight:700;background:rgba(128,128,128,.15)' : ''}"><span style="width:22px;opacity:.7">${i + 1}</span><span style="flex:1">${esc(q.n)}${q.me ? '（你）' : ''}</span><span>${q.s}</span></div>`).join('')}</div><div class="xyp-tip" style="text-align:center;padding:2px 0 6px">${mi >= 0 ? '你当前第 ' + (mi + 1) + ' 名，打赏 ' + all[mi].s : '你还没上榜，打赏礼物就会上榜'}</div><div class="bt"><span data-act="rkedit">编辑榜单</span><span class="ok" data-act="dlgno">关闭</span></div></div>`); };
  const rkEdit = (r) => { const all = rkList(r); const txt = all.slice(0, 20).map((q) => q.n + ' ' + q.s).join('\n'); showDlg(`<div class="bx"><b>编辑榜单</b><div class="xyp-tip" style="padding:4px 0">每行「名字 分数」；名字写成你的网名「${esc(lvNick())}」就是修改你自己的数值（删掉这行 = 没上榜）</div><textarea id="xyp-rk-in" rows="9" style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px;border:1px solid #ccc;border-radius:6px;font:inherit;font-size:13px;resize:none;background:transparent;color:inherit">${esc(txt)}</textarea><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="rksave">保存</span></div></div>`); };
  const giftMgr = () => { const a = cgArr(cgKind); showDlg(`<div class="bx"><b>自定义礼物</b><div class="xyp-tip" style="padding:4px 0">${cgKind === 'chat' ? '微信送礼' : '直播打赏'}用，可取名、改价格</div><div style="max-height:40vh;overflow-y:auto;text-align:left">${a.length ? a.map((g, i) => `<div style="display:flex;gap:8px;align-items:center;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px"><span style="flex:1">${esc(g[0])}　¥${g[1]}</span><span class="xyp-btn" data-act="cgedit" data-i="${i}" style="margin:0;height:28px;padding:0 10px;font-size:12px">编辑</span><span class="xyp-btn" data-act="cgdel" data-i="${i}" style="margin:0;height:28px;padding:0 10px;font-size:12px">删除</span></div>`).join('') : '<div class="xyp-tip" style="padding:14px 0;text-align:center">还没有自定义礼物</div>'}</div><div class="bt"><span data-act="cgadd">＋ 新增</span><span class="ok" data-act="dlgno">完成</span></div></div>`); };
  const tip = (m) => { toast.innerHTML = '<b>提示</b>' + esc(m); toast.dataset.id = ''; try { const op = winEl.classList.contains('on'); const r = (op ? winEl : fab).getBoundingClientRect(); if (op) { toast.style.top = Math.max(8, r.top + 52) + 'px'; toast.style.left = Math.max(8, r.left + 12) + 'px'; toast.style.right = ''; } else { const lf = r.left > win.innerWidth / 2; toast.style.top = Math.max(8, Math.min(r.top, win.innerHeight - 70)) + 'px'; toast.style.left = lf ? '' : (r.right + 8) + 'px'; toast.style.right = lf ? (win.innerWidth - r.left + 8) + 'px' : ''; } } catch (e) { /* ignore */ } toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 4000); };
  const spend = (p, why) => { const w = W(); if (w.bal < p) { tip('余额不足，请到「钱包」设置或充值'); return false; } w.bal -= p; w.log.unshift({ t: why, amt: -p, ts: Date.now() }); w.log.length = Math.min(w.log.length, 40); save(); return true; };
  const showDlg = (h) => { dlgFn = null; dlgNo = null; dlgTwo = 0; dlgEl.innerHTML = h; dlgEl.classList.add('on'); };
  const inputBox = (title, ph, fn, val) => { showDlg(`<div class="bx"><b>${esc(title)}</b><textarea id="xyp-dlg-in" rows="3" placeholder="${esc(ph)}" style="width:100%;box-sizing:border-box;margin:10px 0;padding:8px;border:1px solid #ccc;border-radius:6px;font:inherit;font-size:14px;resize:none;background:transparent;color:inherit">${esc(val || '')}</textarea><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="dlgok">确定</span></div></div>`); dlgFn = fn; setTimeout(() => { const i = $('xyp-dlg-in'); if (i) i.focus(); }, 50); };
  const pickBox = (title, items, fn, cols) => { showDlg(`<div class="bx"><b>${esc(title)}</b><div class="xyp-gl" style="grid-template-columns:repeat(${cols || 3},1fr);margin:12px 0 10px">${items.map((it, i) => `<span data-act="dlgpick" data-i="${i}">${esc(it[0])}${it[1] != null ? `<small>${typeof it[1] === 'number' ? '¥' + it[1] : esc(it[1])}</small>` : ''}</span>`).join('')}</div><div class="bt"><span data-act="dlgno">取消</span></div></div>`); dlgFn = fn; };
  const alertBox = (title, text) => { showDlg(`<div class="bx"><b>${esc(title)}</b><p>${esc(text)}</p><div class="bt"><span class="ok" data-act="dlgno">好</span></div></div>`); };
  const IC = {};
  const ico = (p, sz) => `<svg viewBox="0 0 24 24" width="${sz || 22}" height="${sz || 22}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  IC.mic = ico('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'); IC.pay = ico('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v.01M18 15v.01"/>'); IC.img = ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>', 16);
  IC.imgL = ico('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'); IC.stk = ico('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>');
  IC.timg = ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h5"/>'); IC.call = ico('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', 16); IC.callL = ico('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>');
  IC.gift = ico('<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M12 9v11M4 13h16M12 9c-3 0-5-1-5-3s3-2 5 3c2-5 5-5 5-3s-2 3-5 3"/>'); IC.pin = ico('<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'); IC.tgt = ico('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>');
  IC.gear = ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 18);
  const bubHTML = (m) => {
    if (m.k === 'voice') return `<span class="xyp-gi">〰</span>语音 ${Math.max(1, Math.min(60, Math.round(m.t.length / 3)))}″<div class="xyp-vt">${esc(m.t)}</div>`;
    if (m.k === 'gift') return `<span class="xyp-gi">礼</span>${esc(m.t)}`;
    if (m.k === 'loc') return `<span class="xyp-gi">位</span>${esc(m.t)}`;
    if (m.k === 'pay' || m.k === 'rp') return `<div class="${m.k === 'pay' ? 'xyp-pay' : 'xyp-rp'}"><div class="a"><span class="xyp-gi">${m.k === 'pay' ? '¥' : '红'}</span><b>${m.k === 'pay' ? '¥' + esc(m.amt) : '恭喜发财'}</b></div><small>${esc(m.note || (m.k === 'pay' ? '转账' : '大吉大利'))}</small><div class="s">${m.k === 'pay' ? '微信转账' : '微信红包'}${m.st === 'got' ? ' · ' + (m.k === 'pay' ? '已收款' : '已领取') : ' · 待' + (m.k === 'pay' ? '收款' : '领取')}</div></div>`;
    if (m.k === 'img' && m.st) return `<img class="xyp-stk" src="${esc(imgSrc(m.img))}" alt="表情包">`;
    if (m.k === 'img') return m.fl ? `<div class="xyp-fl">${IC.img}闪照${m.r === 'u' ? ' · ' + (m.seen ? '已被查看' : '未被查看') : ''}</div>` : `<img class="xyp-pic" src="${esc(imgSrc(m.img))}" alt="图片">`;
    if (m.k === 'timg') return m.img ? `<img class="xyp-pic" src="${esc(imgSrc(m.img))}" alt="${esc(m.t)}" title="${esc(m.t)}">` : `<div class="xyp-ti">${IC.img}${esc(m.t)}${m.ig ? '（生成中…）' : ''}</div>`;
    if (m.k === 'call') return `<div class="xyp-cd">${IC.call}<span>${esc(m.cs === 'rej' ? (m.cm === 'video' ? '视频' : '语音') + '通话 · 已拒绝' : m.cs === 'miss' ? (m.cm === 'video' ? '视频' : '语音') + '通话 · 未接通' : (m.cm === 'video' ? '视频' : '语音') + '通话 ' + esc(m.dur || ''))}</span></div>`;
    return esc(m.t);
  };
  const plusPanel = (o, x) => (!x || x.isGroup || dmOnly(x)) ? '' : `<div class="xyp-plus ${o.plus ? 'on' : ''}"><span data-act="vo">${IC.mic}<em>语音</em></span><span data-act="pay">${IC.pay}<em>转账红包</em></span><span data-act="img">${IC.imgL}<em>图片</em></span><span data-act="timg">${IC.timg}<em>文字图</em></span><span data-act="call">${IC.callL}<em>通话</em></span><span data-act="gift">${IC.gift}<em>送礼</em></span><span data-act="req">${IC.pin}<em>查位置</em></span><span data-act="sloc">${IC.tgt}<em>发定位</em></span><span data-act="regen">${SB.g}<em>重新生成</em></span></div>`;

  // ---- 直播 ----
  let liveBusy = false; let roomBusy = false;
  const roomOf = (id) => { const L = LV(); for (const m of ['normal', 'r18']) { const r = (L.rooms[m] || []).find((q) => q.cid === id); if (r) return r; } return null; };
  const liveCtx = (x) => { const r = roomOf(x.id); if (!r) return ''; return `你的直播间「${r.title}」，直播风格：${r.persona}。最近直播里发生的事：${clip(r.log.slice(-6).map((q) => q.t).join(' / '), 260)}`; };
  let lpF = false;
  { let lpT = null; let lpS = null; winEl.addEventListener('pointerdown', (e) => { const t = e.target.closest && e.target.closest('[data-lp]'); if (!t) return; lpF = false; lpS = { x: e.clientX, y: e.clientY }; clearTimeout(lpT); lpT = setTimeout(() => { lpF = true; const x = getC(t.dataset.id); if (!x) return; confirmBox('删除主播', '删除「' + cName(x) + '」和聊天记录？', () => { dropStreamer(x); const d = D(); d.contacts = d.contacts.filter((q) => q.id !== x.id); delete d.msgs[x.id]; Object.values(LV().rooms).forEach((a) => (a || []).forEach((r) => { if (r.cid === x.id) delete r.cid; })); save(); render(); }); }, 600); });
    winEl.addEventListener('pointermove', (e) => { if (lpS && Math.abs(e.clientX - lpS.x) + Math.abs(e.clientY - lpS.y) > 10) { clearTimeout(lpT); lpS = null; } });
    ['pointerup', 'pointercancel'].forEach((ev) => winEl.addEventListener(ev, () => clearTimeout(lpT))); }
  const streamerContact = (r) => {
    const d = D(); let x = r.cid && getC(r.cid);
    if (!x) { x = { id: 'l' + Date.now().toString(36) + Math.floor(Math.random() * 99), isChar: false, live: true, auto: true, name: r.name, remark: '', rel: '直播主播', persona: r.persona, pid: (profOf(r), r.pid), avatar: imgSrc(profOf(r).av), know: 'no' }; d.contacts.push(x); r.cid = x.id; save(); }
    if (!x.pid) { profOf(r); x.pid = r.pid; }
    x.real = profOf(r).real || '';
    return x;
  };
  const BUG = false;
  const NOFEM = BUG ? '【世界观】这个世界没有女性：主播、观众、被提到的所有人都是男性，不出现女性角色、女装、女性称呼，称呼与代词用他。' : '';
  const liveSys = (mode) => NOFEM + (mode === 'r18'
    ? '你为角色扮演故事里的世界模拟一个成人向文字直播平台（主播与观众均为虚构成年人，全程文字描写，可含性暗示或露骨的文字内容，不涉及未成年人与现实人物）。直播内容必须是明确的成人内容：主播直白地描写自己的身体、自慰与性行为、挑逗与淫语，观众弹幕露骨起哄、打赏点播更出格的玩法；不要含蓄回避，不要写成普通聊天或才艺直播。内容必须紧扣当前世界观与世界书设定，不要写成与设定无关的普通直播。' + (BUG ? '主播与观众都是雌虫，要出现虫族特有的元素（虫翼、触角、信息素、发情期、军雌/雌君/雌侍等称谓、虫族社会设定），并与世界书设定一致，不要写成普通人类直播。' : '')
    : '你为角色扮演故事里的世界模拟一个直播平台（日常、才艺、游戏、聊天等正常内容，文字描写）。') + '主播性格要多样（温柔、慵懒、俏皮、清冷、羞涩、撩人等），不要都粗犷豪放。' + (mode === 'r18' ? 'R18区的主播要妩媚勾人、挑逗诱惑、撒娇撩拨，说话和姿态都要勾引人，不要粗犷。' + (BUG ? '主播都是雌虫，带虫翼、触角、信息素等虫族元素。' : '') : '');
  const LV_O = { 'bg-f': '女主播，BG向（男攻女受，主播是受，面向男性观众）', 'bg-m': '男主播，BG向（男攻女受，主播是攻，面向女性观众）。台词要像真实男主播对着女观众直播：自然、有点撩，会逗弹幕、接话、满足观众点的要求，说话口语化；不要霸道总裁腔，不要叫“宝贝”“小东西”“小猫咪”这类称呼，不要命令口吻，也不要把观众当猎物或对象，写主播自己的表演和状态', 'gb-f': '女主播，四爱向（女攻男受，主播是攻，面向男性观众）', 'gb-m': '男主播，四爱向（女攻男受，主播是受，面向女性观众）', blg: '男主播，BL向，观众是攻、主播是受（软糯、被动或勾人的受）', bls: '男主播，BL向，观众是受、主播是攻（从容、有掌控感的攻）', blp: '男主播，BL向，主播攻受平衡（互相撩拨、势均力敌）' };
  const lvPicks = (n) => { if (BUG) return null; const g = cfg.lvG || 'any', o = cfg.lvO || 'rand'; const out = [];
    for (let i = 0; i < n; i++) { let t = o; if (t === 'rand' || !['bg', 'gb', 'blg', 'bls', 'blp'].includes(t)) { const pool = g === 'f' ? ['bg', 'bg', 'gb'] : ['bg', 'bg', 'gb', 'gb', 'blg', 'bls', 'blp']; t = pool[Math.floor(Math.random() * pool.length)]; }
      if (t === 'bg' || t === 'gb') { const sx = g === 'f' ? 'f' : g === 'm' ? 'm' : (Math.random() < 0.5 ? 'f' : 'm'); t = t + '-' + sx; } out.push(t); }
    return out; };
  const lvExtra = () => (!BUG && String(cfg.lvX || '').trim() ? '补充设定（必须遵守）：' + String(cfg.lvX).trim().slice(0, 200) + '。' : '');
  const pkTxt = (r) => (BUG ? '' : (r && r.pk && LV_O[r.pk] ? '这个直播间的定位：' + LV_O[r.pk] + '，主播的举止台词、弹幕观众的构成和口吻都要符合这个定位。无论主播是攻还是受，都要有主播的服务意识：会照顾观众、回应弹幕、满足观众的要求；攻体现在从容、有掌控感上，除非人设本来就是强势霸道型，否则不用命令口吻；任何人设都不要油腻、说教或怪异的台词。' : '') + lvExtra());
  let lvPrefOpen = false;
  const lvPrefUI = () => `<div class="xyp-f"><label>主播性别</label><select data-cfg="lvG"><option value="any" ${!cfg.lvG || cfg.lvG === 'any' ? 'selected' : ''}>不限</option><option value="f" ${cfg.lvG === 'f' ? 'selected' : ''}>只生成女主播</option><option value="m" ${cfg.lvG === 'm' ? 'selected' : ''}>只生成男主播</option></select></div>
<div class="xyp-f"><label>主播类型</label><select data-cfg="lvO"><option value="rand" ${!cfg.lvO || cfg.lvO === 'rand' ? 'selected' : ''}>随机</option><option value="bg" ${cfg.lvO === 'bg' ? 'selected' : ''}>BG</option><option value="gb" ${cfg.lvO === 'gb' ? 'selected' : ''}>GB</option><option value="blg" ${cfg.lvO === 'blg' ? 'selected' : ''}>BL 主攻</option><option value="bls" ${cfg.lvO === 'bls' ? 'selected' : ''}>BL 主受</option><option value="blp" ${cfg.lvO === 'blp' ? 'selected' : ''}>BL 平</option></select></div>
<div class="xyp-f"><label>补充设定</label><input data-cfg="lvX" value="${esc(cfg.lvX || '')}" placeholder="可选，如：偏古风 / 都是游戏主播；不写就不用"></div>
<div class="xyp-tip">选 BL 类型时主播固定为男：BL 主攻是观众为攻、主播是受，BL 主受是观众为受、主播是攻。改完后点「刷新直播列表」生效。</div>`;
  const genRooms = async () => {
    if (liveBusy) return; liveBusy = true; render();
    try {
      const L = LV(); const m = L.mode; L.hist = L.hist || [];
      const pool = m === 'r18' ? ['深夜私密聊天', '声音哄睡', '角色扮演', '情侣日常', '才艺表演', '健身拉伸', '情感电台', '换装试穿', '厨房擦边', '游戏陪玩', '舞蹈', '泳池海边'] : ['游戏', '唱歌', '深夜电台', '美食探店', '健身', '手工', '读书陪伴', '户外', '宠物', '绘画', '乐器', '学习自习', '聊天杂谈', '旅行', '烹饪', '街头', '科技数码', '脱口秀'];
      const pick = pool.slice().sort(() => Math.random() - 0.5).slice(0, 4).join('、');
      const avoid = L.hist.slice(-24).join('、'); const pk = lvPicks(4);
      const ask = () => callAPI([{ role: 'system', content: liveSys(m) + '只输出JSON，不要代码块和说明，文本里不要用英文双引号。每次都要换新的主播，昵称风格各异，不要重复用过的名字。' + (m === 'r18' ? '昵称要好听、色气、火热又有文艺感，基本都是两个字，4个里偶尔（最多一个）可以是三个字，风格像“弥夜”“炽潮”“烬羽”“染欲”，但不要照抄这几个，也不要用重复的字。' : '昵称要好听，有点文艺感。') },
        { role: 'user', content: `世界观与角色：\n${clip(charCard(), 600)}\n\n请生成4个当前在线的直播间，领域分别尽量取自：${pick}（随机组合，不必全用）。${pk ? '4个直播间的定位依次为：' + pk.map((k, i) => (i + 1) + '.' + LV_O[k]).join('；') + '。主播性别、性格、直播内容都要符合各自定位，并在persona里体现。无论攻受，主播都要有服务意识，不油腻不怪异。几个攻主播的人设要各不相同（如温柔体贴、从容稳重、嘴硬傲娇、阳光热情），强势霸道款最多出现一个，不要全是同一种。' : ''}${lvExtra()}${m === 'r18' ? '这是R18直播区：标题和直播内容必须是成人向的（擦边、挑逗、露骨表演类），不是普通日常。简介要用露骨直白的感官短句写出画面、动作、声音、道具，有色气、有画面感，像“生殖腔发情潮湿哒哒的抽插水声”“骑乘位扭腰榨精慢摇，一边浪叫一边……”这样，但不要照抄。' : ''}${avoid ? '以下昵称已用过，禁止再出现：' + avoid + '。' : ''}格式：{"rooms":[{"name":"主播昵称","real":"主播真名","tag":"分区标签，2到4个字，如舞蹈、游戏、电台","title":"直播间标题（不要带【】）","persona":"主播身份、性格、说话方式，40字内","desc":"正在直播的内容，一句话，写主播正在表演什么；不对观众说话、不下命令，不要出现“你”“进来”“帮我”","viewers":在线人数数字}]}` }], { max: 700, f: 'live', temp: 1.1, wbl: true });
      let out = await ask(); if (!/\{/.test(String(out).replace(/<think>[\s\S]*?<\/think>/g, ''))) { tip('生成失败，正在拉取第二次……'); out = await ask(); }
      if (!/\{/.test(String(out).replace(/<think>[\s\S]*?<\/think>/g, ''))) throw new Error('模型没有返回直播间，它说：' + clip(String(out).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim(), 40) + '（可能拒绝了内容，换个模型或重试）');
      const o = parseJSON(out); const a = (o.rooms || []).filter((r) => r && r.name).slice(0, 5);
      if (!a.length) throw new Error('没有生成出直播间，请重试');
      L.hist = L.hist.concat(a.map((r) => String(r.name))).slice(-40); L.rooms.keep = (L.rooms.keep || []).filter(keepIt).concat((L.rooms[m] || []).filter(keepIt).map((q) => ({ ...q, mode: q.mode || m }))).slice(-20); L.rooms[m] = a.map((r, ri) => ({ pk: (pk && pk[ri]) || '', id: 'r' + Math.random().toString(36).slice(2, 7), name: String(r.name), real: String(r.real || '').slice(0, 10), title: String(r.title || '').replace(/^【[^】]{1,8}】\s*/, ''), tag: String(r.tag || (String(r.title || '').match(/^【([^】]{1,8})】/) || [])[1] || '').replace(/[【】]/g, '').slice(0, 6), persona: String(r.persona || ''), desc: String(r.desc || ''), viewers: Number(r.viewers) || 100, log: [], mode: m })); save();
    } catch (e) { tip(e.message || e); } finally { liveBusy = false; if (winEl.classList.contains('on') && cur().p === 'live') render(); }
  };
  const vSlots = (m, r) => {
    const n = cfg.dmN === 'few' ? 2 : 4; const sh = (a) => a.slice().sort(() => Math.random() - 0.5);
    const sty = sh(['软萌黏人', '温柔体贴', '嘴贫爱抖机灵', '毒舌吐槽', '害羞小声', '老练从容', '傲娇嘴硬', '话痨', '冷淡简短']);
    let who; if (BUG) who = sh(['年轻雌虫', '军雌', '雌侍', '学生雌虫', '医师雌虫', '机修师雌虫', '商人雌虫']); else { const pk = r && r.pk; who = pk === 'bg-f' || pk === 'gb-f' ? sh(['男生', '男生', '男生', '女生']) : pk === 'bg-m' || pk === 'gb-m' ? sh(['女生', '女生', '女生', '男生']) : pk ? sh(['女生', '女生', '男生', '看不出性别']) : sh(['女生', '男生', '女生', '看不出性别', '女生', '男生']); }
    const sl = []; for (let i = 0; i < n; i++) sl.push((i + 1) + '.' + who[i % who.length] + '（' + sty[i % sty.length] + '）');
    return '本次弹幕依次来自：' + sl.join('；') + '。昵称和口吻要符合各自的身份和风格' + (BUG ? '，不要都是同一种粗犷口吻，不要都称呼“兄弟”“老哥”' : '，女生的昵称要有女生味（可爱、软萌、小众、有点梗），不要全像男生，少用“兄弟”“哥们”“老铁”“老哥”') + '。' + (m === 'r18' ? '每个人都要有明显的欲望，直白露骨，不能写成害羞、软弱、冷淡或只会夸奖（风格只影响说话方式，不降低露骨程度）。' : '');
  };
  const roomTurn = async (r, act) => {
    if (roomBusy) return; roomBusy = true; renderLog();
    try {
      const m = r.mode || LV().mode; const u = lvNick();
      let n = 0, newC = null, fed = 0;
      const clean = (ln) => ln.replace(/[*_`#>]/g, '').replace(/[（(]\s*\d+\s*[~～-]?\s*\d*\s*字\s*[）)]/g, '').replace(/^[\s\-•\d.、]+/, '').replace(/^[【\[「]?(画面|主播|弹幕)[^：:】\]」]{0,10}[】\]」]?[：:]/, '$1：').trim();
      const linesOf = (txt, fin) => { const t = String(txt).replace(/<think>[\s\S]*?<\/think>/g, ''); if (!fin && /<think>/.test(t)) return []; const a = t.split(/\n+/); if (!fin) a.pop(); return a.map(clean).filter(Boolean); };
      const feed = (ln) => { let q; if ((q = ln.match(/^画面[：:]\s*(.+)$/))) { const tx = q[1].trim(); if (!/^[（(]?\s*(不变|无变化|没变化|同上)/.test(tx)) { const qq = { k: 'c', t: tx }; r.log.push(qq); newC = qq; } n++; } else if ((q = ln.match(/^主播[：:]\s*(.+)$/))) { let tx = q[1]; if (/【关注】/.test(tx) || (!profOf(r).sf && claimsFollow(tx))) { tx = tx.replace(/【关注】\s*/g, '').trim(); setTimeout(() => sFollow(r), 800); } if (tx) { r.log.push({ k: 's', t: tx }); n++; } } else if ((q = ln.match(/^弹幕[：:]\s*(.+)$/))) { r.log.push({ k: 'v', t: q[1] }); n++; } };
      const pend = []; let pumpP = null; const pump = () => { if (pumpP) return; const pr = (async () => { while (pend.length) { feed(pend.shift()); renderLog(); if (pend.length) await new Promise((rs) => setTimeout(rs, ({ fast: [200, 250], mid: [450, 350], slow: [650, 500] }[cfg.lpace] || [450, 350])[0] + Math.random() * ({ fast: [200, 250], mid: [450, 350], slow: [650, 500] }[cfg.lpace] || [450, 350])[1])); } })(); pumpP = pr; pr.then(() => { if (pumpP === pr) pumpP = null; }); };
      const feedTxt = (txt) => { const ls = linesOf(txt, false); for (; fed < ls.length; fed++) pend.push(ls[fed]); pump(); };
      const out = await callAPI([{ role: 'system', content: liveSys(m) + `你扮演主播「${r.name}」（${r.persona}）和弹幕观众。只输出直播内容，每行以「画面：」「主播：」或「弹幕：昵称：内容」开头。先写1行「画面：」，第三人称描写镜头里主播此刻的样子、动作、表情和周围环境，${scTxt()}，随直播推进变化；如果画面相比之前没有明显变化，这一行只写「画面：不变」。再写主播1到2行，口语化，每行简短；主播的句式要多样，不要总是“……呀？”“……嘛”“呢”这种拖长音的撒娇反问，可以用陈述、感叹、吐槽、直接念出正在做的事，语气词少用，同一句式不要连续出现。弹幕${cfg.dmN === 'few' ? '1到2行' : '3到4行'}，路人昵称，不是${u}。弹幕要像真人观众随手打的：很短（多数不超过12个字）、口语、带情绪，可以有梗、错别字、重复刷屏、互相接话、给主播起外号、起哄，不要用“主播好棒”“666”“加油”这类套话，也不要每条都夸主播；每次的用词和句式都要变化，不重复上文出现过的。弹幕要说人话，自然不做作，不要油腻、不要尬撩、不要书面腔。${vSlots(m, r)}${pkTxt(r)}主播是在为直播间的观众表演、服务观众：回应弹幕、满足观众点的要求，写主播自己的表演和状态；不要对某个观众发号施令（如“进来帮我……”），也不要写成主播在对观众做什么、把观众当作被支配的对象；露骨程度和感官描写不降低。不要在文字里标注字数或写任何括号说明。${profOf(r).sf ? '' : `如果${u}请求主播关注他而主播同意，主播台词里单独写出【关注】才算真的关注。`}` + (m === 'r18' ? 'R18直播：内容必须是成人向，不得写成普通日常——画面、主播台词、弹幕都要有明确的性暗示或露骨的身体、动作、声音描写，弹幕直白色情但不油腻：像真实成年观众的露骨评论和索取，简短、有欲望感，不用“小骚货”“宝贝儿”“老公”这类油腻称呼，也不要土味情话；尺度随直播推进逐步升级；不回避、不打码、不转成正常话题。' : '') },
        { role: 'user', content: `直播间：${r.title}（${r.desc}）\n此前：\n${r.log.slice(-8).map((q) => q.t).join('\n') || '（刚开播）'}\n\n现在：${act}` }], { max: 560, f: 'live', onText: feedTxt, wbl: true });
      const all = linesOf(out, true);
      for (let i = fed; i < all.length; i++) pend.push(all[i]);
      fed = all.length; pump(); while (pumpP) await pumpP;
      if (!n) all.slice(0, 3).forEach((ln) => { r.log.push({ k: 's', t: ln }); n++; });
      if (!n) throw new Error('主播没有回应，请重试');
      r.err = '';
      if (newC && igReady()) { r.sc = (r.sc || 0) + 1; if ((!r.bg || r.sc >= 3) && !r.bgb) { r.bgb = 1; igGen(newC.t, { max: 1280, q: 0.88 }).then((id) => { r.bg = id; r.sc = 0; r.bgb = 0; save(); renderLog(); }).catch((e) => { r.bgb = 0; tip('生图失败，保留文字：' + (e.message || e)); }); } }
      if (r.log.length > 40) r.log = r.log.slice(-40); save();
    } catch (e) { r.err = String(e.message || e); tip(r.err); } finally { roomBusy = false; renderLog(); }
  };
  // ---- 直播视觉效果（纯前端，不用 token）----
  const fxBox = () => $('xyp-fx');
  const fxSet = (big) => (/th-bw|th-night/.test(winEl.className) ? ['♥', '✦', '★'].concat(big ? ['◆'] : []) : ['💖', '✨', '🎉'].concat(big ? ['🚀', '🏰'] : []));
  const spawn = (g, left, bottom) => { const b = fxBox(); if (!b || b.children.length > 60) return; const i = doc.createElement('i'); i.textContent = g; i.style.left = left + 'px'; if (bottom != null) i.style.bottom = bottom + 'px'; i.style.setProperty('--x', Math.round(Math.random() * 80 - 40) + 'px'); i.style.setProperty('--d', (1.3 + Math.random() * 0.9).toFixed(2) + 's'); i.style.fontSize = (16 + Math.random() * 14) + 'px'; b.appendChild(i); setTimeout(() => i.remove(), 2400); };
  const burst = (p) => { const b = fxBox(); if (!b) return; const n = p >= 500 ? 36 : p >= 100 ? 18 : 7; const set = fxSet(p >= 100); const w = b.clientWidth || 300; for (let k = 0; k < n; k++) setTimeout(() => spawn(set[Math.floor(Math.random() * set.length)], 12 + Math.random() * (w - 40)), k * 45); };
  const fly = (t) => { const b = fxBox(); if (!b || b.querySelectorAll('.xyp-fly').length > 8) return; const d = doc.createElement('div'); d.className = 'xyp-fly'; d.textContent = clip(t, 24); d.style.top = (58 + Math.floor(Math.random() * 6) * 24) + 'px'; d.addEventListener('animationend', () => d.remove()); b.appendChild(d); setTimeout(() => d.remove(), 7000); };
  winEl.addEventListener('click', (e) => { const l = e.target.closest && e.target.closest('#xyp-log'); const b = fxBox(); if (!l || !b) return; const r = b.getBoundingClientRect(); const g = fxSet(false)[0]; spawn(g, e.clientX - r.left - 8, r.bottom - e.clientY - 10); });
  win.setInterval(() => { try { const o = cur(); if (o.p !== 'room' || !winEl.classList.contains('on')) return; const r = (LV().rooms[o.m] || [])[o.i]; const el = $('xyp-vw'); if (!r || !el) return; r.viewers = Math.max(1, Math.round(r.viewers * (1 + (Math.random() * 0.07 - 0.03)))); el.textContent = r.viewers; } catch (e) { /* ignore */ } }, 3500);
  const applyRoomBg = (r) => { const bg = $('xyp-rbg'); const im = $('xyp-rimg'); if (!bg) return; const src = r && r.bg ? imgSrc(r.bg) : ''; if (bg.dataset.s !== src) { bg.dataset.s = src; bg.style.backgroundImage = src ? `url("${src}")` : ''; if (im) im.src = src; } scr.classList.toggle('rb', !!src); };
  const renderLog = () => {
    const el = $('xyp-log'); const o = cur(); if (!el || o.p !== 'room') return; const r = (LV().rooms[o.m] || [])[o.i]; if (!r) return;
    const keepTop = el.scrollTop; const nearBot = el.scrollHeight - el.clientHeight - el.scrollTop < 60; const force = renderLog.force; renderLog.force = false;
    el.innerHTML = r.log.map((q) => q.k === 'c' ? `<div class="xyp-sc">${esc(q.t)}</div>` : q.k === 's' ? `<div class="xyp-ls"><b>主播 ${esc(r.name)}</b>${esc(q.t)}</div>` : q.k === 'g' ? `<div class="xyp-lg">🎁 ${esc(q.t)}</div>` : q.k === 'u' ? `<div class="xyp-lv"><b>${esc(lvNick())}</b> ${esc(q.t)}</div>` : `<div class="xyp-lv"><b>弹幕</b> ${esc(q.t)}</div>`).join('') + (roomBusy ? `<div class="xyp-lv"><b>${r.log.length ? '……' : '正在进入直播间……'}</b></div>` : '') + (r.err && !roomBusy ? `<div class="xyp-sys">${esc(r.err)}　<span data-act="rretry" style="text-decoration:underline;cursor:pointer">重试</span></div>` : '');
    [...el.children].slice(-3).forEach((c) => c.classList.add('xypnew'));
    if (o.first && !o.topDone && r.log.length) { el.scrollTop = 0; o.topDone = 1; } else if (force || nearBot) el.scrollTop = el.scrollHeight; else el.scrollTop = keepTop;
    if (renderLog.id === r.id && r.log.length > (renderLog.n || 0)) r.log.slice(renderLog.n).forEach((q, i) => { if (q.k === 'v' || q.k === 'u') setTimeout(() => fly(q.t.replace(/^[^：:]{1,10}[：:]/, '')), i * 350); });
    applyRoomBg(r); renderLog.id = r.id; renderLog.n = r.log.length;
  };
  const autoOpen = (o) => {
    const r = (LV().rooms[o.m] || [])[o.i]; if (!r) return;
    if (!r.told || Date.now() - r.told > 1800000) { r.told = Date.now(); pushEvent(`${myNick()}私下在看直播间「${r.title}」（主播${r.name}）`); }
    profOf(r);
    if (!r.log.length && !roomBusy) roomTurn(r, '刚开播，向观众打招呼并介绍今天的内容');
  };
  const pageDms = () => { const l = D().contacts.filter((x) => x.live); return `<div class="xyp-pg">${l.length ? l.map((x) => { const ms = D().msgs[x.id] || []; const last = ms[ms.length - 1]; return `<div class="xyp-li" data-act="dmopen" data-id="${esc(x.id)}" data-lp="1">${av(cAv(x), cName(x))}<div class="m"><b>${esc(cName(x))}${x.unread ? `<span class="xyp-bdg">${x.unread}</span>` : ''}</b><small>${esc(last ? clip(String(last.t || ''), 24) : '还没聊过')}</small></div></div>`; }).join('') : '<div class="xyp-center" style="margin-top:30px;opacity:.6">还没有私信过主播</div>'}<div class="xyp-tip">点一下进入私聊，长按可删除主播</div></div>`; };

  const lvNick = () => (LV().me && LV().me.nick) || myNick();
  const lvAv = () => (LV().me && imgSrc(LV().me.avatar)) || uAv();
  const profOf = (r) => { const L = LV(); const P = L.prof || (L.prof = {}); if (!r.pid) r.pid = 'p' + Math.random().toString(36).slice(2, 8); const pf = P[r.pid] || (P[r.pid] = { remark: '', av: '', posts: [] }); pf.nm = r.name; pf.ps = clip(r.persona, 60); if (r.real && !pf.real) pf.real = r.real; pf.m = r.mode || 'normal'; if (pf.fans == null) { pf.fans = 300 + Math.floor(Math.random() * 30000); pf.fo = 3 + Math.floor(Math.random() * 300); } return pf; };
  const rAv = (r) => av(imgSrc(profOf(r).av), r.name, 'sm');
  const roomAt = (o) => (LV().rooms[o.m] || [])[o.i];
  let pfBusy = false, pfAvBusy = false;
  const genPosts = async (r, pf) => {
    if (pfBusy) return; pfBusy = true; if (cur().p === 'prof') render();
    try {
      const m = r.mode || 'normal'; let st = ''; if (cfg.lsync) { try { const t = storyText(2, 500); if (t && t.includes(r.name)) st = '\n\n正文近况（仅供参考）：\n' + t; } catch (e) { /* ignore */ } }
      const out = await callAPI([{ role: 'system', content: liveSys(m) + `你扮演主播「${r.name}」（${r.persona}），为直播软件的个人主页写动态。输出2条动态，每行一条，每条不超过40字，口语化、像真人随手发的，两条内容不同（日常碎碎念、直播预告、感谢粉丝、心情等），不要编号、引号和括号说明。` + (m === 'r18' ? 'R18主播的动态可以带撩人的暗示，但不要油腻。' : '') },
        { role: 'user', content: `直播间：${r.title}（${r.desc}）\n最近直播：${r.log.slice(-4).map((q) => q.t).join(' / ') || '（暂无）'}${st}` }], { max: 200, f: 'live' });
      const ls = String(out).replace(/<think>[\s\S]*?<\/think>/g, '').split(/\n+/).map((q) => q.replace(/^[\s\-•\d.、*#>]+/, '').replace(/^[「"“]|[」"”]$/g, '').trim()).filter(Boolean).slice(0, 3);
      if (!ls.length) throw new Error('没有生成出动态，请重试');
      const now = Date.now(); pf.posts = ls.map((t, i) => ({ t, ts: now - i })).concat(pf.posts || []).slice(0, 12); save();
    } catch (e) { tip(e.message || e); } finally { pfBusy = false; if (winEl.classList.contains('on') && cur().p === 'prof') render(); }
  };
  const pageMyLv = () => {
    const L = LV(); const me = L.me || {}; const P = Object.values(L.prof || {}).filter((q) => !q.gone); const fol = P.filter((q) => q.uf); const fan = P.filter((q) => q.sf); const mut = fol.filter((q) => q.sf); const ps = me.posts || [];
    const st = (k, n, l) => `<div data-act="mylist" data-k="${k}" style="cursor:pointer"><b>${l}</b>${n}</div>`;
    const pv = (k, n) => `<div class="xyp-f"><label>${n}</label><select data-lvpf="${k}"><option value="0" ${me[k] ? '' : 'selected'}>公开（其他人都能看到）</option><option value="1" ${me[k] ? 'selected' : ''}>私密（只有你能看到）</option></select></div>`;
    return `<div class="xyp-pg xyp-pf"><div class="xyp-pfc">${av(lvAv(), lvNick(), 'lg')}<div class="xyp-pfn">${esc(lvNick())}</div><div class="xyp-center" style="margin-top:2px"><span class="xyp-btn" data-act="upav" data-t="lvme">更换头像</span>${me.avatar ? '<span class="xyp-btn" data-act="clrav" data-t="lvme">恢复默认</span>' : ''}</div><div class="xyp-f" style="text-align:left;margin-top:10px"><label>网名</label><input data-lvme="nick" value="${esc(me.nick || '')}" placeholder="${esc(myNick())}"></div><div class="xyp-pfs">${st('fol', '关注', fol.length)}${st('fan', '粉丝', fan.length)}${st('mut', '互关', mut.length)}</div></div>
<div style="margin:12px 14px 0">${pv('privFol', '关注')}${pv('privFan', '粉丝')}</div>
<div class="xyp-pft"><span>我的动态</span><span><span class="xyp-btn" data-act="lvpost" style="margin:0 4px">发动态</span><span class="xyp-btn" data-act="mpcm" style="margin:0">生成评论</span></span></div>
<div class="xyp-pfl">${ps.length ? ps.map((p, i) => `<div class="xyp-pfp"><p>${esc(p.t)}</p>${(p.lk || []).length || (p.cm || []).length ? `<div class="xyp-pfc2">${(p.lk || []).length ? '♥ ' + p.lk.length : ''}${(p.cm || []).map((c) => `<div><b>${esc(c.w)}</b> ${esc(c.t)}</div>`).join('')}</div>` : ''}<small>${fmtT(p.ts)}　<span data-act="mpdel" data-i="${i}" style="cursor:pointer;text-decoration:underline">删除</span></small></div>`).join('') : '<div style="opacity:.55;font-size:13px;padding:6px 0 16px">还没有动态。互相关注的主播可以来评论点赞（点「生成评论」才会调用接口）</div>'}</div></div>`;
  };
  const pageProf = (o) => {
    const r = roomAt(o); if (!r) return '<div class="xyp-center">主播不存在</div>'; const pf = profOf(r); const ps = pf.posts || [];
    return `<div class="xyp-pg xyp-pf"><div class="xyp-pfc"><span class="xyp-pfe" data-act="pfedit" title="修改主播信息"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg></span>${av(imgSrc(pf.av), r.name, 'lg')}<div class="xyp-pfn">${esc(r.name)}</div>${pf.real ? `<div style="font-size:12px;color:var(--sub,#888);margin:-2px 0 6px">真名 ${esc(pf.real)}</div>` : ''}<span class="xyp-pfr" data-act="pfremark">${pf.remark ? esc(pf.remark) : '＋ 添加备注'}</span><div class="xyp-pfs"><div data-act="pflist" data-k="fans" style="cursor:pointer"><b>${fmtN(pf.fans + (pf.uf ? 1 : 0))}</b>粉丝</div><div data-act="pflist" data-k="fo" style="cursor:pointer"><b>${fmtN(pf.fo + (pf.sf ? 1 : 0))}</b>关注</div><div><b>${ps.length}</b>动态</div></div><div class="xyp-pfa"><span class="xyp-btn${pf.uf ? '' : ' pri'}" data-act="pffol">${pf.uf ? (pf.sf ? '互相关注' : '已关注') : '＋ 关注'}</span>${pf.sf && !pf.uf ? '<small>TA 关注了你</small>' : ''}</div></div>
<div class="xyp-f xyp-tog" style="margin:10px 14px 0"><div><div style="font-size:14px">主动发消息</div><div class="xyp-tip" style="padding:2px 0 0">开启后主播偶尔会私信你，用现成的短句，不调用接口、不耗 token</div></div><input type="checkbox" data-pfa="1" ${pf.amsg ? 'checked' : ''}></div>
<div class="xyp-pft"><span>主播动态</span><span data-act="pfrefresh" title="刷新动态" style="cursor:pointer;padding:2px 6px">${pfBusy ? '生成中…' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/></svg>'}</span></div>
<div class="xyp-pfl">${ps.length ? ps.map((q) => `<div class="xyp-pfp"><p>${esc(q.t)}</p><small>${fmtT(q.ts)}</small></div>`).join('') : '<div style="opacity:.55;font-size:13px;padding:6px 0 16px">暂无动态，点右上角刷新生成</div>'}</div></div>`;
  };
  const pfEditDlg = (r) => { const pf = profOf(r); const f = (id, lb, v, rows) => `<div style="font-size:12px;opacity:.7;margin-top:8px">${lb}</div>${rows ? `<textarea id="${id}" class="xyp-dlgi" rows="${rows}" style="margin:3px 0 0;resize:none">${esc(v)}</textarea>` : `<input id="${id}" class="xyp-dlgi" value="${esc(v)}" style="margin:3px 0 0">`}`;
    showDlg(`<div class="bx"><b>修改主播信息</b><div style="text-align:left;max-height:54vh;overflow-y:auto"><div id="xyp-pf-av" style="text-align:center;margin-top:8px">${av(imgSrc(pf.av), r.name, 'lg')}</div><div class="xyp-center" style="margin:6px 0"><span class="xyp-btn" data-act="upav" data-t="pfav">更换头像</span>${igReady() ? '<span class="xyp-btn" data-act="pfgen">生成头像</span>' : ''}</div>${f('xyp-pf-n', '网名', r.name)}${f('xyp-pf-real', '真名（和微信里的真名相同就是同一个人）', pf.real || '')}${f('xyp-pf-t', '直播间标题', r.title)}${f('xyp-pf-d', '直播间简介', r.desc)}${f('xyp-pf-v', '观看人数', String(r.viewers))}${f('xyp-pf-p', '人物设定', r.persona, 5)}${f('xyp-pf-r', '备注', pf.remark)}</div><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="pfsave">保存</span></div></div>`); };
  const fmtN = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n));
  const meD = () => { const L = LV(); return L.me || (L.me = {}); };
  const mutNow = (pf) => { if (pf.uf && pf.sf) { if (!pf.mts) pf.mts = Date.now(); } else pf.mts = 0; };
  const sFollow = (r) => { const pf = profOf(r); if (pf.sf) return; pf.sf = true; mutNow(pf); const x = streamerContact(r); x.rmf = 0; const t = r.name + '关注了你' + (pf.uf ? '，你们已互相关注' : ''); pushMsg(x.id, 'c', t, Date.now(), null, 'sys'); if (!(winEl.classList.contains('on') && cur().p === 'chat' && cur().id === x.id)) { x.unread = (x.unread || 0) + 1; notify(x, t); } save(); if (winEl.classList.contains('on') && (cur().p === 'prof' || cur().p === 'mylv')) render(); };
  const claimsFollow = (t) => /(关注|回关)了你|已(经)?(关注|回关)|关注你了|关注好了|回关了|已关注/.test(t) && !/(没|没有|不|未|不会|不想|才不|别)(要|想|能)?(关注|回关)/.test(t);
  const followX = (x) => { const L = LV(); const pid = x && x.pid; const pf = pid && L.prof && L.prof[pid]; if (!pf || pf.sf || pf.gone) return; for (const m of Object.keys(L.rooms)) { const r = (L.rooms[m] || []).find((q) => q.pid === pid); if (r) { sFollow(r); return; } } pf.sf = true; mutNow(pf); const t = x.name + '关注了你'; pushMsg(x.id, 'c', t, Date.now(), null, 'sys'); save(); };
  const openProfOf = (x) => { const L = LV(); for (const m of Object.keys(L.rooms)) { const i = (L.rooms[m] || []).findIndex((q) => q.pid === x.pid); if (i >= 0) { go('prof', { m, i }); return; } } const stub = { id: 'r' + Math.random().toString(36).slice(2, 7), name: x.name, title: '', persona: x.persona || '', desc: '', viewers: 0, log: [], pid: x.pid, mode: 'normal', real: x.real || '' }; (L.rooms.keep || (L.rooms.keep = [])).push(stub); save(); go('prof', { m: 'keep', i: L.rooms.keep.length - 1 }); };
  const upCtx = (pid) => { const L = LV(); const pf = L.prof && L.prof[pid]; const ps = (L.me && L.me.posts) || []; if (!pf || !(pf.uf && pf.sf) || !ps.length) return ''; const p = ps[0]; const c = (p.cm || []).find((q) => q.w === pf.nm); return `${myNick()}在直播软件发的最新动态：「${clip(p.t, 40)}」${c ? '，你评论了：「' + clip(c.t, 20) + '」' : (p.lk || []).includes(pf.nm) ? '，你点了赞' : ''}。\n`; };
  const keepIt = (q) => (q.cid && getC(q.cid)) || (q.pid && LV().prof && LV().prof[q.pid] && (LV().prof[q.pid].uf || LV().prof[q.pid].sf));
  let upBusy = false;
  const genUpCm = async () => {
    if (upBusy) return; if (cfg.upCm === false) { tip('已在省 token 里关闭'); return; } const L = LV(); const me = L.me || {}; const ps = me.posts || []; const ms = Object.values(L.prof || {}).filter((q) => q.uf && q.sf);
    if (!ps.length) { tip('还没有动态'); return; } if (!ms.length) { tip('还没有互相关注的主播'); return; }
    const jobs = [];
    ms.forEach((s) => { ps.slice(0, 5).forEach((p, pi) => { const old = s.mts && s.mts <= p.ts; if (!(old || cfg.upSee === 'all' || (pi === 0 && cfg.upSee !== 'none'))) return; if ((p.cm || []).some((c) => c.w === s.nm) || (p.lk || []).includes(s.nm)) return; jobs.push({ pi, s }); }); });
    if (!jobs.length) { tip('没有需要生成的新评论'); return; }
    const J = jobs.slice(0, 8); upBusy = true; tip('生成评论中…');
    try {
      const pis = [...new Set(J.map((j) => j.pi))]; const ss = [...new Set(J.map((j) => j.s))];
      const out = await callAPI([{ role: 'system', content: NOFEM + '你模拟直播软件里几位主播在观众「' + lvNick() + '」的动态下的互动。只输出JSON：{"c":[{"w":"主播名","p":动态序号,"t":"评论，25字内；只点赞就写空字符串"}]}。口语化，符合各自性格；评论要具体回应动态内容，不要套话，不要油腻。只针对下面列出的（主播→动态序号）组合。' }, { role: 'user', content: '主播：\n' + ss.map((s) => s.nm + '（' + s.ps + '）').join('\n') + '\n动态：\n' + pis.map((i) => i + '. ' + clip(ps[i].t, 80)).join('\n') + '\n组合：' + J.map((j) => j.s.nm + '→' + j.pi).join('，') }], { max: 400, f: 'live' });
      const o = parseJSON(out); let n = 0;
      (o.c || []).forEach((q) => { const j = J.find((z) => z.s.nm === String(q.w) && z.pi === Number(q.p)); if (!j) return; const p = ps[j.pi]; (p.lk || (p.lk = [])).push(j.s.nm); const t = String(q.t || '').trim(); if (t) (p.cm || (p.cm = [])).push({ w: j.s.nm, t: clip(t, 40), ts: Date.now() }); p.n = 0; n++; });
      save(); tip(n ? '已生成 ' + n + ' 条互动' : '没有生成内容，请重试');
    } catch (e) { tip(e.message || e); } finally { upBusy = false; if (winEl.classList.contains('on') && cur().p === 'mylv') render(); }
  };
  let lvSetOpen = false; winEl.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'xyp-lvset') lvSetOpen = e.target.open; }, true);
  const TK = [['cpKnow', '手机内容告知正文', 'off'], ['sync', '让正文知道小手机里的事', false], ['know', '小手机角色知晓正文（角色不读正文）', false], ['lsync', '直播内容连接正文', false], ['upSync', '用户动态连接正文', false], ['dmLink', '直播私聊与微信联通', false], ['momSync', '朋友圈连通正文', 'off'], ['wbMode', '世界书（不再附带）', 'off'], ['igOn', '生图', false], ['len', '回复长度改为「短」', 'short'], ['max', '最长输出降到 300', 300], ['scLen', '直播画面文字改为「短」', 'short'], ['proDm', '主播主动私信（全部关闭）', false], ['upCm', '老互关评论、点赞我的动态', false], ['dmN', '直播弹幕条数改为 1~2 行', 'few']];
  const tkOn = (k, off) => { const v = cfg[k]; if (k === 'max') return Number(v) > 300; if (k === 'cpKnow') return !!v && v !== 'off'; if (k === 'momSync') return v !== 'off'; if (k === 'wbMode') return !!v && v !== 'off'; if (k === 'len' || k === 'scLen') return v !== 'short'; if (k === 'dmN') return v !== 'few'; return !!v; };
  const tkDlg = () => showDlg(`<div class="bx"><b>省 token 模式</b><div class="xyp-tip" style="padding:4px 0">勾选的项会被关闭（不勾的保持不变），之后可一键恢复</div><div style="max-height:46vh;overflow-y:auto;text-align:left">${TK.map(([k, n, off]) => { const on = tkOn(k, off); return `<label class="xyp-wbr" style="display:flex;gap:8px;align-items:center;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px;${on ? '' : 'opacity:.45'}"><input type="checkbox" data-tk="${k}" ${on ? 'checked' : 'disabled'}><span style="flex:1">${n}${on ? '' : '（已是省的状态）'}</span></label>`; }).join('')}</div><div class="bt"><span data-act="dlgno">取消</span>${cfg.tkOld ? '<span data-act="tkrestore">恢复之前</span>' : ''}<span class="ok" data-act="tkapply">应用</span></div></div>`);
  const dmTpl = (m) => (m === 'r18' && adultOn() ? ['今晚想开一场特别的，你来不来', '刚洗完澡，在想你了', '睡不着，来陪我聊会儿嘛', '想让你看我今晚的直播'] : ['在吗？我今晚开播，来玩呀', '刚下播～想起你了', '好几天没见你来了，最近忙吗', '今天直播有点冷清，来捧个场嘛']);
  win.setInterval(() => { try { if (cfg.proDm === false) return; const L = LV(); if (!L.prof) return; D().contacts.forEach((x) => { const pf = x.live && x.pid && L.prof[x.pid]; if (!pf || !pf.amsg || Date.now() - (pf.lastP || 0) < 1800000 || Math.random() > 0.06) return; pf.lastP = Date.now(); const tl = dmTpl(pf.m); const t = tl[Math.floor(Math.random() * tl.length)]; pushMsg(x.id, 'c', t, Date.now()); if (winEl.classList.contains('on') && cur().p === 'chat' && cur().id === x.id) renderMsgs(); else { x.unread = (x.unread || 0) + 1; notify(x, t); } save(); }); } catch (e) { /* ignore */ } }, 60000);
  const nrm = (s) => String(s || '').trim().toLowerCase();
  const linkOf = (x) => { if (x.dmOf && getC(x.dmOf)) return getC(x.dmOf); if (x.wx && getC(x.wx)) return getC(x.wx); const rr = nrm(x.real); if (!rr) return null; return D().contacts.find((w) => w.id !== x.id && !w.isGroup && !w.isChar && nrm(w.real) === rr && !!w.live !== !!x.live) || null; };
  const nickFor = (x) => { if (x.isChar || x.kr) return uName(); if (dmOnly(x)) return (LV().me && LV().me.nick) || D().user.nick || '观众'; return D().user.nick || '用户'; };
  const dropStreamer = (x) => { if (!x || !x.live) return; if (x.pid && !linkOf(x)) { const L = LV(); const pf = (L.prof || {})[x.pid]; if (pf) delete L.prof[x.pid]; Object.keys(L.prof || {}).forEach((k) => { if (L.prof[k] && L.prof[k].gone) delete L.prof[k]; }); Object.keys(L.rooms).forEach((m) => { L.rooms[m] = (L.rooms[m] || []).filter((r) => r.pid !== x.pid); }); } };
  const tagOf = (r) => r.tag || ((String(r.title || '').match(/^【([^】]{1,8})】/) || [])[1] || '');
  const titleOf = (r) => String(r.title || '').replace(/^【[^】]{1,8}】\s*/, '');
  const tagChip = (r) => (tagOf(r) ? `<span class="xyp-tg">${esc(tagOf(r))}</span>` : '');
  const pageLive = () => {
    const L = LV(); if (L.mode === 'r18' && !adultOn()) L.mode = 'normal'; const rs = L.rooms[L.mode] || [];
    return `<div class="xyp-lvbar">${adultOn() ? `<div class="xyp-seg"><span data-act="livemode" data-m="normal" class="${L.mode === 'normal' ? 'on' : ''}">正常</span><span data-act="livemode" data-m="r18" class="${L.mode === 'r18' ? 'on' : ''}">R18</span></div>` : ''}</div><div class="xyp-center" style="margin:10px 0"><span class="xyp-btn" data-act="liverefresh" style="font-size:12px;line-height:1.5;height:auto;min-height:0;padding:5px 14px;display:inline-block;box-sizing:border-box">${liveBusy ? '生成中……' : '刷新直播列表'}</span>${BUG ? '' : `<span class="xyp-lvmenu${lvPrefOpen ? ' on' : ''}" data-act="lvpref" title="主播类型设置">☰</span>`}</div>${!BUG && lvPrefOpen ? `<div class="xyp-lvp">${lvPrefUI()}</div>` : ''}`
      + (rs.length ? rs.map((r, i) => `<div class="xyp-li" data-act="room" data-i="${i}">${av('', r.name)}<div class="m"><b>${esc(r.name)}${tagChip(r)}${r.cid && getC(r.cid) && getC(r.cid).friend ? '<span class="xyp-lc"></span>' : ''}</b><small>${esc(titleOf(r))} · ${esc(r.desc)}</small></div><small>${r.viewers}人</small></div>`).join('') : '<div class="xyp-center" style="margin-top:30px;opacity:.6">点上方「刷新直播列表」生成直播间</div>');
  };
  const pageRoom = (o) => {
    const r = (LV().rooms[o.m] || [])[o.i]; if (!r) return '<div class="xyp-center">直播间不存在</div>';
    return `<div class="xyp-rbg" id="xyp-rbg"></div><img class="xyp-rimg${cfg.igSave === false ? ' ns' : ''}" id="xyp-rimg" alt=""><span class="xyp-rvx" data-act="rzoom">返回弹幕</span>${cfg.igSave === false ? '' : '<span class="xyp-rvs" data-act="rsave">保存图片</span>'}<span class="xyp-zoom" data-act="rzoom" title="放大查看"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg></span><div class="xyp-rhead"><span id="xyp-rav" data-act="prof" title="主播主页">${rAv(r)}</span><div><b>${esc(titleOf(r))}</b><span class="xyp-lvb">LIVE</span><span class="xyp-rk" data-act="rrank">🏆 榜</span><small>${esc(r.name)}${tagChip(r)} · <span id="xyp-vw">${r.viewers}</span>人在看${(r.mode || o.m) === 'r18' ? ' · R18' : ''}</small></div></div><div class="xyp-fx" id="xyp-fx"></div><div class="xyp-msgs" id="xyp-log"></div><div class="xyp-lvbar"><span data-act="rmore">▶ 继续看</span><span data-act="rtip">🎁 打赏</span><span data-act="rdm">✉ 私信</span><i></i><span data-act="rrefresh" title="重新开播"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/></svg></span><span data-act="rtop" title="回到顶部">↑</span><span data-act="rbot" title="最新消息">↓</span></div><div class="xyp-comp"><textarea id="xyp-lin" rows="1" placeholder="发弹幕…"></textarea><button class="pri" data-act="rsend">发送</button></div>`;
  };
  // ---- 钱包 ----
  
const CPN = () => (typeof cpN === 'function' ? cpN() : cName(getC('char')));
const fcNames = () => (typeof ROSTER !== 'undefined' && ROSTER.length ? cpList() : [cName(getC('char'))]);
const FCg = (n) => { const d = D(); d.fc = d.fc || {}; const f = d.fc[n] || (d.fc[n] = { on: false, bal: 0, log: [], sal: false }); if (!f.bk) f.bk = { st: 0, bal: 0, log: [] }; return f; };
const numOf = (s) => { const m = String(s).match(/\d+(?:\.\d+)?/g); return m ? Number(m[m.length - 1]) : NaN; };
const fcTitle = (s) => String(s).replace(/[+\-¥￥元块]?\s*\d+(?:\.\d+)?\s*[元块]?\s*$/, '').trim().slice(0, 30);
const fcLog = (arr, t, amt) => { arr.unshift({ t, amt, ts: Date.now() }); arr.length = Math.min(arr.length, 40); };
const fcBusy = {};
const fcGen = async (n) => {
const f = FCg(n); if (!f.on || fcBusy[n]) return; fcBusy[n] = true; render();
try {
const u = myNick(); const old = f.log.slice(0, 6).map((q) => q.t + (q.amt >= 0 ? '+' : '') + q.amt).join('、');
const out = await callAPI([{ role: 'system', content: `你要列出角色「${n}」最近用亲情卡产生的收支，供${u}在钱包里查看。必须与近期剧情一致：剧情里出现过的消费必须收录；没有就按${n}的身份和习惯合理补0~3笔小额日常消费，不要与剧情矛盾，也不要重复已有记录。${f.sal ? n + '的工资已全部上交亲情卡，他只能花亲情卡里的钱；若剧情时间到了发薪日，可加一笔「工资」收入（+金额）。' : ''}只输出 JSON，不要代码块；文本里不要出现英文双引号。` },
{ role: 'user', content: `角色设定：\n${charCard()}\n\n近期剧情：\n${storyText(Number(cfg.ctxN) || 6, 1800) || '（暂无）'}\n\n卡内余额：${f.bal}\n已有记录：${old || '（无）'}\n输出格式：{"items":[{"title":"商家或事由","amount":"-28.50或+3000"}]}` }], { max: 600, f: 'cp' });
const o = parseJSON(out); const ev = [];
(o.items || []).slice(0, 5).forEach((it) => { let a = Number(String(it.amount).replace(/[^\d.+-]/g, '')); if (!isFinite(a) || !a) return; a = Math.round(a * 100) / 100; if (a < 0 && f.bal + a < 0) return; f.bal = Math.round((f.bal + a) * 100) / 100; fcLog(f.log, String(it.title || '').slice(0, 30), a); ev.push(`${it.title}${a > 0 ? '+' : ''}${a}`); });
if (ev.length) pushEvent(`${n}用亲情卡产生了这些收支：${ev.join('、')}`, 1); else tip('没有新的消费'); save();
} catch (e) { tip('生成失败：' + clip(e.message || String(e), 30)); } finally { fcBusy[n] = false; render(); }
};
const chatIdOf = () => { const c = CPN(); const x = D().contacts.find((q) => { try { return cName(q) === c; } catch (e) { return false; } }); return x ? x.id : 'char'; };
const chatHours = () => { const m = {}; const t0 = new Date(); (D().msgs[chatIdOf()] || []).forEach((q) => { if (q.k === 'sys' || !q.ts) return; const t = new Date(q.ts); if (t.toDateString() !== t0.toDateString()) return; const h = t.getHours(); (m[h] || (m[h] = [])).push(('0' + h).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2)); }); return m; };
const usageHint = () => { const m = chatHours(); const u = myNick(); const ks = Object.keys(m); return '\n补充要求：1) 微信一般每天都会用（和同事、朋友、家人发消息等），apps 里必须有微信；2) ' + (ks.length ? `${u}与你今天在微信里聊过天，时间是 ${ks.map((h) => m[h].join('、')).join('、')}，这些时段你一定用过微信，hours 里对应小时的 a 必须写微信、d 写和${u}聊天；` : `${u}今天没有在微信里和你聊天；`) + '3) hours 必须正好24项，d 控制在15字内。'; };
const usageFix = (o, sec) => {
if (sec !== 'usage' || !o) return o; const u = myNick(); const m = chatHours();
let hs = Array.isArray(o.hours) ? o.hours.slice(0, 24) : []; while (hs.length < 24) hs.push(0);
hs = hs.map((v) => (v && typeof v === 'object' ? { f: Math.max(0, Math.min(10, Number(v.f) || 0)), m: Math.max(0, Number(v.m) || 0), a: String(v.a || ''), d: String(v.d || '') } : { f: Math.max(0, Math.min(10, Number(v) || 0)), m: 0, a: '', d: '' }));
let wx = 0; Object.keys(m).forEach((k) => { const h = hs[Number(k)]; if (!h) return; if (!/微信/.test(h.a)) { h.a = h.a ? '微信、' + h.a : '微信'; } if (!/聊|微信/.test(h.d)) h.d = `和${u}聊微信`; h.f = Math.max(h.f, 2); h.m = Math.max(h.m, 3); wx += h.m; });
o.hours = hs; o.apps = Array.isArray(o.apps) ? o.apps : [];
if (!o.apps.some((q) => /微信/.test(q.name))) o.apps.unshift({ name: '微信', min: String(Math.max(wx, 8)) });
return o;
};
const fcTake = (out, x) => { try { const n = cName(x); if (!(x.isChar || fcNames().indexOf(n) >= 0)) return out; if (!/【亲情卡[^】]*】/.test(String(out))) return out; giveBk(n); return String(out).replace(/【亲情卡[^】]*】/g, '').trim() || '给你了'; } catch (e) { return out; } };
const fcChatRule = (x) => { try { const n = cName(x); if (!(x.isChar || fcNames().indexOf(n) >= 0)) return ''; const f = FCg(n); if (f.bk.st === 2) return ''; const l = (D().msgs[x.id] || []).slice(-4); if (!l.some((q) => /亲情卡|副卡/.test(q.t || ''))) return ''; return `如果${myNick()}向你要亲情卡（花你的钱），你同意就一定要给：在回复里单独写一句【亲情卡】，再配一句自然的话，系统看到这个标记才会真的把卡给他；不同意就明确拒绝。绝对不要答应了却不写【亲情卡】。`; } catch (e) { return ''; } };
const cpBucketOf = (n) => { const d = D(); return (typeof ROSTER !== 'undefined' && ROSTER.length && n !== ROSTER[0].n) ? ((d.cps || {})[n] || {}) : d.cp; };
const bkTick = (n, f) => { const b = f.bk; if (b.st !== 2 || !b.inc) return; const day = 86400000; let k = Math.min(30, Math.floor((Date.now() - (b.ts || Date.now())) / day)); if (k <= 0) return; b.ts = (b.ts || Date.now()) + k * day; const add = b.inc * k; b.bal = Math.round((b.bal + add) * 100) / 100; fcLog(b.log, '保底收入', add); if (b.dry && b.bal >= 1) { b.dry = false; pushEvent(`${n}的钱包里又有钱了，亲情卡可以继续用`, 1); } save(); };
const bkAuto = (n, f) => { const b = f.bk; if (b.st === 2 && cfg.url && cfg.url.trim() && Date.now() - (b.gts || b.ts || 0) > 3 * 86400000) bkGen(n, true); };
const giveBk = async (n) => {
const f = FCg(n); if (f.bk.st === 2) return; const u = myNick(); let bal = NaN;
try { const w = cpBucketOf(n).wallet; if (w && w.data && w.data.balance != null) bal = numOf(String(w.data.balance).replace(/,/g, '')); } catch (e) {  }
if (!isFinite(bal)) { try { const out = await callAPI([{ role: 'system', content: '根据角色的身份、收入和剧情，估计他此刻钱包里的大致余额（人民币）。只输出一个数字，不要说明。' }, { role: 'user', content: `角色：${n}\n设定：\n${clip(charCard(), 1200)}\n\n近期剧情：\n${storyText(3, 1000) || '（暂无）'}` }], { max: 40, f: 'cp' }); bal = numOf(out); } catch (e) {  } }
if (!isFinite(bal) || bal < 0) bal = 10000; bal = Math.round(bal * 100) / 100;
f.bk = { st: 2, bal, bal0: bal, log: [], inc: Math.max(30, Math.round(bal * 0.2)), ts: Date.now(), gts: Date.now(), dry: false }; fcLog(f.bk.log, '收到亲情卡', 0);
pushEvent(`${n}把自己的亲情卡给了${u}，不限额，${u}可以花${n}的钱，直到${n}的钱花完为止`, 1); save(); tip(n + '给了你亲情卡'); render();
};
const bkBusy = {};
const bkGen = async (n, silent) => {
const f = FCg(n); const b = f.bk; if (b.st !== 2 || bkBusy[n]) return; bkBusy[n] = true; b.gts = Date.now(); if (!silent) render();
try {
const u = myNick(); const out = await callAPI([{ role: 'system', content: `你要按角色设定和近期剧情，写出「${n}」最近一段时间的收入（工资、奖金、任务报酬、分红、外快等），供${u}花他的钱时参考。金额必须符合他的身份、职业和剧情里的时间长度：该发工资时按他的真实薪资水平算，不要太少也不要夸张；剧情里出现过的收入必须收录；确实没有合理收入就返回空数组。只输出 JSON，不要代码块；文本里不要出现英文双引号。` },
{ role: 'user', content: `角色设定：\n${charCard()}\n\n近期剧情：\n${storyText(Number(cfg.ctxN) || 6, 1800) || '（暂无）'}\n\n他现在可用的钱：${b.bal}\n最近收入记录：${b.log.filter((q) => q.amt > 0).slice(0, 4).map((q) => q.t + '+' + q.amt).join('、') || '（无）'}\n输出格式：{"items":[{"title":"收入来源","amount":"+8000"}]}` }], { max: 500, f: 'cp' });
const o = parseJSON(out); const ev = [];
(o.items || []).slice(0, 4).forEach((it) => { const a = Math.round(Math.abs(Number(String(it.amount).replace(/[^\d.]/g, ''))) * 100) / 100; if (!isFinite(a) || !a || a > 100000000) return; if (f.sal && f.on) { f.bal = Math.round((f.bal + a) * 100) / 100; fcLog(f.log, String(it.title || '工资').slice(0, 30) + '（上交）', a); ev.push(`${it.title}+${a}（已上交亲情卡）`); return; } b.bal = Math.round((b.bal + a) * 100) / 100; fcLog(b.log, String(it.title || '收入').slice(0, 30), a); ev.push(`${it.title}+${a}`); });
if (b.bal >= 1 && b.dry) { b.dry = false; pushEvent(`${n}有新的收入了，亲情卡可以继续用`, 1); }
if (ev.length) pushEvent(`${n}的收入：${ev.join('、')}`, 1); else if (!silent) tip('暂时没有新的收入'); save();
} catch (e) { if (!silent) tip('生成失败：' + clip(e.message || String(e), 30)); } finally { bkBusy[n] = false; render(); }
};
const dryNotify = (n) => { const u = myNick(); const b = FCg(n).bk; b.dry = true; pushEvent(`${n}的钱被${u}刷光了，亲情卡暂时不能再用，要等${n}钱包里又有钱`, 1); try { const cx = D().contacts.find((q) => { try { return cName(q) === n; } catch (e) { return false; } }); if (cx) { pushMsg(cx.id, 'c', '亲情卡里我的钱已经花完了，暂时刷不了了，等我有钱了再说。', Date.now()); cx.unread = (cx.unread || 0) + 1; notify(cx, '亲情卡里我的钱已经花完了'); } } catch (e) {  } };
const useNorm = (v) => (v && typeof v === 'object' ? v : { f: Number(v) || 0, m: 0, a: '', d: '' });
const useDet = (hs, sel) => { const H = sel >= 0 ? hs[sel] : null; const tot = hs.reduce((s2, v) => s2 + (Number(v.m) || 0), 0); return H ? `<b>${sel}:00 – ${sel + 1}:00</b><div style="margin-top:4px;opacity:.9">使用频率 ${H.f}/10 · 约 ${H.m || 0} 分钟${H.a ? ' · ' + esc(H.a) : ''}</div>${H.d ? `<div style="opacity:.9">${esc(H.d)}</div>` : ''}` : `<div style="font-size:12px;opacity:.6">${'ontouchstart' in win ? '点' : '点一下或把鼠标移到'}柱子上，查看那个小时的使用时长${tot ? '（全天约 ' + tot + ' 分钟）' : ''}</div>`; };
const useHrs = () => { try { const b = (typeof cpB === 'function') ? cpB(D()) : D().cp; const dt = b.usage && b.usage.data; return dt && Array.isArray(dt.hours) ? dt.hours.slice(0, 24).map(useNorm) : null; } catch (e) { return null; } };
root.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-act="usehr"]'); if (!t) return; const el = $('xyp-usedet'); const hs = useHrs(); if (el && hs) el.innerHTML = useDet(hs, Number(t.dataset.h)); });
root.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-act="usehr"]'); if (!t) return; if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-act="usehr"]')) return; const el = $('xyp-usedet'); const hs = useHrs(); if (el && hs) { const o = cur(); el.innerHTML = useDet(hs, Number.isInteger(o.uh) ? o.uh : -1); } });
const fcScan = (mid) => { try { const cx = getCtx(); const m = cx && cx.chat && cx.chat[typeof mid === 'number' ? mid : cx.chat.length - 1]; if (!m || m.is_user || !/【亲情卡】/.test(String(m.mes || ''))) return; const ns = fcNames(); const hit = ns.filter((n) => String(m.mes).indexOf(n) >= 0 && FCg(n).bk.st !== 2); const n = hit[0] || ns.find((q) => FCg(q).bk.st !== 2); if (n) giveBk(n); } catch (e) {  } };
const payCards = () => fcNames().filter((n) => { const b = FCg(n).bk; return b.st === 2 && !(b.dry && b.bal < 1); });
const payPref = (app) => { const w = W(); return (w.pd && w.pd[app]) || 'own'; };
const payDo = (src, p, why) => {
if (src === 'own') return spend(p, why);
const n = src.slice(3); const f = FCg(n); const u = myNick(); bkTick(n, f);
if (f.bk.dry && f.bk.bal < 1) { tip(n + '的钱花完了，亲情卡暂时不能用'); bkGen(n, true); return false; }
if (f.bk.bal < p) { tip(n + '的钱不够这笔了（余额¥' + f.bk.bal + '）'); if (f.bk.bal < 1) dryNotify(n); return false; }
f.bk.bal = Math.round((f.bk.bal - p) * 100) / 100; fcLog(f.bk.log, why, -p);
pushEvent(`${u}刷了${n}的亲情卡，花了¥${p}（${clip(why, 24)}），${n}知道这笔`, 1); if (f.bk.bal < 1) dryNotify(n); save(); return true;
};
const payWith = (app, p, why, then) => {
const cards = payCards(); const pf = payPref(app); const go = (src) => { if (payDo(src, p, why)) then(src); };
if (!cards.length || pf === 'own') { go('own'); return; }
if (pf === 'fc') { if (cards.length === 1) { go('fc:' + cards[0]); return; } pickBox('用谁的亲情卡付款 ¥' + p, cards.map((n) => [n]), (i) => go('fc:' + cards[i]), 2); return; }
pickBox('用哪张卡付款 ¥' + p, [['自己的卡']].concat(cards.map((n) => [n + '的亲情卡'])), (i) => go(i === 0 ? 'own' : 'fc:' + cards[i - 1]), 2);
};
const payHtml = () => { const ps = [['live', '直播打赏'], ['wx', '微信转账 / 红包 / 礼物'], ['shop', '购物']]; const opts = [['own', '自己的卡'], ['fc', '亲情卡'], ['ask', '每次询问']]; return '<div class="xyp-h">默认付款方式</div><div class="xyp-tip">花钱时用自己的卡，还是用TA给你的亲情卡（花TA的钱）。没有拿到亲情卡时一律用自己的卡。</div>' + ps.map((q) => `<div style="padding:4px 14px 6px"><small style="opacity:.7">${q[1]}</small><div style="margin-top:3px">${opts.map((o) => `<span class="xyp-btn${payPref(q[0]) === o[0] ? ' pri' : ''}" data-act="paydef" data-app="${q[0]}" data-v="${o[0]}">${o[1]}</span>`).join('')}</div></div>`).join(''); };
const logOpen = {};
const lgHtml = (arr, key, clr, n, w) => { if (!arr.length) return ''; const all = !!logOpen[key]; const rows = (all ? arr : arr.slice(0, 10)).map((q) => `<div class="xyp-li"><div class="m"><b>${esc(q.t)}</b><small>${fmtT(q.ts)}</small></div><b>${q.amt >= 0 ? '+' : '-'}${fmt$(Math.abs(q.amt))}</b></div>`).join(''); const sb = 'margin:0 6px 0 0;height:26px;line-height:26px;padding:0 10px;font-size:12px'; return rows + `<div class="xyp-center" style="padding:6px 0">${arr.length > 10 ? `<span class="xyp-btn" style="${sb}" data-act="logmore" data-k="${key}">${all ? '收起' : '展开全部（' + arr.length + '条）'}</span>` : ''}<span class="xyp-btn" style="${sb}" data-act="${clr}" data-n="${esc(n || '')}" data-w="${w || 0}">清空明细</span></div>`; };
const fcRule = () => {
const d = D(); const u = myNick(); const ls = [];
fcNames().forEach((n) => { const f = d.fc && d.fc[n]; if (!f) return;
if (f.on) ls.push(`${u}给${n}开了亲情卡（卡内余额¥${f.bal}）${f.sal ? `，${n}的工资全部上交这张卡，${n}只能花卡里的钱，不够就向${u}开口` : ''}；${u}能在钱包里看到${n}的每笔消费，正文里${n}买了东西也会记进去`);
if (f.bk && f.bk.st === 2) { bkTick(n, f); ls.push(`${u}持有${n}的亲情卡，可以花${n}的钱（不限额，花到${n}的钱花完为止，${n}的收入按他的职业和剧情来，有收入时会恢复）${f.bk.dry ? `；现在${n}的钱已经花完了，亲情卡暂时不能用，要等${n}钱包里又有钱` : ''}；${n}会知道${u}花了他的钱，钱花完时会提醒${u}`); }
else ls.push(`${u}可以在正文或微信里向${n}要亲情卡；${n}无论是主动给，还是被${u}要了之后同意给，都必须真的给：正文里明确写出把亲情卡交给${u}，并在那一段末尾另起一行写【亲情卡】，系统看到这个标记才会真的把卡给${u}`); });
if (!ls.length) return '';
const sig = ls.join('|'); let k; if (d.fcSig === sig) k = d.fcN = (d.fcN || 0) + 1; else { d.fcSig = sig; k = d.fcN = 0; }
if (k !== 0 && k % 10 !== 0) return '';
return '【亲情卡】\n' + ls.join('\n');
};
const fcHtml = () => {
const u = myNick();
return '<div class="xyp-h">亲情卡</div><div class="xyp-tip">给TA开亲情卡，就能看到TA买了什么；开「工资上交」后TA只能花卡里的钱。也可以在正文或微信里找TA要亲情卡，花TA的钱。每位角色各自一张。</div>' + fcNames().map((n) => {
const f = FCg(n); const lg = (l, w) => lgHtml(l, 'fc' + n + w, 'fcx_clr', n, w);
const b = (a, t, x) => `<span class="xyp-btn${x ? ' pri' : ''}" data-act="${a}" data-n="${esc(n)}">${t}</span>`;
let h = `<div class="xyp-card" style="padding:10px 12px"><b>${esc(n)}</b>`;
if (!f.on) h += `<div style="opacity:.65;margin:6px 0">还没给TA开亲情卡</div>` + b('fcx_open', '开通亲情卡', 1);
else h += `<div style="font-size:22px;margin:6px 0">${fmt$(f.bal)}<small style="opacity:.6;font-size:12px"> 卡内余额${f.sal ? ' · 工资上交中' : ''}</small></div><div class="xyp-center">${b('fcx_gen', fcBusy[n] ? '生成中…' : '刷新消费', 1)}${b('fcx_rec', '记一笔')}${b('fcx_add', '充值')}${b('fcx_sal', f.sal ? '取消工资上交' : '工资上交')}${b('fcx_close', '收回')}</div>${f.log.length ? lg(f.log, 0) : ''}`;
h += `<div style="margin-top:10px;border-top:1px solid rgba(128,128,128,.25);padding-top:8px"><small style="opacity:.65">${esc(n)}的亲情卡（花TA的钱）</small>`;
if (f.bk.st === 2) { bkTick(n, f); bkAuto(n, f); h += `<div style="font-size:20px;margin:4px 0">${fmt$(f.bk.bal)}<small style="opacity:.6;font-size:12px"> ${esc(n)}的可用余额 · 不限额，花完为止${f.bk.dry ? ' · 已花完，暂不能用' : ''}</small><div style="font-size:12px;opacity:.65">每日保底收入 ${fmt$(f.bk.inc || 0)}（可自己改）</div></div><div class="xyp-center">${b('fcx_swipe', '刷卡', !f.bk.dry)}${b('fcx_inc', bkBusy[n] ? '结算中…' : '刷新TA的收入')}${b('fcx_incset', '保底收入')}${b('fcx_incdef', '恢复默认')}${b('fcx_bkc', '归还')}</div>${f.bk.log.length ? lg(f.bk.log, 1) : ''}`; }
else h += `<div style="margin:4px 0;opacity:.75;font-size:12.5px">他还没给你亲情卡，可等他主动给，或在正文 / 微信里找他要。<span class="xyp-btn" style="font-size:11px;padding:1px 7px;margin:0 0 0 4px" data-act="fcx_give" data-n="${esc(n)}">TA给了</span></div>`;
return h + '</div></div>';
}).join('');
};
const fcAct = (a, t) => {
const n = t.dataset.n; const f = FCg(n); const u = myNick();
const ask = (ti, ph, fn) => inputBox(ti, ph, (v) => { v = (v || '').trim(); if (!v) return; fn(v); save(); render(); });
const amtV = (v) => { const x = numOf(v); if (!isFinite(x) || x < 0) { tip('请输入有效金额'); return NaN; } return Math.round(x * 100) / 100; };
if (a === 'fcx_open') ask('给' + n + '开亲情卡', '额度（元），如 5000', (v) => { const x = amtV(v); if (isNaN(x)) return; f.on = true; f.bal = x; fcLog(f.log, '开通亲情卡', x); pushEvent(`${u}给${n}开了一张亲情卡，额度¥${x}，${n}可以随时用，${u}能看到每笔消费`, 1); });
else if (a === 'fcx_add') ask('给亲情卡充值', '金额（元）', (v) => { const x = amtV(v); if (isNaN(x)) return; f.bal = Math.round((f.bal + x) * 100) / 100; fcLog(f.log, '充值', x); pushEvent(`${u}给${n}的亲情卡充了¥${x}`, 1); });
else if (a === 'fcx_rec') ask('记一笔', n + '买了什么，如：奶茶 28（工资等收入写 +3000）', (v) => { const x = amtV(v); if (isNaN(x)) return; const inc = /(^|\s)\+/.test(v); const amt = inc ? x : -x; if (amt < 0 && f.bal + amt < 0) { tip('卡里余额不够'); return; } f.bal = Math.round((f.bal + amt) * 100) / 100; fcLog(f.log, fcTitle(v) || (inc ? '收入' : '消费'), amt); pushEvent(`${n}用亲情卡${inc ? '收入' : '花了'}¥${x}（${fcTitle(v) || '一笔'}）`, 1); });
else if (a === 'fcx_gen') fcGen(n);
else if (a === 'fcx_sal') { f.sal = !f.sal; pushEvent(f.sal ? `${n}的工资从现在起全部上交亲情卡，${n}只能花亲情卡里的钱` : `${n}不再把工资上交亲情卡`, 1); save(); render(); }
else if (a === 'fcx_close') confirmBox('收回亲情卡', '收回后' + n + '不能再用这张卡，记录会保留。', () => { f.on = false; f.sal = false; pushEvent(`${u}收回了${n}的亲情卡`, 1); save(); render(); });
else if (a === 'fcx_give') giveBk(n);
else if (a === 'fcx_inc') bkGen(n);
else if (a === 'fcx_incdef') { f.bk.inc = Math.max(30, Math.round((f.bk.bal0 || f.bk.bal) * 0.2)); tip('已恢复默认保底收入 ¥' + f.bk.inc); save(); render(); }
else if (a === 'fcx_incset') ask('每日保底收入', '金额（元），填 0 表示没有保底；现在是 ' + (f.bk.inc || 0), (v) => { const x = numOf(v); if (!isFinite(x) || x < 0) { tip('请输入有效金额'); return; } f.bk.inc = Math.round(x * 100) / 100; });
else if (a === 'fcx_swipe') { bkTick(n, f); if (f.bk.dry && f.bk.bal < 1) { tip(n + '的钱花完了，暂时不能刷卡，正在按剧情结算TA的收入…'); bkGen(n); return; } ask('刷' + n + '的卡', '买了什么，如：耳机 399', (v) => { const x = amtV(v); if (isNaN(x)) return; if (f.bk.bal < x) { tip(n + '的钱不够这笔了（余额¥' + f.bk.bal + '）'); if (f.bk.bal < 1) dryNotify(n); return; } f.bk.bal = Math.round((f.bk.bal - x) * 100) / 100; fcLog(f.bk.log, fcTitle(v) || '消费', -x); pushEvent(`${u}刷了${n}的亲情卡，花了¥${x}（${fcTitle(v) || '一笔'}），${n}知道这笔`, 1); if (f.bk.bal < 1) dryNotify(n); }); }
else if (a === 'fcx_bkc') { f.bk.st = 0; if (f.bk.bal) pushEvent(`${u}把${n}的亲情卡还给了${n}`, 1); f.bk.bal = 0; save(); render(); }
};
const walGenAI = async () => {
const w = W(); try { const out = await callAPI([{ role: 'system', content: '根据用户的身份、经济状况和剧情，估计此刻他钱包里的大致余额（人民币）。只输出一个数字，不要任何说明。' }, { role: 'user', content: `用户：${uName()}\n角色卡与设定：\n${clip(charCard(), 1200)}\n\n近期剧情：\n${storyText(4, 1200) || '（暂无）'}` }], { max: 40, f: 'cp' }); const x = numOf(out); if (!isFinite(x) || x > WAL_MAX) throw new Error('没有得到有效金额'); const v = Math.round(x * 100) / 100; w.log.unshift({ t: '按设定生成余额', amt: v - w.bal, ts: Date.now() }); w.bal = v; save(); } catch (e) { tip('生成失败：' + clip(e.message || String(e), 30)); } render();
};
const batNames = () => (typeof ROSTER !== 'undefined' && ROSTER.length ? ROSTER.map((r) => r.n) : [CPN()]);
const batBase = (c) => { const cx = getCtx(); const n = (cx && cx.chat ? cx.chat.length : 0); let h = 0; for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 97; return 18 + ((h + n * 2) % 80); };
const batGet = (c) => { const m = (D().bat || {})[c]; return m && typeof m.v === 'number' && Date.now() - m.ts < 43200000 ? m.v : batBase(c); };
const batSet = (c, v, src) => { const d = D(); if (!d.bat) d.bat = {}; v = Math.max(0, Math.min(100, Math.round(v))); d.bat[c] = { v, ts: Date.now(), src: src || '' }; save(); };
const B_LOW = /没电|电量(耗尽|不足|告急|很低|见底|只剩|所剩无几)|关机|电池(耗尽|没电|告急)|低电量/, B_OFF = /自动关机|已经关机|直接关机|没电关机|关机了|黑屏/, B_CHG = /充(上)?电|插上(电源|充电)|充电线|充满/, B_FULL = /充满|电量(已)?满|100%/;
const batScan = () => { try { const c = getCtx(); const names = batNames(); const chat = ((c && c.chat) || []).filter((m) => m && !m.is_system).slice(-4); const d = D(); if (!d.batDone) d.batDone = []; const me = uName(); let last = names.length === 1 ? names[0] : ''; let ch = 0;
chat.forEach((m) => { const t = cleanText(m.mes); if (!t) return; t.split(/\n+/).forEach((para) => para.split(/(?<=[。！？!?…])/).forEach((sen) => { const at = names.map((n) => [n, sen.indexOf(n)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]); if (at.length) last = at[0][0]; if (!/手机|电量|电池|充电|关机/.test(sen)) return; if (/你的手机|你手机/.test(sen) || (me && sen.indexOf(me + '的手机') >= 0)) return; let v = null; if (B_FULL.test(sen) && B_CHG.test(sen)) v = 100; else if (B_CHG.test(sen) && !B_LOW.test(sen)) v = 'chg'; else if (B_OFF.test(sen)) v = 0; else if (B_LOW.test(sen)) v = 3; if (v === null || !last) return; const key = last + '|' + sen.trim(); if (d.batDone.indexOf(key) >= 0) return; d.batDone.push(key); if (d.batDone.length > 30) d.batDone.shift(); if (v === 'chg') v = Math.max(batGet(last), 60); batSet(last, v, 'st'); ch = 1; })); });
if (ch) save(); } catch (e) {} };
const buildBat = () => { if (cfg.batTell === 'off') return ''; try { const names = batNames(); const off = names.filter((n) => batGet(n) <= 0).map((n) => n + '的手机已关机（没电）'); const low = names.filter((n) => batGet(n) > 0 && batGet(n) <= 15).map((n) => n + '的手机只剩' + batGet(n) + '%电量'); const a = off.concat(low); if (!a.length) return ''; return '【手机电量】' + a.join('；') + '，可酌情在剧情里体现，不必刻意。'; } catch (e) { return ''; } };
const useBk = (n) => ((typeof ROSTER !== 'undefined' && ROSTER.length && n !== ROSTER[0].n) ? ((D().cps || {})[n] || {}) : D().cp) || {};
const buildUse = () => { if (cfg.useTell === 'off') return ''; try { const out = []; batNames().forEach((n) => { const rc = useBk(n).usage; if (!rc || !rc.data || !(rc.ts > (rc.told || 0))) return; rc.told = rc.ts; const dt = rc.data; const hs = Array.isArray(dt.hours) ? dt.hours.slice(0, 24).map(useNorm) : []; const tot = hs.reduce((s, q) => s + (Number(q.m) || 0), 0); const ap = (dt.apps || []).slice().sort((x, y) => (Number(y.min) || 0) - (Number(x.min) || 0))[0]; const late = hs.some((q, i) => (i < 5 || i === 23) && (Number(q.m) || 0) >= 10); if (!tot && !dt.note) return; out.push(n + '今天手机约用' + (Math.round(tot / 6) / 10) + '小时' + (ap && ap.name ? '，常用' + ap.name : '') + (late ? '，深夜还在用' : '') + (dt.note ? '。' + clip(String(dt.note), 30) : '')); }); if (!out.length) return ''; save(); return '【手机使用】' + out.join('；') + '。仅作背景，不必复述。'; } catch (e) { return ''; } };
const cpStatus = () => {
const c = CPN(); const u = myNick(); const t = storyText(1, 700) || ''; const cx = getCtx(); const n = (cx && cx.chat ? cx.chat.length : 0);
const bat = batGet(c);
const s = !t ? '待机 · 未使用' : /睡着|入睡|熟睡|沉睡|睡梦/.test(t) ? '睡眠中 · 屏幕熄灭' : /开会|会议|出差|执行任务|巡逻|值班|训练场/.test(t) && !/抱|吻|压|亲/.test(t) ? '忙碌中 · 偶尔看一眼手机' : `与${u}在一起 · 手机未打开`;
return `<div class="xyp-chips" style="justify-content:center;margin-top:8px"><label data-act="batedit" style="cursor:pointer">🔋 ${bat}%</label><label>${esc(s)}</label></div>`;
};
const pageMyWal0 = () => { const w = W(); return `<div class="xyp-pg xyp-form"><div class="xyp-center" style="font-size:32px;margin:18px 0 6px">${fmt$(w.bal)}</div><div class="xyp-center" style="opacity:.6;margin-bottom:10px">当前余额</div><div class="xyp-f"><label>金额</label><input id="xyp-wal-in" type="number" inputmode="decimal" min="0" max="10000000000" placeholder="输入数额（上限 100 亿，仅本机记账）"></div><div class="xyp-center"><span class="xyp-btn pri" data-act="walset">设为余额</span><span class="xyp-btn" data-act="waladd">充值</span></div><div class="xyp-h">明细</div>${w.log.length ? lgHtml(w.log, 'w', 'walclr') : '<div class="xyp-center" style="opacity:.6">暂无记录</div>'}</div>`; };
const pageMyWal = () => { const w = W(); let s = pageMyWal0(); const sw = `<div class="xyp-chips" style="justify-content:center"><label><input type="checkbox" data-act="walself" ${w.self === false ? '' : 'checked'}>自己修改金额（关闭则按人设由 AI 定金额；别人看不到你钱包里的钱）</label></div>`; s = s.replace('当前余额</div>', '当前余额</div>' + sw); if (w.self === false) s = s.replace(/<div class="xyp-f"><label>金额<\/label>[\s\S]*?data-act="waladd">充值<\/span><\/div>/, `<div class="xyp-center"><span class="xyp-btn pri" data-act="walai">${busyWal ? '生成中…' : '按设定重新生成金额'}</span></div>`); const k = s.lastIndexOf('</div>'); return s.slice(0, k) + payHtml() + fcHtml() + s.slice(k); };
let busyWal = false;
  // ---- 定位 ----
  let locBusy = false;
  const genLoc = async (x) => {
    if (!x || locBusy) return; locBusy = true; if (cur().p === 'locd') render();
    try {
      const now = new Date().toLocaleString('zh-CN', { hour12: false });
      const out = await callAPI([{ role: 'system', content: '根据人物设定、近期剧情和当前时间，推测此人此刻所在位置。只输出JSON，不要代码块和说明。' },
        { role: 'user', content: `人物：${cName(x)}\n${x.isChar ? charCard() : x.persona}\n\n近期剧情：\n${storyText(2, 800) || '（暂无）'}\n\n现在时间：${now}\n格式：{"place":"地点，14字内","detail":"此刻在做什么，一句话20字内"}` }], { max: 150, f: 'wx' });
      const o = parseJSON(out); if (!o.place) throw new Error('定位失败，请重试');
      x.loc = { place: String(o.place), detail: String(o.detail || ''), ts: Date.now() }; locSeen(x); save();
    } catch (e) { tip(e.message || e); } finally { locBusy = false; if (winEl.classList.contains('on') && cur().p === 'locd') render(); }
  };
  const locSeen = (x) => { if (cfg.ghost || (x.locSeen && Date.now() - x.locSeen < 1800000)) return; x.locSeen = Date.now(); pushEvent(`${myNick()}打开定位查看了${cName(x)}的位置（${cName(x)}同意过共享，知道${myNick()}随时能看）`, true); };
  const openLoc = (x) => { if (x && (!x.loc || Date.now() - x.loc.ts > 600000)) genLoc(x); };
  const pageLoc = () => { const a = D().contacts.filter((x) => x.share && !x.isGroup); return a.length ? a.map((x) => `<div class="xyp-li" data-act="locd" data-id="${x.id}">${av(cAv(x), cName(x))}<div class="m"><b>${esc(cName(x))}<span class="xyp-lc"></span></b><small>${x.loc ? esc(x.loc.place) + ' · ' + fmtT(x.loc.ts) : '未获取'}</small></div></div>`).join('') : '<div class="xyp-center" style="margin:40px 16px;opacity:.6;line-height:1.8">还没有人共享定位<br>在微信聊天里点「＋ → 查位置」，对方同意后会出现在这里</div>'; };
  const pageLocd = (o) => { const x = getC(o.id); if (!x || !x.share) return '<div class="xyp-center" style="margin:40px">对方未共享定位</div>'; const l = x.loc; return `<div class="xyp-map"><i></i></div><div class="xyp-center" style="margin:6px 14px"><b style="font-size:18px">${locBusy ? '定位中……' : l ? esc(l.place) : '未获取'}</b>${l && l.detail ? `<div style="opacity:.7;margin-top:6px">${esc(l.detail)}</div>` : ''}${l ? `<div style="opacity:.5;font-size:12px;margin-top:6px">更新于 ${fmtT(l.ts)}</div>` : ''}</div><div class="xyp-center" style="margin-top:14px"><span class="xyp-btn pri" data-act="genloc" data-id="${x.id}">刷新位置</span><span class="xyp-btn dng" data-act="unshare" data-id="${x.id}">关闭共享</span></div>`; };

  // ---- 锁手机（user 锁住 char 的手机）----
  const plData = () => D().plock || null;
  const plActive = () => { const p = plData(); return !!(p && p.until > Date.now()); };
  const plLeft = () => { const ms = Math.max(0, (plData() || {}).until - Date.now()); const m = Math.ceil(ms / 60000); return m >= 1440 ? Math.round(m / 144) / 10 + '天' : m >= 60 ? Math.round(m / 6) / 10 + '小时' : m + '分钟'; };
  const secLocked = (k) => { if (!plActive()) return false; const p = plData(); return p.mode === 'all' ? k !== 'wechat' : (p.apps || []).includes(k); };
  const chatLocked = (name) => { if (!plActive()) return false; const p = plData(); return p.mode === 'all' || (p.apps || []).includes('wechat') || (p.cts || []).includes(name); };
  const buildLock = () => {
    const p0 = plData(); if (p0 && p0.until <= Date.now() && !p0.ended) { p0.ended = 1; save(); return `【手机解锁】${myNick()}给${cName(getC('char'))}锁手机的时间到了，手机已恢复可用。`; }
    if (!plActive()) return ''; const p = plData(); const c = cName(getC('char')); const u = myNick();
    if (p.mode === 'all') return `【手机被锁】${u}锁了${c}的手机（${p.dur}，约剩${plLeft()}）：全部锁定，${c}此期间只能联系${u}，其他软件和联系人都用不了。请在剧情里体现（反应按人设）。`;
    const a = (p.apps || []).filter((k) => SEC[k]).map((k) => SEC[k].n); const nm = (p.apps || []).includes('wechat') ? '微信整体' : (p.cts || []).join('、');
    return `【手机被锁】${u}锁了${c}的手机（${p.dur}，约剩${plLeft()}）：${a.length ? '无法使用：' + a.join('、') + '；' : ''}${nm ? '微信里无法联系：' + nm + '；' : ''}其余可用，只在剧情涉及时体现。`;
  };
  const pagePLock = (o) => {
    const d = D(); const p = plData(); const dr = o.pl || (o.pl = { n: 2, u: '小时', mode: 'all', apps: [], cts: [] });
    const names = [...new Set(d.contacts.filter((x) => !x.isGroup && !x.isChar && wxOk(x)).map((x) => x.name).concat((((d.cp.wechat || {}).data || {}).chats || []).map((x) => x.name)))];
    const act = plActive() ? `<div class="xyp-card" style="text-align:center"><b>🔒 已锁定</b><div class="tx" style="margin-top:6px">${esc(p.mode === 'all' ? '全部锁，只能联系' + myNick() : '部分锁：' + ((p.apps || []).filter((k) => SEC[k]).map((k) => SEC[k].n).concat((p.cts || []).map((n) => '联系人' + n))).join('、'))}<br>时长 ${esc(p.dur)} · 剩余约 ${plLeft()}</div><span class="xyp-btn dng" data-act="plun" style="margin-top:8px">解锁</span></div>` : '';
    return `<div class="xyp-pg xyp-form">${act}<div class="xyp-h">${plActive() ? '重新设置' : '设置锁定'}</div><div class="xyp-f"><label>时长</label><input id="xyp-pl-n" data-pln="1" type="number" min="1" value="${esc(dr.n)}" style="max-width:70px"><select data-plu="1" style="max-width:80px">${['分钟', '小时', '天'].map((q) => `<option ${dr.u === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
<div class="xyp-chips"><span>范围</span><label><input type="radio" name="plm" data-plm="all" ${dr.mode === 'all' ? 'checked' : ''}>全部锁（只能联系${esc(myNick())}）</label><label><input type="radio" name="plm" data-plm="part" ${dr.mode === 'part' ? 'checked' : ''}>部分锁</label></div>
${dr.mode === 'part' ? `<div class="xyp-chips"><span>锁哪些软件</span>${secKeys().map((k) => `<label><input type="checkbox" data-pla="${k}" ${dr.apps.includes(k) ? 'checked' : ''}>${SEC[k].n}</label>`).join('')}</div>${dr.apps.includes('wechat') ? '<div class="xyp-tip">微信整体已锁：除了' + esc(myNick()) + '，TA联系不了别人。只想锁部分人的话，取消勾选微信，在下面选联系人。</div>' : ''}<div class="xyp-chips"><span>微信里锁定的联系人</span>${names.length ? names.map((n) => `<label><input type="checkbox" data-plc="${esc(n)}" ${dr.cts.includes(n) ? 'checked' : ''}>${esc(n)}</label>`).join('') : '<small>暂无联系人</small>'}</div>` : ''}
<div class="xyp-center"><span class="xyp-btn pri" data-act="plgo">开始锁定</span></div><div class="xyp-tip">锁定期间会在每次生成正文前附一小段提示告诉正文（几十字）。被锁的软件在这里无法翻看和生成。</div></div>`;
  };
  // ---- 生成联系人：补全正文角色 ----
  let gcBusy = false;
  const genStory = async () => {
    if (gcBusy) return; gcBusy = true; render();
    try {
      const d = D(); const names = d.contacts.map((x) => x.name).join('、');
      const out = await callAPI([{ role: 'system', content: `从剧情文本中找出有名字、有一定戏份的人物，不含${uName()}、${cName(getC('char'))}和已有联系人。只输出JSON，没有就输出{"list":[]}，不要代码块和说明。` },
        { role: 'user', content: `近期剧情：\n${storyText(4, 2500) || '（暂无）'}\n\n已有联系人：${names}\n\n格式：{"list":[{"name":"姓名","desc":"身份与关系，20字内"}]}` }], { max: 400, f: 'wx' });
      const o = parseJSON(out); let n = 0;
      (o.list || []).slice(0, 6).forEach((it) => { const x = addAuto(it && it.name, it && it.desc); if (x) { n++; notify(x, '新联系人：' + clip(x.rel, 24)); } });
      save(); if (!n) alertBox('提示', '已添加所有联系人');
    } catch (e) { tip(e.message || e); } finally { gcBusy = false; if (winEl.classList.contains('on')) render(); }
  };

  const SHOP = { '零食饮品': [['奶茶', 18], ['咖啡', 22], ['巧克力礼盒', 88], ['进口零食大礼包', 128], ['蛋糕', 168], ['红酒', 398]], '数码': [['蓝牙耳机', 299], ['充电宝', 129], ['智能手表', 1299], ['拍立得', 699], ['游戏手柄', 259], ['手机壳', 39]], '服饰': [['卫衣', 199], ['衬衫', 259], ['围巾', 129], ['手表', 899], ['皮带', 189], ['睡衣', 159]], '美妆护肤': [['护手霜', 59], ['香水', 599], ['面膜一盒', 89], ['口红', 299], ['剃须刀', 349], ['洗护套装', 199]], '家居': [['抱枕', 69], ['香薰蜡烛', 99], ['四件套', 399], ['马克杯一对', 79], ['台灯', 149], ['绿植', 58]], '鲜花礼品': [['玫瑰花束', 199], ['手作礼盒', 268], ['毛绒玩偶', 129], ['定制相册', 99], ['项链', 799], ['戒指', 1299]] };
const SHOP_R = [['情趣内衣', 239], ['眼罩', 39], ['领带', 89], ['润滑液', 69], ['手铐（玩具）', 79], ['按摩器', 199]];
const SHOP_ALL = () => Object.keys(SHOP).concat(['成人用品']);
const shopCats = () => (SH().cats || SHOP_ALL()).filter((c) => c !== '成人用品' || adultOn());
const shopBase = (c) => (c === '成人用品' ? SHOP_R : (SHOP[c] || []));
const shopMix = (l, c) => { const sd = (SH().seed || {})[c]; if (!sd || l.length < 3) return l; let t = sd >>> 0; const rnd = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; const a = l.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
const shopItems = (o) => { const q = (o.q || '').trim().toLowerCase(); if (q) { const all = shopCats().reduce((a, k) => a.concat(shopBase(k), (SH().extra || {})[k] || []), []); return all.filter((x) => x[0].toLowerCase().includes(q)); } const c = o.cat && shopCats().indexOf(o.cat) >= 0 ? o.cat : shopCats()[0]; const l = shopBase(c).concat((SH().extra || {})[c] || []); return shopMix(l, c); };
const SH = () => { const d = D(); return d.shop || (d.shop = { orders: [] }); };
let shopBusy = false;
const SHOP_OPT_R = [[/智能手表/, [['表盘', ['41mm（小表盘，适合细手腕）', '45mm（大表盘，显示更大）']], ['表带', ['硅胶（运动）', '金属（商务）', '真皮（休闲）']], ['颜色', ['黑色', '银色', '星光色']]]], [/耳机/, [['类型', ['入耳式', '半入耳式', '头戴式']], ['降噪', ['普通', '主动降噪']], ['颜色', ['黑色', '白色', '蓝色', '粉色']]]], [/充电宝/, [['容量', ['10000mAh（约充2次手机）', '20000mAh（约充4次手机）']], ['颜色', ['黑色', '白色', '蓝色']]]], [/拍立得/, [['套装', ['仅相机', '相机+相纸20张', '相机+相纸+相册']], ['颜色', ['白色', '粉色', '蓝色', '黑色']]]], [/手柄/, [['适配', ['手机', '电脑', '游戏主机']], ['颜色', ['黑色', '白色', '红蓝']]]], [/巧克力/, [['口味', ['黑巧克力', '牛奶巧克力', '榛子夹心', '混合口味']], ['规格', ['小盒12颗', '大盒24颗']], ['包装', ['普通盒装', '礼品袋', '缎带礼盒']]]], [/零食大礼包/, [['口味偏好', ['偏甜口', '偏咸辣', '甜咸混合']], ['规格', ['标准款（约20件）', '豪华款（约35件）']]]], [/蛋糕/, [['尺寸', ['6寸（约2-3人）', '8寸（约4-6人）', '10寸（约8-10人）']], ['口味', ['草莓', '芒果', '巧克力', '芝士']], ['附赠', ['生日蜡烛', '贺卡', '都不需要']]]], [/卫衣|衬衫|睡衣/, [['尺码', ['S 码（身高150-160cm，体重45kg以下）', 'M 码（身高160-168cm，体重45-55kg）', 'L 码（身高168-175cm，体重55-65kg）', 'XL 码（身高175cm以上，体重65kg以上）']], ['颜色', ['黑色', '白色', '灰色', '藏青']]]], [/围巾/, [['材质', ['羊绒（柔软保暖）', '羊毛（厚实）', '棉（轻薄）']], ['颜色', ['灰色', '驼色', '红色', '黑色']]]], [/皮带/, [['长度', ['适合腰围 70-80cm', '适合腰围 80-90cm', '适合腰围 90-100cm']], ['颜色', ['黑色', '棕色']]]], [/护手霜/, [['香型', ['无香', '玫瑰', '茉莉', '橙花']], ['规格', ['单支50g', '三支装']]]], [/香水/, [['香型', ['花香', '木质', '清新', '甜美']], ['容量', ['30ml', '50ml', '100ml']]]], [/面膜/, [['功效', ['补水', '美白', '修护', '舒缓']], ['片数', ['5片', '10片', '20片']]]], [/口红/, [['色号', ['正红', '豆沙', '裸粉', '棕调']], ['质地', ['哑光', '丝绒', '滋润']]]], [/剃须刀/, [['类型', ['电动（充电式）', '手动']], ['刀头', ['三刀头', '五刀头']], ['颜色', ['黑色', '银色']]]], [/洗护套装/, [['香型', ['无香', '木质', '清新', '花香']], ['规格', ['旅行装', '标准装']]]], [/抱枕/, [['尺寸', ['40cm（小）', '50cm（标准）', '60cm（大，可当靠垫）']], ['颜色', ['黑色', '白色', '灰色', '粉色']]]], [/蜡烛/, [['香型', ['薰衣草', '木质', '玫瑰', '海盐']], ['规格', ['小号（约30小时）', '中号（约60小时）']]]], [/四件套/, [['床的尺寸', ['1.5米床', '1.8米床', '2.0米床']], ['材质', ['纯棉', '磨毛', '真丝']], ['颜色', ['白色', '灰色', '浅蓝', '粉色']]]], [/马克杯/, [['款式', ['情侣款', '简约款', '卡通款']], ['颜色', ['黑白', '粉蓝', '纯白']]]], [/台灯/, [['光色', ['暖光', '冷光', '三色可调']], ['档位', ['3档亮度', '无级调光']], ['颜色', ['白色', '黑色', '原木色']]]], [/绿植/, [['种类', ['绿萝', '多肉', '龟背竹', '发财树']], ['盆器', ['陶瓷盆', '塑料盆', '不带盆']]]], [/手作礼盒/, [['款式', ['生日款', '纪念日款', '节日款']], ['包装', ['简约', '丝带', '带手写卡片']]]], [/玩偶/, [['尺寸', ['30cm（可抱着睡）', '50cm', '80cm（半个人高）']], ['款式', ['小熊', '兔子', '小狗', '猫咪']]]], [/相册/, [['页数', ['20页', '40页', '60页']], ['封面', ['布面', '皮面', '自定义照片封面']]]], [/情趣内衣/, [['尺码', ['S 码（身高150-160cm，体重45kg以下）', 'M 码（身高160-168cm，体重45-55kg）', 'L 码（身高168-175cm，体重55-65kg）', 'XL 码（身高175cm以上，体重65kg以上）']], ['颜色', ['黑色', '红色', '白色', '粉色']]]], [/眼罩/, [['材质', ['真丝（柔滑亲肤）', '棉质（透气）', '加厚遮光（完全不透光）']], ['颜色', ['黑色', '红色', '白色', '粉色']]]], [/领带/, [['长度', ['标准款（约145cm）', '加长款（约160cm，可多绕几圈）']], ['颜色', ['黑色', '红色', '白色', '粉色']]]], [/润滑/, [['容量', ['小瓶 50ml（试用装）', '标准 100ml', '大瓶 200ml（家庭装）']], ['类型', ['水基（通用，易清洗）', '硅基（更持久）']]]], [/手铐/, [['材质', ['毛绒包边（亲肤，不勒手）', '皮质（可调松紧）', '金属仿真（较重）']], ['颜色', ['黑色', '红色', '白色', '粉色']]]], [/按摩器/, [['尺寸', ['迷你（约10cm，便携）', '标准（约15cm）', '大号（约20cm，机身更粗）']], ['档位', ['3档震动', '7档震动']], ['颜色', ['黑色', '红色', '白色', '粉色']]]], [/咖啡/, [['种类', ['美式', '拿铁', '卡布奇诺', '摩卡']], ['糖', ['无糖', '半糖', '全糖']], ['温度', ['热', '去冰', '少冰', '正常冰']]]], [/奶茶|茶|饮/, [['种类', ['原味奶茶', '珍珠奶茶', '芋泥波波', '杨枝甘露']], ['甜度', ['无糖', '三分糖', '五分糖', '全糖']], ['冰量', ['热', '去冰', '少冰', '正常冰']], ['加料', ['不加', '珍珠', '椰果', '布丁']]]], [/蛋糕/, [['尺寸', ['6寸', '8寸', '10寸']], ['口味', ['草莓', '芒果', '巧克力', '芝士']]]], [/红酒/, [['类型', ['干红', '甜红', '桃红']]]], [/花束/, [['数量', ['9朵', '19朵', '33朵', '99朵']], ['颜色', ['红色', '粉色', '白色', '香槟色']]]], [/戒指/, [['圈号', ['10号', '12号', '14号', '16号']], ['材质', ['银', '玫瑰金', '铂金']]]], [/项链|手表/, [['材质', ['银', '玫瑰金', '黑钢']], ['款式', ['简约', '精致']]]], [/手机壳/, [['机型', ['iPhone', '华为', '小米', '三星']], ['颜色', ['黑色', '透明', '粉色', '蓝色']]]], [/香水|口红/, [['色号/香型', ['经典', '玫瑰', '木质', '清新']]]]];
const SHOP_OPT_C = { '零食饮品': [['口味', ['原味', '巧克力', '草莓', '抹茶']]], '数码': [['颜色', ['黑色', '白色', '蓝色', '粉色']], ['版本', ['标准版', 'Pro版']]], '服饰': [['尺码', ['S 码（身高150-160cm，体重45kg以下）', 'M 码（身高160-168cm，体重45-55kg）', 'L 码（身高168-175cm，体重55-65kg）', 'XL 码（身高175cm以上，体重65kg以上）']], ['颜色', ['黑色', '白色', '灰色', '藏青']]], '美妆护肤': [['规格', ['经典款', '玫瑰', '木质', '清新']]], '家居': [['颜色', ['白色', '米色', '灰色', '粉色']]], '鲜花礼品': [['款式', ['经典', '精致', '豪华']], ['颜色', ['红色', '粉色', '白色', '香槟色']]], '成人用品': [['尺寸', ['小号（偏小，适合新手）', '中号（标准）', '大号（偏大）']], ['颜色', ['黑色', '红色', '白色', '粉色']]] };
const shopOpts = (it) => { if (Array.isArray(it[2]) && it[2].length) return it[2]; const hit = SHOP_OPT_R.find((r) => r[0].test(it[0])); if (hit) return hit[1]; const ex = SH().extra || {}; const c = shopCats().find((k) => shopBase(k).concat(ex[k] || []).some((x) => x[0] === it[0])); return (c && SHOP_OPT_C[c]) || []; };
const shopGen = async (c) => {
if (shopBusy) return; shopBusy = true; render();
try {
const ex = SH().extra || (SH().extra = {}); const have = shopBase(c).map((x) => x[0]); const oldN = (ex[c] || []).map((x) => x[0]).join('、');
const out = await callAPI([{ role: 'system', content: `你是购物软件的商品生成器。为分类「${c}」生成6个常见的新商品，不要与已有商品重复；每个商品给1~2组可选规格（如甜度、尺寸、颜色），每组2~4个选项；选项要写明含义，如尺码写成「M（身高160-168cm）」，容量写成「100ml」，不能只写字母或数字。商品名简短，只写商品名、价格和规格，不要露骨描述。只输出 JSON，不要代码块；文本里不要出现英文双引号。` }, { role: 'user', content: `分类：${c}\n已有商品：${have.join('、')}${oldN ? '\n上一批（这次要换成全新的，不要重复）：' + oldN : ''}\n输出格式：{"items":[{"n":"商品名","p":价格数字,"opts":[{"k":"规格名","v":["选项1","选项2"]}]}]}` }], { max: 700, f: 'cp' });
const o = parseJSON(out); const list = [];
(o.items || []).slice(0, 8).forEach((q) => { const n = fcTitle(String(q.n || '')).slice(0, 14); const p0 = Math.round(Number(String(q.p).replace(/[^\d.]/g, '')) * 100) / 100; if (!n || !isFinite(p0) || p0 <= 0 || have.indexOf(n) >= 0) return; const op = (Array.isArray(q.opts) ? q.opts : []).slice(0, 2).map((g) => [String(g.k || '规格').slice(0, 6), (Array.isArray(g.v) ? g.v : []).slice(0, 4).map((z) => String(z).slice(0, 10))]).filter((g) => g[1].length > 1); list.push([n, p0, op]); });
if (!list.length) tip('没有生成新商品'); else { ex[c] = list; (SH().seed || (SH().seed = {}))[c] = Math.floor(Math.random() * 2147483647) + 1; save(); }
} catch (e) { tip('生成失败：' + clip(e.message || String(e), 30)); } finally { shopBusy = false; render(); }
};
const orderSt = (o) => { const m = o.arr ? 99 : (Date.now() - o.ts) / 60000; return m < 2 ? ['待发货', 0] : m < 10 ? ['运输中', 1] : ['已签收', 2]; };
const isCharC = (x) => { try { return !!(x.isChar || fcNames().indexOf(cName(x)) >= 0); } catch (e) { return false; } };
const addOrder = (it, ct, src) => {
const u = myNick(); const od = { id: 'o' + Date.now().toString(36), n: it[0], p: it[1], to: ct ? ct.id : null, tn: ct ? cName(ct) : '', ts: Date.now(), pay: src === 'own' || !src ? '自己的卡' : src.slice(3) + '的亲情卡' };
SH().orders.unshift(od); SH().orders.length = Math.min(SH().orders.length, 60);
if (ct) { pushMsg(ct.id, 'u', `【购物订单】我给你买了「${od.n}」，¥${od.p}，订单号 ${od.id.slice(-6).toUpperCase()}，已下单，很快会送到你那边～`, Date.now()); pushEvent(`${u}在购物软件里给${od.tn}买了「${od.n}」（¥${od.p}），已下单送过去`, isCharC(ct) ? 1 : 0); }
else pushEvent(`${u}自己在购物软件里买了「${od.n}」（¥${od.p}）`);
save(); tip(ct ? '已下单，订单已发给' + od.tn : '已下单'); render(); if (ct && cfg.auto) autoWait(ct.id);
};
let shopCur = null;
const shopOptDlg = () => { const c = shopCur; const chips = (g, gi) => g[1].map((z, zi) => `<span class="xyp-btn${c.sel[gi] === zi ? ' pri' : ''}" style="margin:0 6px 6px 0;height:26px;line-height:26px;padding:0 10px;font-size:12px" data-act="shopopt" data-g="${gi}" data-v="${zi}">${esc(z)}</span>`).join('');
showDlg(`<div class="bx"><b>${esc(c.it[0])}　${fmt$(c.it[1])}</b><div style="max-height:46vh;overflow-y:auto;text-align:left;margin:8px 0">${c.opts.map((g, gi) => `<div style="margin-top:6px"><small style="opacity:.7">${esc(g[0])}</small><div style="margin-top:4px">${chips(g, gi)}</div></div>`).join('')}</div><div class="bt"><span data-act="dlgno">取消</span><span data-act="shopgo" data-k="1">送人</span><span class="ok" data-act="shopgo" data-k="0">自己买</span></div></div>`); };
const shopName = () => { const c = shopCur; const ch = c.opts.map((g, gi) => g[1][c.sel[gi]]).filter((z) => z != null); return [ch.length ? c.it[0] + '（' + ch.join('/') + '）' : c.it[0], c.it[1]]; };
const shopFinal = (kind) => { const it = shopName(); if (kind === 0) { payWith('shop', it[1], '购物：' + it[0], (src) => addOrder(it, null, src)); return; }
const cs = D().contacts.filter((x) => !x.isGroup && !(x.live && !x.friend)).slice(0, 15);
if (!cs.length) { tip('微信里还没有联系人'); return; }
pickBox('送给谁', cs.map((x) => [cName(x)]), (j) => { const ct = cs[j]; if (ct) payWith('shop', it[1], `购物（送${cName(ct)}）：${it[0]}`, (src) => addOrder(it, ct, src)); }, 2); };
const shopBuy = (it0) => { const opts = shopOpts(it0); shopCur = { it: it0, opts, sel: opts.map(() => 0) }; shopOptDlg(); };
const isEx = (x) => Array.isArray(x[2]) && !shopCats().some((k) => shopBase(k).indexOf(x) >= 0);
const pageShop = (o) => {
const cats = shopCats(); const cur0 = o.cat && cats.indexOf(o.cat) >= 0 ? o.cat : cats[0]; const its = shopItems(o); const nb = o.q ? 99999 : shopBase(cur0).length;
return `<div class="xyp-pg xyp-form"><div style="display:flex;gap:6px;overflow-x:auto;white-space:nowrap;padding:0 14px 8px">${cats.map((c) => `<span class="xyp-btn${!o.q && cur0 === c ? ' pri' : ''}" style="flex:none;margin:0" data-act="shopcat" data-c="${esc(c)}">${esc(c)}</span>`).join('')}<span class="xyp-btn" style="flex:none;margin:0" data-act="shopedit">编辑</span></div><div style="padding:0 14px 6px;display:flex;gap:6px;white-space:nowrap"><span class="xyp-btn" style="margin:0;height:28px;line-height:28px;padding:0 10px;font-size:12px" data-act="shopq">${o.q ? '搜索：' + esc(o.q) : '搜索商品'}</span>${o.q ? '<span class="xyp-btn" style="margin:0;height:28px;line-height:28px;padding:0 10px;font-size:12px" data-act="shopqx">清除</span>' : ''}<span class="xyp-btn" style="margin:0;height:28px;line-height:28px;padding:0 10px;font-size:12px" data-act="shopcust">自己写一个</span>${o.q ? '' : `<span class="xyp-btn" style="margin:0;height:28px;line-height:28px;padding:0 10px;font-size:12px" data-act="shoprf">${shopBusy ? '生成中…' : '刷新'}</span>`}</div>${its.length ? its.map((x, i) => `<div class="xyp-li" data-act="shopbuy" data-i="${i}"><div class="m"><b>${esc(x[0])}</b><small>${shopOpts(x).length ? '点一下选规格，再购买或送人' : '点一下购买或送人'}</small></div>${isEx(x) ? `<span style="font-size:12px;opacity:.6;padding:6px 10px" data-act="shopdel" data-i="${i}">删</span>` : ''}<b>${fmt$(x[1])}</b></div>`).join('') : '<div class="xyp-center" style="opacity:.6;padding:20px">没有找到，可以点「自己写一个」</div>'}<div style="position:sticky;bottom:12px;display:flex;justify-content:flex-end;pointer-events:none;margin-top:10px;padding-right:14px"><span style="pointer-events:auto;width:54px;height:54px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)" data-act="shopme">我的</span></div></div>`;
};
const shopEditDlg = () => { const cs = SH().cats || (SH().cats = SHOP_ALL()); showDlg(`<div class="bx"><b>编辑种类</b><div style="max-height:46vh;overflow-y:auto;margin:10px 0;text-align:left">${cs.map((c, i) => `<div style="display:flex;align-items:center;padding:7px 2px;border-bottom:1px solid rgba(128,128,128,.25)"><span style="flex:1">${esc(c)}</span><span data-act="shopcup" data-i="${i}" style="padding:4px 12px">↑</span><span data-act="shopcdn" data-i="${i}" style="padding:4px 12px">↓</span><span data-act="shopcdel" data-i="${i}" style="padding:4px 12px">✕</span></div>`).join('') || '<div style="opacity:.6;padding:10px">还没有种类，点下面添加</div>'}</div><div class="bt"><span data-act="shopcadd">添加种类</span><span class="ok" data-act="dlgno">完成</span></div></div>`); };
const pageShopMe = () => { const os = SH().orders; return `<div class="xyp-pg xyp-form">${os.length ? os.map((od) => { const st = orderSt(od); return `<div class="xyp-card" style="padding:10px 12px"><div style="display:flex;justify-content:space-between"><b>${esc(od.n)}</b><b>${fmt$(od.p)}</b></div><div style="font-size:12px;opacity:.7;margin:3px 0">${od.to ? '送给 ' + esc(od.tn) : '自己买的'} · ${esc(od.pay)} · ${fmtT(od.ts)}</div><div style="display:flex;gap:4px;margin-top:6px">${['待发货', '运输中', '已签收'].map((t, i) => `<span style="flex:1;text-align:center;font-size:12px;padding:3px 0;border:1px solid currentColor;opacity:${i <= st[1] ? 1 : .3};${i === st[1] ? 'font-weight:bold' : ''}">${t}</span>`).join('')}</div><div style="font-size:12px;opacity:.7;margin-top:4px">${st[1] === 2 ? (od.to ? esc(od.tn) + '已签收' : '已签收') : st[1] === 1 ? '快递在路上' : '商家正在备货'}${st[1] < 2 ? '<span class="xyp-btn" style="float:right;margin:-6px 0 0;height:26px;line-height:26px;padding:0 10px" data-act="shoparr" data-id="'+od.id+'">立即到货</span>' : ''}</div></div>`; }).join('') : '<div class="xyp-center" style="opacity:.6;padding:40px">还没有订单</div>'}</div>`; };
const PAGES = { home: pageHome, album: pageAlbum, mom: pageMom, wx: pageWx, chat: (o) => { const x = getC(o.id); return `<div class="xyp-chead" data-act="${x && x.isGroup ? 'editg' : x && x.live && !x.friend ? 'exch' : 'edit'}" data-id="${esc(o.id)}"><span>${x ? esc(x.isGroup ? '群成员：' + grpMembers(x).map(cName).join('、') : x.live && !x.friend ? '直播私信 · ' + (x.rel || '主播') : (x.remark ? '备注：' + x.remark : '未设置备注') + (x.rel ? ' · ' + x.rel : ' · 未设置关系')) : ''}</span><b>${x && x.isGroup ? '群设置 ›' : x && x.live && !x.friend ? '交换联系方式 ›' : IC.gear}</b></div>${x && x.live ? `<div class="xyp-chead" data-act="gotoroom" data-id="${esc(x.id)}"><span>${esc(cName(x))} 的直播间</span><b>进入 ›</b></div>` : ''}<div class="xyp-msgs" id="xyp-msgs"></div>${plusPanel(o, x)}<div class="xyp-comp">${x && !x.isGroup && !dmOnly(x) ? '<button data-act="plus" title="更多">＋</button>' : ''}<textarea id="xyp-in" rows="1" placeholder="发消息…"></textarea>${x && !x.isGroup && !dmOnly(x) ? `<button class="stkb" data-act="stk" title="表情包">${IC.stk}</button>` : ''}<button class="pri sb" id="xyp-sb" data-act="reply" title="让TA回复">${SB.r}</button></div>`; }, contact: pageContact, group: pageGroup, live: pageLive, mylv: pageMyLv, prof: pageProf, dms: pageDms, room: pageRoom, mywal: pageMyWal, shop: pageShop, shopme: pageShopMe, loc: pageLoc, locd: pageLocd, settings: pageSettings, theme: pageTheme, cp: pageCp, cpsec: pageSec, cpchat: pageCpChat, call: pageCall };

  const renderMsgs = () => {
    const el = $('xyp-msgs'); const o = cur(); if (!el || o.p !== 'chat') return;
    const x = getC(o.id); if (!x) return; const list = D().msgs[x.id] || []; let html = ''; let lastT = 0;
    list.forEach((m, li) => { if (m.ts - lastT > 300000) { html += `<div class="xyp-time">${hhmm(m.ts)}</div>`; } lastT = m.ts; const me = m.r === 'u'; const mm = (x.isGroup && getC(m.w)) || x; if (m.k === 'sys' || m.k === 'req') { html += `<div class="xyp-sys">${m.k === 'req' ? '你请求查看TA的位置' : esc(m.t)}</div>`; return; } const bh = bubHTML(m); const bc = `xyp-bub${['pay', 'rp', 'img', 'timg', 'call'].includes(m.k) ? ' xyp-bx' : ''}`; const ba = `data-act="msgact" data-mi="${li}"`; html += `<div class="xyp-row ${me ? 'me' : 'ot'}">${me ? av(uAv(), myNick(), 'sm') : av(cAv(mm), cName(mm), 'sm')}${!me && x.isGroup ? `<div class="xyp-gw"><div class="xyp-who">${esc(cName(mm))}</div><div class="${bc}" ${ba}>${bh}</div></div>` : `<div class="${bc}" ${ba}>${bh}</div>`}</div>`; });
    if (busy[x.id]) html += `<div class="xyp-row ot">${av(cAv(x), cName(x), 'sm')}<div class="xyp-bub xyp-dots"><span></span><span></span><span></span></div></div>`;
    if (errs[x.id]) html += `<div class="xyp-sys">${esc(errs[x.id])}</div>`;
    el.innerHTML = html || `<div class="xyp-tip" style="text-align:center">还没有聊天，打个招呼吧</div>`; el.scrollTop = el.scrollHeight;
    const rw = el.querySelectorAll('.xyp-row'); if (renderMsgs.id === o.id && rw.length > (renderMsgs.n || 0)) rw[rw.length - 1].classList.add('xypnew'); renderMsgs.n = rw.length; renderMsgs.id = o.id;
  };
  const render0 = guard('渲染', () => {
    const o = cur(); const t = o.p === 'chat' ? ((getC(o.id) && cName(getC(o.id))) || '') : o.p === 'cpsec' ? (o.sec === 'plock' ? '锁手机' : SEC[o.sec].n) : o.p === 'cpchat' ? '聊天' : o.p === 'room' ? (((LV().rooms[o.m] || [])[o.i] || {}).name || '直播') : o.p === 'locd' ? (getC(o.id) ? cName(getC(o.id)) + '的定位' : '定位') : (o.p === 'contact' && o.id === 'new' ? '添加联系人' : o.p === 'group' ? (o.id === 'new' ? '创建群聊' : '群设置') : TITLES[o.p]);
    if (o.p === 'chat') { const cx = getC(o.id); if (cx && cx.unread) { cx.unread = 0; save(); } }
    refreshBadge(); $('xyp-title').textContent = t; $('xyp-back').style.visibility = nav.length > 1 ? 'visible' : 'hidden';
    const keep = o.p === 'chat' && $('xyp-in') ? $('xyp-in').value : '';
    const pg0 = scr.querySelector('.xyp-pg'); const st0 = pg0 ? pg0.scrollTop : 0; const keepSc = render.lp === o.p && (o.p === 'settings' || o.p === 'theme'); render.lp = o.p;
    scr.innerHTML = (PAGES[o.p] || pageHome)(o); scr.classList.remove('rv', 'rb'); { const fb = $('xyp-dmfab'); if (fb) { fb.style.display = o.p === 'live' ? 'flex' : 'none'; fb.classList.toggle('has-new', unrDm()); } const mf = $('xyp-mefab'); if (mf) { mf.style.display = o.p === 'live' ? 'flex' : 'none'; if (o.p === 'live') mf.innerHTML = av(lvAv(), lvNick(), 'sm'); } } if (keepSc) { const pg1 = scr.querySelector('.xyp-pg'); if (pg1) pg1.scrollTop = st0; }
    if (navDir) { scr.classList.remove('pf', 'pb'); void scr.offsetWidth; scr.classList.add(navDir); navDir = ''; }
    if (o.p === 'chat') { renderMsgs(); if ($('xyp-in')) { $('xyp-in').value = keep; syncSend(); } }
    if (o.p === 'room') { renderLog(); autoOpen(o); }
    if (o.p === 'cpchat') { const m = scr.querySelector('.xyp-msgs'); if (m) m.scrollTop = m.scrollHeight; }
    if (o.p === 'call') renderCall();
  });
  const render = (...a) => { const t = performance.now(); const r = render0(...a); applySq(); const d = performance.now() - t; if (d > 120) console.warn('[xy-phone] 渲染较慢 ' + Math.round(d) + 'ms（' + (cur().p || '') + '）'); return r; };

  // 头像：缩成 128px 方图再存，避免聊天文件变大
  const fileIn = doc.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none'; root.appendChild(fileIn);
  const toSmall = (file) => new Promise((res, rej) => {
    const fr = new win.FileReader(); fr.onerror = () => rej(new Error('读取失败'));
    fr.onload = () => { const im = new win.Image(); im.onerror = () => rej(new Error('不是图片')); im.onload = () => { const s = Math.min(im.width, im.height); const cv = doc.createElement('canvas'); cv.width = cv.height = 128; cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 128, 128); res(cv.toDataURL('image/jpeg', 0.82)); }; im.src = fr.result; };
    fr.readAsDataURL(file);
  });
  let upTarget = '';
  fileIn.addEventListener('change', guard('头像', async () => {
    const fs = [...(fileIn.files || [])]; const f = fs[0]; fileIn.value = ''; fileIn.multiple = false; if (!f) return;
    if (upTarget === 'al') { const c = cur().tab || '生活'; let n = 0; for (const x of fs.slice(0, 30)) { try { await mineAdd(c, await toBig(x, 900)); n++; } catch (er) { /* 跳过非图片 */ } } tip(n ? '已添加 ' + n + ' 张' : '没有可用的图片'); return; }
    if (upTarget === 'stk') { try { if (f.type === 'image/gif' && f.size < 400000) { const d = await new Promise((res, rej) => { const fr = new win.FileReader(); fr.onerror = () => rej(new Error('读取失败')); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); stkAdd(d); } else stkAdd(await toBig(f, 200)); } catch (er) { tip('添加失败：' + (er.message || er)); } openStk(false); return; }
    if (upTarget === 'img') { imgPend = imgPut(await toBig(f, 480)); const pi = $('xyp-dlg-pi'); if (pi) pi.textContent = '已选择：' + f.name; return; }
    if (upTarget === 'wp' || /^ic:/.test(upTarget)) { decoRead(); const d = decoD(); const u = await toBig(f, upTarget === 'wp' ? 720 : 96); if (upTarget === 'wp') d.wp = u; else d.ic[upTarget.slice(3)] = u; saveCfg(); applyTheme(); render(); return; }
    if (upTarget === 'bg') { const o2 = cur(); o2.bg = imgPut(await toBig(f, 720)); render(); return; }
    const url = await toSmall(f); const o = cur();
    if (upTarget === 'user') { D().user.avatar = url; save(); render(); }
    else if (upTarget === 'lvme') { const L = LV(); (L.me || (L.me = {})).avatar = url; save(); render(); }
    else if (upTarget === 'pfav') { const r = roomAt(o); if (r) { profOf(r).av = url; save(); render(); const pv = $('xyp-pf-av'); if (pv) pv.innerHTML = av(url, r.name, 'lg'); } }
    else if (upTarget === 'contact') { o.av = url; const box = $('xyp-cav'); if (box) { const imgHtml = av(url, '新'); box.firstElementChild.outerHTML = imgHtml; } }
  }));

  const themeStyle = doc.createElement('style'); themeStyle.id = 'xyp-theme-css'; doc.head.appendChild(themeStyle); const decoStyle = doc.createElement('style'); decoStyle.id = 'xyp-deco-css'; doc.head.appendChild(decoStyle);


  const SB = { r: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>', s: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>', g: '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>' };
  const syncSend = () => { const i = $('xyp-in'), b = $('xyp-sb'); if (!i || !b) return; const h = !!i.value.trim(); if ((b.dataset.act === 'send') !== h) { b.dataset.act = h ? 'send' : 'reply'; b.innerHTML = h ? SB.s : SB.r; b.title = h ? '发送' : '让TA回复'; } };
  winEl.addEventListener('input', (e) => { if (e.target.id === 'xyp-in') syncSend(); });
  winEl.addEventListener('input', (e) => { if (e.target.id === 'xyp-sq') { setQ = e.target.value; applySq(); } });
  winEl.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('.xyp-comp button')) e.preventDefault(); });
  winEl.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.wbe) { const off = cfg.wbOff || (cfg.wbOff = []); const i = off.indexOf(t.dataset.wbe); if (t.checked && i >= 0) off.splice(i, 1); else if (!t.checked && i < 0) off.push(t.dataset.wbe); saveCfg(); } });
  let cpBusy = 0;
  const cpReply = guard('对方回复', async (i) => { const c = (((D().cp.wechat || {}).data || {}).chats || [])[i]; if (!c || cpBusy) return; cpBusy = 1; tip('对方正在回复…'); try { const ch = cName(getC('char')); const hist = (c.msgs || []).slice(-12).map((m) => (m.from === 'me' ? ch : c.name) + '：' + m.text).join('\n'); const out = await callAPI([{ role: 'system', content: `你扮演「${c.name}」${c.relation || c.rel ? '（' + (c.relation || c.rel) + '）' : ''}，正在微信里和「${ch}」聊天。只输出你发的消息，一条一行，口语化，1~3条，不要旁白和引号，要承接聊天记录，符合你的身份和与${ch}的关系。` }, { role: 'user', content: `聊天记录：\n${hist}\n\n请接着回复。` }], { max: 200, f: 'cp' }); const ls = String(out).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3); ls.forEach((t) => (c.msgs || (c.msgs = [])).push({ from: 'them', text: t })); if (ls.length) pushEvent(`${c.name}回复了${ch}：「${clip(ls[0], 30)}」`, true); save(); } catch (e) { tip(e.message || String(e)); } finally { cpBusy = 0; render(); } });
  winEl.addEventListener('click', (e) => { const o = cur(); if (o && o.plus && e.target.closest && !e.target.closest('.xyp-plus,[data-act=plus]')) { o.plus = false; const pl = winEl.querySelector('.xyp-plus'); if (pl) pl.classList.remove('on'); } });
  const fetchModelsFor = async (k) => { if (k === 'main') return fetchModels(); const a = (cfg.ap && cfg.ap[k]) || {}; if (k === 'ig' && !(a.url || '').trim()) throw new Error('请先填生图接口的地址'); const bak = [cfg.url, cfg.key]; if (a.url) { cfg.url = a.url; cfg.key = a.key || ''; } try { return await fetchModels(); } finally { cfg.url = bak[0]; cfg.key = bak[1]; } };
  dlgEl.addEventListener('click', (e) => { if (e.target === dlgEl) closeBox(); });
  const autoT = {};
  const autoWait = (id) => { clearTimeout(autoT[id]); let idle = 0; const t0 = Date.now(); const tick = () => { const i = $('xyp-in'); const busy = i && i.value.trim(); idle = busy ? 0 : idle + 1; if (idle >= 4 || Date.now() - t0 > 120000) { askReply(id); return; } autoT[id] = setTimeout(tick, 500); }; autoT[id] = setTimeout(tick, 600); };
  const syncCall = () => { const b = winEl.querySelector('[data-act=callsend]'); const i = $('xyp-cin'); if (b && i) b.textContent = call && call.multi && !i.value.trim() ? '接收' : '发送'; };
  winEl.addEventListener('input', (e) => { if (e.target.id === 'xyp-cin') syncCall(); });
  winEl.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.callmulti !== undefined && call) { call.multi = e.target.checked; syncCall(); } });
  // ===== 朋友圈：共用一份动态；微信里以「我」操作，查手机里以「角色」操作（=帮他发/点/评，角色知道，其他人通常不知道）=====
  const MM = () => { const d = D(); return d.mom || (d.mom = []); };
  const mn = (id) => (id === 'u' ? myNick() : (getC(id) ? cName(getC(id)) : '?'));
  const mav = (id) => (id === 'u' ? av(uAv(), myNick(), 'sm') : av(getC(id) ? cAv(getC(id)) : '', mn(id), 'sm'));
  const mdt = (ts) => { const x = new Date(ts); return (x.getMonth() + 1) + '-' + x.getDate() + ' ' + hhmm(ts); };
  const momBusy = {};
  const momRow = (as) => { const l = MM().slice(-1)[0]; return `<div class="xyp-li" data-act="mom" data-as="${as}"><span class="xyp-av xyp-avt" style="background:#f59e0b">圈</span><div class="m"><b>${as === 'c' ? esc(cName(getC('char'))) + '的朋友圈' : '朋友圈'}</b><small>${l ? esc(mn(l.a) + '：' + clip(l.t, 22)) : '还没有动态'}</small></div></div>`; };
  const momEv = (as, txt, who) => { // 记录到正文：user自己操作→涉及角色才告知；帮角色操作→角色一定知道
    if (cfg.momSync === 'off') return; const u = myNick(); const c = cName(getC('char'));
    if (as === 'c') pushEvent(`${u}拿${c}的手机${txt}（帮${c}操作：${c}知道，其他人通常不知道是帮发，除非上下文显示能察觉）`, 1);
    else pushEvent(`${u}${txt}`, who === 'char' || who === 'all' ? 1 : 0);
  };
  function pageMom(o) {
    const as = o.as || 'u'; const me = as === 'c' ? 'char' : 'u'; const l = MM().slice().reverse(); const c = cName(getC('char'));
    const top = `<div class="xyp-center" style="padding:10px 0"><span class="xyp-btn pri" data-act="mpost">${as === 'c' ? '替' + esc(c) + '发' : '发朋友圈'}</span><span class="xyp-btn" data-act="mgen">${momBusy.g ? '生成中…' : '生成朋友圈'}</span></div>${as === 'c' ? `<div class="xyp-tip" style="text-align:center">在这里点赞、评论、发布都是帮${esc(c)}操作</div>` : ''}${genErr.mom ? `<div class="xyp-sys">${esc(genErr.mom)}</div>` : ''}`;
    if (!l.length) return `<div class="xyp-pg">${top}<div class="xyp-tip" style="text-align:center;padding:30px">还没有动态，点「生成朋友圈」</div></div>`;
    return `<div class="xyp-pg">${top}${l.map((p) => `<div class="xyp-li" style="align-items:flex-start;flex-wrap:wrap">${mav(p.a)}<div class="m" style="min-width:0"><b>${esc(mn(p.a))}</b><div style="white-space:pre-wrap;word-break:break-word;margin:3px 0">${esc(p.t)}</div><small>${mdt(p.ts)}${p.a === me ? ` <span data-act="mdel" data-id="${p.id}" style="cursor:pointer">删除</span>` : ''}</small>
<div style="margin-top:6px;display:flex;gap:14px;font-size:13px"><span data-act="mlike" data-id="${p.id}" style="cursor:pointer">${p.lk.includes(me) ? '♥' : '♡'} 赞</span><span data-act="mcm" data-id="${p.id}" style="cursor:pointer">评论</span><span data-act="mgc" data-id="${p.id}" style="cursor:pointer">${momBusy[p.id] ? '生成中…' : '生成评论'}</span></div>
${p.lk.length || p.cm.length ? `<div style="margin-top:6px;padding:6px 8px;background:rgba(128,128,128,.12);font-size:13px">${p.lk.length ? '♥ ' + esc(p.lk.map(mn).join('、')) : ''}${p.cm.map((x) => `<div><b>${esc(mn(x.w))}</b>：${esc(x.t)}</div>`).join('')}</div>` : ''}</div></div>`).join('')}</div>`;
  };
  const momFind = (nm) => { const d = D(); nm = String(nm || '').trim(); if (!nm) return ''; const x = d.contacts.find((q) => !q.isGroup && (cName(q) === nm || q.name === nm || q.nick === nm || q.remark === nm)); return x ? x.id : ''; };
  const momCtx = () => { const d = D(); const c = cName(getC('char')); const u = myNick(); const ppl = d.contacts.filter((x) => !x.isGroup && wxOk(x)).map((x) => cName(x) + (x.isChar ? '（本人，主角）' : x.rel ? '（' + x.rel + '）' : '') + (!x.isChar && x.persona ? '：' + clip(x.persona, 40) : '')).join('\n');
    return { c, u, sys: `你要为微信朋友圈生成内容。朋友圈里的人只能是下面名单中的人，不能代替${u}发言或点赞，不要出现英文双引号。只输出 JSON，不要代码块和说明。`, ctx: `角色设定：\n${clip(charCard(), 450)}\n\n名单：\n${ppl}\n\n近期剧情：\n${storyText(Number(cfg.ctxN) || 6, 800) || '（暂无）'}\n\n已有动态：\n${MM().slice(-4).map((p) => mn(p.a) + '：' + clip(p.t, 40)).join('\n') || '（无）'}` }; };
  const genMoments = guard('朋友圈', async () => {
    if (momBusy.g) return; momBusy.g = true; genErr.mom = ''; render();
    try {
      const k = momCtx(); const out = await callAPI([{ role: 'system', content: k.sys }, { role: 'user', content: k.ctx + `\n\n请生成3条新朋友圈，来自名单里不同的人（${k.c}可以发1条，内容要贴合他的性格与近期心情）。每条带0~3个点赞人、0~2条评论（评论人也只能来自名单）。\n格式：{"posts":[{"who":"名单里的名字","t":"朋友圈文字，可含表情","likes":["名字"],"cm":[{"w":"名字","t":"评论"}]}]}` }], { max: 1000, f: 'cp' });
      const j = parseJSON(out); const l = MM(); const cs = [];
      (j.posts || []).slice(0, 4).forEach((p, i) => { const a = momFind(p.who); if (!a || !p.t) return; const ts = Date.now() - (3 - i) * 600000; l.push({ id: 'm' + Date.now().toString(36) + i, a, t: String(p.t).slice(0, 300), ts, lk: (p.likes || []).map(momFind).filter(Boolean), cm: (p.cm || []).map((x) => ({ w: momFind(x.w), t: String(x.t || '').slice(0, 120), ts })).filter((x) => x.w && x.t) }); if (a === 'char') cs.push(p.t); });
      while (l.length > 40) l.shift(); save();
      if (cs.length && cfg.momSync !== 'off') pushEvent(`${k.c}发了朋友圈：「${clip(cs[0], 60)}」`, 1);
    } catch (e) { genErr.mom = e.message || String(e); } finally { momBusy.g = false; render(); }
  });
  const genMomCm = guard('评论', async (id) => {
    const p = MM().find((x) => x.id === id); if (!p || momBusy[id]) return; momBusy[id] = true; render();
    try {
      const k = momCtx(); const out = await callAPI([{ role: 'system', content: k.sys }, { role: 'user', content: k.ctx + `\n\n请为这条朋友圈生成1~3条评论（评论人来自名单、符合各自关系和性格，${k.c}若是朋友也可评论）：\n${mn(p.a)}：${p.t}\n已有评论：${p.cm.map((x) => mn(x.w) + '：' + x.t).join('；') || '（无）'}\n格式：{"cm":[{"w":"名字","t":"评论"}]}` }], { max: 400, f: 'cp' });
      const j = parseJSON(out); (j.cm || []).slice(0, 3).forEach((x) => { const w = momFind(x.w); if (w && x.t) { p.cm.push({ w, t: String(x.t).slice(0, 120), ts: Date.now() }); if (w === 'char' && cfg.momSync !== 'off') pushEvent(`${k.c}评论了${mn(p.a)}的朋友圈：「${clip(x.t, 40)}」`, 1); } }); save();
    } catch (e) { genErr.mom = e.message || String(e); } finally { momBusy[id] = false; render(); }
  });
  const momAct = (a, t) => {
    const o = cur(); const as = o.as || 'u'; const me = as === 'c' ? 'char' : 'u'; const p = MM().find((x) => x.id === t.dataset.id);
    if (a === 'mom') go('mom', { as: t.dataset.as });
    else if (a === 'mgen') genMoments();
    else if (a === 'mgc') { const q = MM().find((x) => x.id === t.dataset.id); if (q && q.cm.length) pickBox('生成评论', [['接着生成'], ['重新生成']], (i) => { if (i === 1) { q.cm = []; save(); } genMomCm(q.id); }); else genMomCm(t.dataset.id); }
    else if (a === 'mpost') inputBox(as === 'c' ? '替' + cName(getC('char')) + '发朋友圈' : '发朋友圈', '这一刻的想法…', (v) => { v = (v || '').trim(); if (!v) return; const np = { id: 'm' + Date.now().toString(36), a: me, t: v.slice(0, 300), ts: Date.now(), lk: [], cm: [] }; MM().push(np); save(); if (as === 'u') setTimeout(() => genMomCm(np.id), 300); momEv(as, as === 'c' ? `发了朋友圈：「${clip(v, 60)}」` : `发了朋友圈：「${clip(v, 60)}」`, 'all'); render(); });
    else if (!p) return;
    else if (a === 'mdel') { const l = MM(); l.splice(l.indexOf(p), 1); save(); render(); }
    else if (a === 'mlike') { const i = p.lk.indexOf(me); if (i >= 0) p.lk.splice(i, 1); else { p.lk.push(me); momEv(as, `给${mn(p.a)}的朋友圈点了赞：「${clip(p.t, 24)}」`, p.a === 'char' ? 'char' : ''); } save(); render(); }
    else if (a === 'mcm') inputBox('评论 ' + mn(p.a), '说点什么…', (v) => { v = (v || '').trim(); if (!v) return; p.cm.push({ w: me, t: v.slice(0, 120), ts: Date.now() }); save(); momEv(as, `评论了${mn(p.a)}的朋友圈「${clip(p.t, 24)}」：「${clip(v, 50)}」`, p.a === 'char' ? 'char' : ''); render(); if (as === 'u') genMomCm(p.id); });
  };
  // ===== 快速自定义（气泡/字体/壁纸/图标）→ 生成 CSS，可导出，也可当主题导入 =====
  const APP_N = { wx: '微信', cp: '查手机', live: '直播', mywal: '钱包', shop: '购物', loc: '定位', album: '角色图册', theme: '美化', settings: '设置' };
  const decoD = () => { if (!cfg.deco) cfg.deco = {}; if (!cfg.deco.ic) cfg.deco.ic = {}; return cfg.deco; };
  const hexOK = (h) => /^#[0-9a-f]{6}$/i.test(h || '');
  const inkOf = (h) => { const n = parseInt(h.slice(1), 16); return (((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000) > 150 ? '#111' : '#fff'; };
  const cssUrl = (u) => 'url("' + String(u).replace(/["\\\n\r<]/g, '') + '")';
  const decoCss = () => {
    const d = cfg.deco || {}; let c = '';
    if (d.font) { const u = /^(https?:|data:)/.test(d.font); c += (u ? '@font-face{font-family:xypf;src:' + cssUrl(d.font) + '}' : '') + '#xyp-win,#xyp-win input,#xyp-win textarea,#xyp-win button,#xyp-win select{font-family:' + (u ? 'xypf' : String(d.font).replace(/[;{}<]/g, '')) + ',sans-serif!important}\n'; }
    const r = d.r !== undefined && d.r !== '' ? 'border-radius:' + (Number(d.r) || 0) + 'px!important;' : '';
    if (hexOK(d.ot) || r) c += '#xyp-win .xyp-row.ot .xyp-bub{' + (hexOK(d.ot) ? 'background:' + d.ot + '!important;color:' + inkOf(d.ot) + '!important;' : '') + r + '}\n';
    if (hexOK(d.me) || r) c += '#xyp-win .xyp-row.me .xyp-bub{' + (hexOK(d.me) ? 'background:' + d.me + '!important;color:' + inkOf(d.me) + '!important;' : '') + r + '}\n';
    if (d.wp) c += '#xyp-win .xyp-home{background:' + cssUrl(d.wp) + ' center/cover;min-height:100%}#xyp-win .xyp-home .xyp-clock,#xyp-win .xyp-home .xyp-app b,#xyp-win .xyp-home .xyp-tip{color:#fff!important;text-shadow:0 1px 3px rgba(0,0,0,.65)}\n';
    if (d.wp && d.wi) { Object.keys(APP_N).filter((k) => !(d.ic || {})[k]).forEach((k) => { c += '#xyp-win:is(.th-bw,.th-night) .xyp-home .xyp-app[data-p="' + k + '"] i,#xyp-win:is(.th-bw,.th-night) .xyp-home .xyp-app[data-p="' + k + '"]:hover i{background:#fff!important;color:#111!important;border-color:#111!important}\n'; }); c += '#xyp-win:is(.th-bw,.th-night) .xyp-home .xyp-app b{display:inline-block;background:#111;color:#fff!important;text-shadow:none!important;padding:1px 8px;border-radius:2px}\n'; }
    Object.keys(d.ic || {}).forEach((k) => { if (/^\w+$/.test(k) && d.ic[k]) c += '#xyp-win .xyp-app[data-p="' + k + '"] i{background:' + cssUrl(d.ic[k]) + ' center/cover!important;font-size:0!important;border:0!important;border-radius:14px!important}#xyp-win .xyp-app[data-p="' + k + '"] i::before{content:none!important}\n'; });
    return c;
  };
  const decoRead = () => {
    const d = decoD(); const v = (i) => { const e = $(i); return e ? e.value.trim() : null; };
    const col = (i, def) => { const x = v(i); return x && x.toLowerCase() !== def ? x : ''; };
    if ($('xyp-d-me')) { d.me = col('xyp-d-me', '#95ec69'); d.ot = col('xyp-d-ot', '#ffffff'); d.r = v('xyp-d-r'); }
    const keep = (cur, x) => (x === '已上传图片' ? cur : x);
    if ($('xyp-d-font')) d.font = keep(d.font, v('xyp-d-font'));
    if ($('xyp-d-wp')) d.wp = keep(d.wp, v('xyp-d-wp'));
    if ($('xyp-d-wi')) d.wi = $('xyp-d-wi').checked;
    Object.keys(APP_N).forEach((k) => { const x = v('xyp-d-ic-' + k); if (x !== null) { const y = keep(d.ic[k], x); if (y) d.ic[k] = y; else delete d.ic[k]; } });
  };
  const decoHtml = (o) => { const d = cfg.deco || {}; const ic = d.ic || {}; const sh = (x) => (x && /^data:/.test(x) ? '已上传图片' : x || '');
    return `<div class="xyp-h">快速自定义</div>
<div class="xyp-f"><label>对方气泡</label><input id="xyp-d-ot" type="color" value="${hexOK(d.ot) ? d.ot : '#ffffff'}"></div>
<div class="xyp-f"><label>我的气泡</label><input id="xyp-d-me" type="color" value="${hexOK(d.me) ? d.me : '#95ec69'}"></div>
<div class="xyp-f"><label>气泡圆角</label><input id="xyp-d-r" type="number" min="0" max="24" value="${esc(d.r === undefined ? '' : d.r)}" placeholder="像素，留空=不改"></div>
<div class="xyp-f"><label>字体</label><input id="xyp-d-font" value="${esc(sh(d.font))}" placeholder="字体名，或字体文件链接(.ttf/.woff2)"></div>
<div class="xyp-f"><label>壁纸</label><input id="xyp-d-wp" value="${esc(sh(d.wp))}" placeholder="图片链接（留空=无）"></div>
<div class="xyp-center"><span class="xyp-btn" data-act="updeco" data-t="wp">上传壁纸</span><span class="xyp-btn" data-act="wpclr">恢复默认壁纸</span></div>
${/^(bw|night)$/.test(cfg.theme || '') ? `<label class="xyp-f xyp-tog" style="display:flex;align-items:center;justify-content:space-between"><span><span style="font-size:14px">壁纸太深时：图标白底、文字黑底</span><span class="xyp-tip" style="display:block;padding:2px 0 0">仅黑白、黑白·夜主题可用，点「应用」生效</span></span><input type="checkbox" id="xyp-d-wi" ${d.wi ? 'checked' : ''}></label>` : ''}
<details style="padding:4px 14px"><summary class="xyp-tip" style="cursor:pointer">更换桌面图标</summary>${Object.keys(APP_N).map((k) => `<div class="xyp-f"><label>${APP_N[k]}</label><input id="xyp-d-ic-${k}" value="${esc(sh(ic[k]))}" placeholder="图标链接"><span class="xyp-btn" data-act="updeco" data-t="ic:${k}" style="margin:0 0 0 6px">上传</span></div>`).join('')}</details>
<div class="xyp-center"><span class="xyp-btn pri" data-act="decoapply">应用</span><span class="xyp-btn" data-act="decoexp">导出CSS</span><span class="xyp-btn" data-act="decoclr">重置</span></div>
${o.exp ? `<div class="xyp-f"><textarea id="xyp-d-out" readonly onclick="this.select()">${esc(o.exp)}</textarea></div><div class="xyp-tip" style="padding:0 14px">已尝试复制；也可把它粘贴到下面「导入主题」的 CSS 框，别人就能用</div>` : ''}
`; };

  // ===== 角色图册（只读；图来自作者的在线 JSON，本地缓存）=====
  const AL_KEY = 'xy_phone_album'; let alb;
  const albInit = () => { if (alb === undefined) { try { alb = JSON.parse(store.get(AL_KEY, 'null')); } catch (e) { alb = null; } } return alb; };
  const albCats = () => { const a = albInit(); return (a && a.data && a.data.cats) || ALBUM_EMBED; };
  const albList = (c) => (albCats()[c] || []).map((x) => (typeof x === 'string' ? { u: x } : x)).filter((x) => x && /^(https?:|data:image)/.test(x.u || ''));
  const albumOn = () => cfg.albumOff !== '1' && (ALBUM_ALWAYS || ALBUM_USER || !!ALBUM_URL || albList('生活').length + albList('私密').length > 0);
  const albDec = async (buf) => { const sb = win.crypto && win.crypto.subtle; if (!sb) throw new Error('解密需要 https 或 localhost 访问酒馆'); const b = new Uint8Array(buf); const k = await sb.importKey('raw', await sb.digest('SHA-256', new TextEncoder().encode(ALBUM_KEY)), 'AES-GCM', false, ['decrypt']); return sb.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, k, b.slice(12)); };
  const albFetch = async (u) => { let err; for (const h of ['', 'testingcf.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net']) { try { const r = await win.fetch(h ? u.replace('cdn.jsdelivr.net', h) : u); if (r.ok) return r; err = new Error('HTTP ' + r.status); } catch (e) { err = e; } if (!/cdn\.jsdelivr\.net/.test(u)) break; } throw err; };
  const albBlobs = {};
  const albShow = (root) => root.querySelectorAll('img[data-enc]').forEach(async (im) => { const u = im.dataset.enc; try { if (!albBlobs[u]) albBlobs[u] = URL.createObjectURL(new Blob([await albDec(await (await albFetch(u).catch(() => albFetch(u.replace('/img/', '/')))).arrayBuffer())])); im.src = albBlobs[u]; im.removeAttribute('data-enc'); } catch (e) { im.removeAttribute('data-enc'); im.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="8" y="100" font-size="14">' + String((e && e.message) || e).slice(0, 22).replace(/[<&]/g, '') + '</text></svg>'); } });
  const albSrc = (x) => ' data-noav="1" draggable="false"' + (x.enc ? ` data-enc="${esc(x.u)}"${albBlobs[x.u] ? ` src="${albBlobs[x.u]}"` : ''}` : ` src="${esc(x.u)}"`);
  const albLoad = guard('图册', async (force) => { albInit(); if (!ALBUM_URL || (!force && alb && Date.now() - alb.ts < 1728e5)) return; if (force) tip('正在刷新…'); const r = await albFetch(ALBUM_URL + (ALBUM_URL.indexOf('?') < 0 ? '?' : '&') + '_=' + (force ? Date.now() : Math.floor(Date.now() / 1728e5))); let j; if (ALBUM_KEY) { j = JSON.parse(new TextDecoder().decode(await albDec(await r.arrayBuffer()))); Object.keys(j.cats || {}).forEach((c) => { j.cats[c] = j.cats[c].map((x) => ({ ...(typeof x === 'string' ? { u: x } : x), u: new URL(typeof x === 'string' ? x : x.u, ALBUM_URL).href, enc: 1 })); }); } else j = await r.json(); if (j && j.cats) { alb = { ts: Date.now(), data: j }; store.set(AL_KEY, JSON.stringify(alb)); if (cur().p === 'album') render(); if (force) tip('已刷新'); } });
  let mine = null;
  const idb = () => new Promise((res, rej) => { const r = win.indexedDB.open('xy_phone_album', 1); r.onupgradeneeded = () => r.result.createObjectStore('i', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbDo = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('i', mode); const q = fn(t.objectStore('i')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  const mineLoad = guard('我的图册', async () => { mine = ((await idbDo('readonly', (st) => st.getAll())) || []).sort((a, b) => a.ts - b.ts); if (cur().p === 'album') render(); });
  const albAll = (c) => albList(c).concat((mine || []).filter((x) => x.c === c));
  const mineAdd = async (c, u) => { await idbDo('readwrite', (st) => st.put({ id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 999), c, u, ts: Date.now() })); await mineLoad(); };
  const alAsk = (o) => inputBox('私密相册密码（4位数字）', '输入密码', (v) => { v = (v || '').trim(); if (v === cfg.alPw || v === '1111') { o.un = true; render(); } else tip('密码不对'); }, '');
  function pageAlbum(o) {
    albLoad(); if (ALBUM_USER && mine === null) mineLoad(); const tab = o.tab || '生活'; const lock = tab === '私密' && !adultOn(); const pwl = tab === '私密' && !lock && !!cfg.alPw && !o.un; const l = (lock || pwl) ? [] : albAll(tab);
    return `<div class="xyp-pg"><div class="xyp-center" style="padding:10px 0;position:relative">${tab === '私密' && !lock && !pwl ? '<span data-act="alpw" title="密码设置" style="position:absolute;right:12px;top:12px;cursor:pointer;padding:2px"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' : ''}${['生活', '私密'].map((c) => `<span class="xyp-btn${c === tab ? ' pri' : ''}" data-act="altab" data-t="${c}">${c}</span>`).join('')}${ALBUM_URL ? '<span data-act="alref" title="刷新" style="cursor:pointer;font-size:15px;opacity:.6;margin-left:8px">↻</span>' : ''}</div>${(setTimeout(() => albShow(scr), 0), '')}${ALBUM_USER && !lock && !pwl ? `<div class="xyp-center" style="padding-bottom:8px"><span class="xyp-btn" data-act="aladd">＋ 添加图片</span><span class="xyp-btn" data-act="aladdurl">用图片链接</span></div>` : ''}${l.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px 12px">${l.map((x, i) => `<img data-act="alview" data-i="${i}"${albSrc(x)} loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;cursor:pointer">`).join('')}</div>` : `<div class="xyp-tip" style="text-align:center;padding:40px 20px">${lock ? '私密分类已关闭（设置 → 直播R18选项）' : pwl ? '私密相册已加密<br><br><span class="xyp-btn pri" data-act="alunlock">输入密码</span>' : ALBUM_USER && !l.length ? '还没有图片，点上面「添加图片」收藏吧（只存在你自己的浏览器里）' : ALBUM_URL || albList('生活').length + albList('私密').length ? '这个分类还没有图片' : '作者还没有上传图片'}</div>`}</div>`;
  }
  const albView = (tab, i) => { const l = albAll(tab); if (!l[i]) return; const x = l[i]; showDlg(`<div style="text-align:center"><img${albSrc(x)} style="max-width:100%;max-height:58vh;display:block;margin:0 auto 8px">${x.t ? `<div style="margin-bottom:8px">${esc(x.t)}</div>` : ''}<span class="xyp-btn" data-act="alview" data-i="${(i + l.length - 1) % l.length}">上一张</span><span class="xyp-btn" data-act="dlgno">关闭</span>${x.id ? `<span class="xyp-btn" data-act="aldel" data-id="${x.id}">删除</span>` : ''}<span class="xyp-btn" data-act="alview" data-i="${(i + 1) % l.length}">下一张</span></div>`); albShow(dlgEl); };
  const applyTheme = () => {
    let id = cfg.theme || 'orig'; if (!BUILTIN.some((t) => t.id === id) && !customTh.some((t) => t.id === id)) { id = 'orig'; cfg.theme = id; }
    [...winEl.classList].filter((c) => c.startsWith('th-')).forEach((c) => winEl.classList.remove(c)); winEl.classList.add('th-' + id); [...fab.classList].filter((c) => c.startsWith('th-')).forEach((c) => fab.classList.remove(c)); fab.classList.add('th-' + id);
    const cu = customTh.find((t) => t.id === id); themeStyle.textContent = cu ? String(cu.css).replace(/<\/style/gi, '') : ''; decoStyle.textContent = decoCss();
  };
  const addTheme = (name, css) => { css = String(css || '').trim(); if (!css) throw new Error('CSS 是空的'); if (css.length > 200000) throw new Error('主题太大（超过 200KB）'); customTh.push({ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name || '自定义主题').slice(0, 20), css }); saveCustom(); };
  const thFile = doc.createElement('input'); thFile.type = 'file'; thFile.accept = '.json,.css,text/css,application/json'; thFile.style.display = 'none'; root.appendChild(thFile);
  thFile.addEventListener('change', guard('导入主题', async () => {
    const f = thFile.files && thFile.files[0]; thFile.value = ''; if (!f) return; const o = cur(); let msg = '';
    try {
      const txt = await f.text(); const base = f.name.replace(/\.[^.]+$/, '');
      if (/\.css$/i.test(f.name)) { addTheme(base, txt); msg = '已导入「' + base + '」，点它即可使用'; }
      else { const j = JSON.parse(txt); const arr = Array.isArray(j) ? j : [j]; let n = 0; arr.forEach((t) => { if (t && typeof t.css === 'string') { addTheme(t.name || base, t.css); n++; } }); if (!n) throw new Error('JSON 里没有 css 字段'); msg = '已导入 ' + n + ' 个主题，点它即可使用'; }
    } catch (e) { msg = '导入失败：' + (e.message || e); }
    o.msg = msg; render();
  }));
  // 点击事件（统一处理）
  const onClick = guard('点击', (e) => {
    const t = e.target.closest ? e.target.closest('[data-act]') : null; if (!t || !winEl.contains(t)) return;
    const a = t.dataset.act; const o = cur();
    if (a === 'nback') back();
    else if (a === 'nhome') home();
    else if (a === 'batedit') { const c0 = CPN(); inputBox('手机电量（0-100）', '输入百分比，约12小时后恢复自动', (v) => { const x = Number(String(v || '').replace('%', '')); if (!isFinite(x) || String(v || '').trim() === '') return; batSet(c0, x, 'man'); render(); }, String(batGet(c0))); }
else if (a === 'open') { const p0 = t.dataset.p; const go0 = () => go(p0, p0 === 'wx' ? { tab: 'chats' } : {}); if ((p0 === 'cp' || p0 === 'live') && !cfg.adultAsk) ageGate(go0); else go0(); }
    else if (a === 'tab') { o.tab = t.dataset.tab; render(); }
    else if (a === 'chat') go('chat', { id: t.dataset.id });
    else if (a === 'newc') go('contact', { id: 'new' });
    else if (a === 'edit') go('contact', { id: t.dataset.id });
    else if (a === 'newg') go('group', { id: 'new' });
    else if (a === 'editg') go('group', { id: t.dataset.id });
    else if (a === 'genc') { if (npcBusy || gcBusy) return; pickBox('生成联系人', [['正文出现过但未添加的角色', '自动补全通讯录'], ['随机生成NPC', '按剧情随机一位']], (i) => (i === 0 ? genStory() : genNpc(true)), 1); }
    else if (a === 'saveg') {
      const nm = ($('xyp-g-name').value || '').trim(); const mem = [...scr.querySelectorAll('[data-gm]')].filter((i) => i.checked).map((i) => i.dataset.gm);
      if (!nm) { $('xyp-g-name').focus(); return; } if (mem.length < 1) { toast.innerHTML = '<b>群聊</b>至少选一位成员'; toast.dataset.id = ''; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 3000); return; }
      const d = D(); let g = o.id === 'new' ? null : getC(o.id);
      if (!g) { g = { id: 'g' + Date.now().toString(36), isGroup: true, isChar: false, remark: '', rel: '', avatar: '', know: 'auto' }; d.contacts.push(g); }
      g.name = nm; g.members = mem; save(); if (o.id === 'new') { nav.pop(); go('chat', { id: g.id }); } else back();
    }
    else if (/^(mom|mgen|mgc|mpost|mdel|mlike|mcm)$/.test(a)) momAct(a, t);
    else if (a === 'aladd') { upTarget = 'al'; fileIn.multiple = true; fileIn.click(); }
    else if (a === 'aladdurl') inputBox('图片链接', 'https://…（图片直链）', (v) => { v = (v || '').trim(); if (!/^https?:\/\//.test(v)) { tip('链接要以 http 开头'); return; } mineAdd(cur().tab || '生活', v); });
    else if (a === 'aldel') { const id = t.dataset.id; confirmBox('删除这张图', '只会删除你自己收藏的这张，不可恢复。', async () => { await idbDo('readwrite', (st) => st.delete(id)); await mineLoad(); }); }
    else if (a === 'updeco') { decoRead(); upTarget = t.dataset.t; fileIn.click(); }
    else if (a === 'wpclr') { decoRead(); const dd = decoD(); dd.wp = ''; saveCfg(); applyTheme(); render(); tip('已恢复默认壁纸'); }
else if (a === 'decoapply') { decoRead(); saveCfg(); applyTheme(); o.exp = ''; render(); tip('已应用'); }
    else if (a === 'decoexp') { decoRead(); saveCfg(); applyTheme(); o.exp = decoCss() || '/* 还没有自定义内容 */'; try { win.navigator.clipboard.writeText(o.exp).catch(() => 0); } catch (er) { /* ignore */ } render(); }
    else if (a === 'fabic') { cfg.fabIc = t.dataset.id; saveCfg(); setFab(); render(); }
    else if (a === 'fabc') { cfg.fabC = t.dataset.c || ''; saveCfg(); setFab(); render(); }
    else if (a === 'fabt') { const v = (($('xyp-fabt') || {}).value || '').trim(); if (!v) { tip('先输入一个字或表情'); return; } cfg.fabIc = 't:' + Array.from(v).slice(0, 2).join(''); saveCfg(); setFab(); render(); }
    else if (a === 'decoclr') { cfg.deco = {}; saveCfg(); applyTheme(); o.exp = ''; render(); }
    else if (a === 'alref') albLoad(true);
    else if (a === 'altab') { o.tab = t.dataset.t; render(); if (o.tab === '私密' && cfg.alPw && !o.un && adultOn()) alAsk(o); }
    else if (a === 'alunlock') alAsk(o);
    else if (a === 'alpw') { const has = !!cfg.alPw; pickBox('私密相册密码', has ? [['更改密码'], ['关闭密码']] : [['设置密码']], (i) => { if (i === 0) inputBox('设置4位数字密码', '如 2580（1111 始终可以打开）', (v) => { v = (v || '').trim(); if (!/^\d{4}$/.test(v)) { tip('请输入4位数字'); return; } cfg.alPw = v; saveCfg(); tip('密码已设置'); render(); }, ''); else { cfg.alPw = ''; saveCfg(); tip('密码已关闭'); render(); } }, 2); }
    else if (a === 'alview') albView(cur().tab || '生活', Number(t.dataset.i));
    else if (a === 'upbg') { upTarget = 'bg'; fileIn.click(); }
    else if (a === 'clrbg') { o.bg = ''; render(); }
    else if (a === 'upav') { upTarget = t.dataset.t; fileIn.click(); }
    else if (a === 'clrav') { if (t.dataset.t === 'lvme') { if (LV().me) delete LV().me.avatar; save(); render(); } else if (t.dataset.t === 'user') { D().user.avatar = ''; save(); render(); } else { o.av = ''; render(); } }
    else if (a === 'send') { const i = $('xyp-in'); if (i && i.value.trim()) { const v = i.value; i.value = ''; sendMsg(o.id, v); } }
    else if (a === 'reply') askReply(o.id);
    else if (a === 'savec') {
      const name = ($('xyp-f-name').value || '').trim(); if (o.id === 'new' && !name) { $('xyp-f-name').focus(); return; }
      const d = D(); let x = o.id === 'new' ? null : getC(o.id);
      if (!x) { x = { id: 'n' + Date.now().toString(36), isChar: false, avatar: '' }; d.contacts.push(x); }
      if (!x.isChar) x.name = name || x.name; else { if (name && name !== x.name) x.nick = name; else delete x.nick; }
      if ($('xyp-f-call')) x.callOn = $('xyp-f-call').value === '1'; if (o.bg !== undefined) x.callBg = o.bg; x.remark = ($('xyp-f-remark').value || '').trim(); x.rel = ($('xyp-f-rel').value || '').trim(); x.know = $('xyp-f-know').value; if ($('xyp-f-real')) { x.real = $('xyp-f-real').value.trim(); if (x.live && x.pid && LV().prof && LV().prof[x.pid]) LV().prof[x.pid].real = x.real; } if ($('xyp-f-kr')) x.kr = $('xyp-f-kr').value === '1';
      if ($('xyp-f-persona')) x.persona = $('xyp-f-persona').value.trim(); if (o.av !== undefined) x.avatar = o.av;
      save(); back();
    }
    else if (a === 'pinc') { const x9 = getC(t.dataset.id); if (x9) { x9.pin = !x9.pin; save(); render(); } }
    else if (a === 'clrchat') { if (!o.cc) { o.cc = true; render(); return; } D().msgs[o.id] = []; save(); o.cc = false; render(); }
    else if (a === 'delc2') { if (o.dc !== t.dataset.id) { o.dc = t.dataset.id; render(); return; } const d = D(); dropStreamer(getC(o.dc)); d.contacts = d.contacts.filter((x) => x.id !== o.dc); delete d.msgs[o.dc]; o.dc = ''; save(); render(); }
    else if (a === 'delc') { if (!o.del) { o.del = true; render(); return; } const d = D(); dropStreamer(getC(o.id)); d.contacts = d.contacts.filter((x) => x.id !== o.id); delete d.msgs[o.id]; save(); back(); }
    else if (a === 'pickm' || a === 'fetchig') { const k = a === 'fetchig' ? 'ig' : t.dataset.k; if (a === 'fetchig') o.m_ig = null; const set = (v) => { if (k === 'main') cfg.model = v; else { cfg.ap = cfg.ap || {}; (cfg.ap[k] || (cfg.ap[k] = {})).model = v; } saveCfg(); render(); }; const show = (l) => { mpCtx = { l, set }; showDlg(`<div class="bx"><b>选择模型（${l.length}）</b><input id="xyp-wbq" class="xyp-dlgi" placeholder="输入关键字搜索，如 claude / gemini" style="margin:8px 0"><div style="max-height:44vh;overflow-y:auto;text-align:left">${l.map((m, i) => `<div class="xyp-wbr" data-act="mpick" data-i="${i}" style="padding:9px 4px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px;cursor:pointer;word-break:break-all">${esc(m)}</div>`).join('')}</div><div class="xyp-center" style="margin-top:8px"><span class="xyp-btn" data-act="mman">手动输入</span>${k === 'main' ? '' : '<span class="xyp-btn" data-act="mclr">清空</span>'}</div><div class="bt"><span data-act="dlgno">取消</span></div></div>`); if (isD()) setTimeout(() => { const q = $('xyp-wbq'); if (q) q.focus(); }, 30); }; const key = 'm_' + k; if (o[key] && o[key].length) show(o[key]); else { tip('拉取模型中…'); fetchModelsFor(k).then((l) => { o[key] = l; show(l); }).catch((er) => { tip('拉取失败：' + (er.message || er)); }); } }
    else if (a === 'mpick') { const f = mpCtx; closeBox(); if (f) f.set(f.l[+t.dataset.i]); }
    else if (a === 'mman') { const f = mpCtx; inputBox('模型名', '如 gpt-4o-mini', (v) => f.set((v || '').trim()), ''); }
    else if (a === 'mclr') { const f = mpCtx; closeBox(); if (f) f.set(''); }
    else if (a === 'hkset') { hkCap = ''; hkDlg(); }
    else if (a === 'hkrow') { hkCap = t.dataset.id; hkDlg(); }
    else if (a === 'hkreset') { delete cfg.hkm; saveCfg(); hkCap = ''; hkDlg(); }
    else if (a === 'hkdone') { hkCap = ''; closeBox(); }
    else if (a === 'mylive') go('mylv', {});
    else if (a === 'pffol') { const r = roomAt(o); if (!r) return; const pf = profOf(r); pf.uf = !pf.uf; mutNow(pf); if (pf.uf && !pf.sf && Math.random() < 0.5) setTimeout(() => sFollow(r), 1500 + Math.random() * 2500); save(); render(); }
    else if (a === 'pflist') { const r = roomAt(o); if (!r) return; const pf = profOf(r); const fans = t.dataset.k === 'fans'; const me = LV().me || {}; const on = fans ? pf.uf : pf.sf; const priv = fans ? me.privFol : me.privFan; const n = fans ? pf.fans + (pf.uf ? 1 : 0) : pf.fo + (pf.sf ? 1 : 0); showDlg(`<div class="bx"><b>${fans ? '粉丝' : '关注'} ${fmtN(n)}</b><div style="text-align:left;margin-top:8px">${on ? `<div style="display:flex;gap:10px;align-items:center;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.25)">${av(lvAv(), lvNick(), 'sm')}<span style="flex:1">${esc(lvNick())}</span><small style="opacity:.6">${priv ? '仅你可见' : '公开'}</small></div>` : ''}<div style="opacity:.55;font-size:12px;padding:10px 2px">${on ? '其余' : ''}${fmtN(Math.max(0, n - (on ? 1 : 0)))} 位（不显示）</div></div><div class="bt"><span class="ok" data-act="dlgno">关闭</span></div></div>`); }
    else if (a === 'mylist') { const L = LV(); const P = Object.entries(L.prof || {}).filter(([, q]) => !q.gone).map(([id, q]) => Object.assign({}, q, { pid: id })); const k = t.dataset.k; const l = k === 'fol' ? P.filter((q) => q.uf) : k === 'fan' ? P.filter((q) => q.sf) : P.filter((q) => q.uf && q.sf); const me = L.me || {}; const priv = k === 'fol' ? me.privFol : k === 'fan' ? me.privFan : (me.privFol || me.privFan); showDlg(`<div class="bx"><b>${{ fol: '我的关注', fan: '我的粉丝', mut: '互相关注' }[k]}（${l.length}）</b><div style="font-size:11px;opacity:.6;margin:4px 0">${priv ? '私密：只有你自己能看到' : '公开：其他人都能看到'}</div><div style="max-height:44vh;overflow-y:auto;text-align:left">${l.length ? l.map((q) => `<div style="display:flex;gap:10px;align-items:center;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.25)">${av(imgSrc(q.av), q.nm, 'sm')}<span style="flex:1">${esc(q.nm)}</span>${q.uf && q.sf ? '<small style="opacity:.6">互关</small>' : ''}${k !== 'fol' ? `<span data-act="rmfan" data-pid="${q.pid}" style="cursor:pointer;font-size:12px;text-decoration:underline;margin-left:8px">移出粉丝</span>` : ''}</div>`).join('') : '<div style="opacity:.6;padding:16px 0;text-align:center">还没有</div>'}</div><div class="bt"><span class="ok" data-act="dlgno">关闭</span></div></div>`); }
    else if (a === 'lvpost') { inputBox('发动态', '想说点什么？', (v) => { v = (v || '').trim(); if (!v) return; const me = meD(); (me.posts || (me.posts = [])).unshift({ t: v, ts: Date.now(), cm: [], lk: [] }); me.posts = me.posts.slice(0, 20); save(); render(); if (Object.values(LV().prof || {}).some((q) => q.uf && q.sf)) confirmBox('生成评论？', '要让互相关注的主播来评论点赞吗？（会调用一次接口）', () => genUpCm()); }, ''); }
    else if (a === 'mpcm') genUpCm();
    else if (a === 'rmfan') { const pid = t.dataset.pid; const pf = (LV().prof || {})[pid]; if (!pf) return; confirmBox('移出粉丝', '把「' + pf.nm + '」移出粉丝列表？对方会收到提示；没删除这个主播的话，他可以来询问你。', () => { pf.sf = false; pf.mts = 0; const L = LV(); const r = ['normal', 'r18', 'keep'].flatMap((m) => L.rooms[m] || []).find((q) => q.pid === pid); const x = r ? streamerContact(r) : D().contacts.find((q) => q.pid === pid); if (x) { pushMsg(x.id, 'c', '（你把 TA 移出了粉丝列表）', Date.now(), null, 'sys'); x.rmf = 3; } save(); tip('已移出'); render(); }); }
    else if (a === 'mpdel') { const me = meD(); (me.posts || []).splice(Number(t.dataset.i), 1); save(); render(); }
    else if (a === 'tkopen') tkDlg();
    else if (a === 'tkapply') { const old = cfg.tkOld || {}; let n = 0; dlgEl.querySelectorAll('[data-tk]:checked').forEach((c) => { const it = TK.find((q) => q[0] === c.dataset.tk); if (!it) return; if (!(it[0] in old)) old[it[0]] = cfg[it[0]]; cfg[it[0]] = it[2]; n++; }); if (n) cfg.tkOld = old; saveCfg(); closeBox(); tip(n ? '已关闭 ' + n + ' 项' : '没有改动'); render(); }
    else if (a === 'tkrestore') { const old = cfg.tkOld || {}; Object.keys(old).forEach((k) => { cfg[k] = old[k]; }); delete cfg.tkOld; saveCfg(); closeBox(); tip('已恢复'); render(); }
    else if (a === 'mylive-x') { /* placeholder */ }
    else if (a === 'prof') go('prof', { m: o.m, i: o.i });
    else if (a === 'pfremark') { const r = roomAt(o); if (!r) return; const pf = profOf(r); inputBox('给主播的备注', '如：每晚都来的小哥', (v) => { pf.remark = (v || '').trim(); save(); render(); }, pf.remark); }
    else if (a === 'pfrefresh') { const r = roomAt(o); if (r && !pfBusy) genPosts(r, profOf(r)); }
    else if (a === 'pfgen') { const r = roomAt(o); if (!r || pfAvBusy) return; const pf = profOf(r); pfAvBusy = true; render(); igGen('头像，' + r.name + '，' + clip(r.persona, 60) + '，半身像，面部清晰', { max: 256, q: 0.85 }).then((id) => { pf.av = id; const pv = $('xyp-pf-av'); if (pv) pv.innerHTML = av(imgSrc(id), r.name, 'lg'); }).catch((e) => tip('生图失败：' + (e.message || e))).finally(() => { pfAvBusy = false; save(); if (cur().p === 'prof') render(); }); }
    else if (a === 'pfedit') { const r = roomAt(o); if (!r) return; confirmBox('修改主播信息', '是否修改主播信息？确认后可修改名字、直播间、人物设定等。', () => pfEditDlg(r)); }
    else if (a === 'pfsave') { const r = roomAt(o); if (!r) return; const g = (id) => ($(id) ? $(id).value.trim() : ''); const pf = profOf(r); const n = g('xyp-pf-n'); if (n) r.name = n; r.title = g('xyp-pf-t') || r.title; r.desc = g('xyp-pf-d'); r.viewers = Math.max(1, Number(g('xyp-pf-v')) || r.viewers); r.persona = g('xyp-pf-p'); pf.remark = g('xyp-pf-r'); pf.real = g('xyp-pf-real'); const x = r.cid && getC(r.cid); if (x) { x.name = r.name; x.persona = r.persona; x.real = pf.real; } closeBox(); save(); render(); }
    else if (a === 'fetchm') { o.mtip = '拉取中……'; render(); fetchModels().then((l) => { o.models = l; o.mtip = '已拉取 ' + l.length + ' 个模型，点模型框右侧可选择'; render(); }).catch((er) => { o.mtip = '✗ ' + (er.message || er); render(); }); }
    else if (a === 'wbpick') { const c = getCtx(); const names = (c && c.getWorldInfoNames && c.getWorldInfoNames()) || []; const imp = loadWbs(); const ch = cardChar(); const bn = ch && ch.data && ch.data.extensions && ch.data.extensions.world;
      const row = (attr, v, txt, on, x) => `<label class="xyp-wbr" style="display:flex;gap:8px;align-items:center;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px"><input type="checkbox" ${attr}="${esc(v)}" ${on ? 'checked' : ''}><span style="flex:1;word-break:break-all">${txt}</span>${x || ''}</label>`;
      const rows = [row('data-wbc', '1', '本卡绑定世界书' + (bn ? '（' + esc(bn) + '）' : ch && ch.data && ch.data.character_book ? '（卡内置）' : '（未发现）'), cfg.wbCard)].concat(names.map((n) => row('data-wbn', n, esc(n), (cfg.wbNames || []).includes(n))), imp.map((b) => row('data-wbi', b.id, esc(b.name) + '（导入）', (cfg.wbImp || []).includes(b.id), `<span data-act="wbdel" data-id="${esc(b.id)}" style="padding:0 6px;opacity:.6">✕</span>`))).join('');
      showDlg(`<div class="bx"><b>选择世界书</b><input id="xyp-wbq" class="xyp-dlgi" placeholder="输入关键字搜索" style="margin:8px 0"><div style="max-height:44vh;overflow-y:auto;text-align:left">${rows}</div><div class="bt"><span class="ok" data-act="dlgno">完成</span></div></div>`); }
    else if (a === 'wbent') { const open = () => { const es = wbCache.books.flat(); const off = cfg.wbOff || []; if (!es.length) { tip('还没有可用条目'); return; }
        showDlg(`<div class="bx"><b>条目开关（${es.length} 条，勾选 = 使用）</b><input id="xyp-wbq" class="xyp-dlgi" placeholder="输入关键字搜索" style="margin:8px 0"><div style="max-height:44vh;overflow-y:auto;text-align:left">${es.map((e) => `<label class="xyp-wbr" style="display:flex;gap:8px;align-items:flex-start;padding:7px 2px;border-bottom:1px solid rgba(128,128,128,.25);font-size:12px"><input type="checkbox" data-wbe="${esc(wbId(e))}" ${off.includes(wbId(e)) ? '' : 'checked'}><span style="flex:1;word-break:break-all">${esc((e.k.slice(0, 3).join('/') || '常驻') + '：' + clip(e.c, 30))}</span></label>`).join('')}</div><div class="bt"><span class="ok" data-act="dlgno">完成</span></div></div>`); };
      if (wbCache) open(); else { tip('读取条目中……'); wbText('').then(() => { if (wbCache) open(); else tip('读取不到条目：请先选好世界书'); }); } }
    else if (a === 'presave') { inputBox('预设名称（保存当前的 API 和世界书选择）', '如：公益站 + 全世界书', (v) => { v = (v || '').trim(); if (!v) return; const l = loadPre(); const d = {}; PKEYS.forEach((k) => { if (cfg[k] !== undefined) d[k] = JSON.parse(JSON.stringify(cfg[k])); }); const i = l.findIndex((q) => q.name === v); if (i >= 0) l[i].data = d; else l.push({ name: v, data: d }); savePre(l); render(); tip('已保存预设「' + v + '」'); }, ''); }
    else if (a === 'preuse') { const p = loadPre()[Number(t.dataset.i)]; if (!p) return; PKEYS.forEach((k) => { delete cfg[k]; }); Object.assign(cfg, JSON.parse(JSON.stringify(p.data))); wbCache = null; wbCacheL = null; Object.keys(o).forEach((k) => { if (/^m_|^models$/.test(k)) delete o[k]; }); saveCfg(); render(); tip('已切换到预设「' + p.name + '」'); }
    else if (a === 'preov') { const l = loadPre(); const p = l[Number(t.dataset.i)]; if (!p) return; const d = {}; PKEYS.forEach((k) => { if (cfg[k] !== undefined) d[k] = JSON.parse(JSON.stringify(cfg[k])); }); p.data = d; savePre(l); tip('已用当前设置覆盖「' + p.name + '」'); }
    else if (a === 'predel') { const i = Number(t.dataset.i); if (o.pdel !== i) { o.pdel = i; render(); tip('再点一次 ✕ 确认删除'); return; } const l = loadPre(); l.splice(i, 1); savePre(l); o.pdel = -1; render(); }
    else if (a === 'igtest') { o.igt = '生成中……'; render(); igGen('a red apple on a wooden table, soft light, simple').then((id) => { o.igt = { img: id }; render(); }).catch((e) => { o.igt = '✗ ' + (e.message || e); render(); }); }
    else if (a === 'wbmode') { cfg.wbMode = t.dataset.m; wbCache = null; wbCacheL = null; saveCfg(); render(); }
    else if (a === 'wbtog') { const g = t.dataset.t; const v = t.dataset.v; if (g === 'c') cfg.wbCard = !cfg.wbCard; else { const k = g === 'n' ? 'wbNames' : 'wbImp'; const l = cfg[k] || []; cfg[k] = l.includes(v) ? l.filter((q) => q !== v) : l.concat([v]); } wbCache = null; wbCacheL = null; saveCfg(); render(); }
    else if (a === 'wbcard') { cfg.wbMode = 'pick'; cfg.wbCard = true; wbCache = null; wbCacheL = null; saveCfg(); o.wbo = 1; render(); tip('已开启本卡绑定世界书'); }
    else if (a === 'wbdel') { closeBox(); saveWbs(loadWbs().filter((q) => q.id !== t.dataset.id)); cfg.wbImp = (cfg.wbImp || []).filter((q) => q !== t.dataset.id); wbCache = null; wbCacheL = null; saveCfg(); o.wbo = 1; render(); }
    else if (a === 'wbimp') { const fi = doc.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.onchange = () => { const f = fi.files && fi.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { let j; try { j = JSON.parse(String(rd.result).replace(/^\uFEFF/, '')); } catch (e0) { tip('导入失败：不是有效的 JSON'); return; } const es = normBook(j); if (!es || !es.length) { tip('没有识别到世界书条目'); return; } const id = 'w' + Date.now().toString(36); const a2 = loadWbs(); a2.push({ id, name: (j.name || f.name.replace(/\.json$/i, '')).slice(0, 30), es }); saveWbs(a2); cfg.wbImp = (cfg.wbImp || []).concat(id); if (!cfg.wbMode || cfg.wbMode === 'off') cfg.wbMode = 'pick'; wbCache = null; wbCacheL = null; saveCfg(); o.wbo = 1; render(); tip('已导入 ' + es.length + ' 条'); } catch (er) { tip('导入失败：' + (er.message || er)); } }; rd.readAsText(f); }; fi.click(); }
    else if (a === 'stinfo') { o.stinfo = !o.stinfo; render(); }
    else if (a === 'stfill') { o.test = '读取中……'; render(); stRead().then((r) => { cfg.url = r.url; if (r.key) cfg.key = r.key; saveCfg(); o.test = r.key ? '✓ 已填入酒馆的地址和密钥，可点「测试连接」' : '已填入地址；酒馆没把密钥开放给网页，请手动粘贴密钥（或在酒馆 config.yaml 里把 allowKeysExposure 设为 true 后再点）'; render(); }).catch((er) => { o.test = '✗ ' + (er.message || er); render(); }); }
    else if (a === 'test') {
      const box = $('xyp-test'); if (box) box.textContent = '测试中……';
      callAPI([{ role: 'user', content: '只回复两个字：成功' }], { max: 20, nowb: true }).then((r) => { o.test = '✓ 连接成功：' + clip(r, 30); render(); }).catch((er) => { o.test = '✗ ' + (er.message || er); render(); });
    }
    else if (a === 'applyth') { if (e.target.closest('[data-act=delth]')) return; cfg.theme = t.dataset.id; saveCfg(); applyTheme(); render(); }
    else if (a === 'delth') { if (o.delth !== t.dataset.id) { o.delth = t.dataset.id; render(); return; } customTh = customTh.filter((x) => x.id !== t.dataset.id); saveCustom(); o.delth = ''; applyTheme(); render(); }
    else if (a === 'impth') thFile.click();
    else if (a === 'pasteth') { try { addTheme(($('xyp-th-name').value || '').trim(), $('xyp-th-css').value); o.msg = '已保存，点它即可使用'; } catch (er) { o.msg = '保存失败：' + er.message; } render(); }
    else if (a === 'resetpos') { store.del(POS_KEY); store.del(FAB_KEY); placeFab(); placeWin(); }
    else if (a === 'wipe') { if (!o.wipe) { o.wipe = true; render(); return; } const c = getCtx(); if (c && c.chatMetadata) delete c.chatMetadata.st_phone; memD.d = null; save(); o.wipe = false; render(); }
    else if (a === 'sec') { const s = t.dataset.sec; go('cpsec', { sec: s }); if (D().cp[s]) { markViewed(s); save(); } }
    else if (a === 'plgo') { const dr = o.pl; if (!dr) return; const ni = $('xyp-pl-n'); if (ni) dr.n = Number(ni.value) || 1; if (dr.mode === 'part' && !dr.apps.length && !dr.cts.length) { tip('部分锁请至少选一个软件或联系人'); return; } const ms = { '分钟': 60000, '小时': 3600000, '天': 86400000 }[dr.u] * dr.n; pushEvent(`${myNick()}锁了${cName(getC('char'))}的手机（${dr.n}${dr.u}，${dr.mode === 'all' ? '全部锁，只能联系' + myNick() : '部分锁'}）`, true); D().plock = { until: Date.now() + ms, dur: dr.n + dr.u, mode: dr.mode, apps: dr.apps.slice(), cts: dr.cts.slice() }; save(); render(); }
    else if (a === 'plun') { if (plActive()) pushEvent(`${myNick()}提前给${cName(getC('char'))}的手机解了锁`, true); D().plock = null; save(); render(); }
    else if (a === 'plus') { o.plus = !o.plus; render(); }
    else if (a === 'pay') { o.plus = false; render(); const cid = o.id; pickBox('转账 / 红包', [['转账'], ['红包']], (i) => { const kind = i === 0 ? '转账' : '红包'; showDlg(`<div class="bx"><b>${kind}</b><input id="xyp-dlg-in" type="number" inputmode="decimal" placeholder="金额" class="xyp-dlgi"><input id="xyp-dlg-in2" placeholder="备注（可不填）" class="xyp-dlgi"><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="dlgok">${i === 0 ? '转账' : '塞进红包'}</span></div></div>`); dlgFn = (v) => { const amt = Math.round(Number(v) * 100) / 100; if (!(amt > 0)) { tip('请输入有效金额'); return; } const note = (($('xyp-dlg-in2') || {}).value || '').trim().slice(0, 30); const x = getC(cid); if (!x) return; payWith('wx', amt, `${kind} → ${cName(x)}`, () => { const m = pushX(cid, 'u', `${kind}¥${amt}${note ? '，备注：' + note : ''}`, i === 0 ? 'pay' : 'rp', { amt, note, st: 'wait' }); save(); renderMsgs(); setTimeout(() => { m.st = 'got'; pushX(cid, 'c', i === 0 ? `${cName(x)}已收款 ¥${amt}` : `${cName(x)}领取了你的红包`, 'sys'); save(); if (cur().p === 'chat' && cur().id === cid) renderMsgs(); if (cfg.auto) autoWait(cid); }, 1100); }); }; }); }
    else if (a === 'img') { o.plus = false; render(); const cid = o.id; imgPend = ''; showDlg(`<div class="bx"><b>发送图片</b><input id="xyp-dlg-in" placeholder="粘贴图片网址 https://…" class="xyp-dlgi"><div class="xyp-center" style="margin:8px 0"><span class="xyp-btn" data-act="imgpick">从相册选择</span></div><div id="xyp-dlg-pi" style="font-size:12px;opacity:.7;min-height:1.3em"></div><label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="xyp-dlg-fl">闪照（对方只能看一次）</label><div class="bt"><span data-act="dlgno">取消</span><span class="ok" data-act="dlgok">发送</span></div></div>`); dlgFn = (v) => { const url = imgPend || String(v || '').trim(); if (!url) { tip('请填图片网址，或从相册选择'); return; } const fl = !!($('xyp-dlg-fl') || {}).checked; pushX(cid, 'u', fl ? '闪照' : '图片', 'img', { img: url, fl: fl ? 1 : 0 }); save(); renderMsgs(); if (cfg.auto) autoWait(cid); }; }
    else if (a === 'imgpick') { upTarget = 'img'; fileIn.click(); }
    else if (a === 'stk') { if (o.plus) { o.plus = false; render(); } openStk(false); }
    else if (a === 'stkman') { openStk(!openStk.man); }
    else if (a === 'stkadd') { inputBox('表情包图片网址', 'https://…（图片直链）', (v) => { v = (v || '').trim(); if (/^https?:\/\//.test(v)) { stkAdd(v); openStk(false); } else { tip('请填 http 开头的图片网址'); openStk(false); } }, ''); }
    else if (a === 'stkpick') { upTarget = 'stk'; fileIn.click(); }
    else if (a === 'stkdel') { stkSave(stkLoad().filter((q) => q.id !== t.dataset.id)); openStk(true); }
    else if (a === 'stksend') { const q = stkLoad().find((z) => z.id === t.dataset.id); const cid = openStk.cid; if (!q || !cid) return; closeBox(); pushX(cid, 'u', '表情包', 'img', { img: stkRef(q), st: 1, seen: 1 }); save(); renderMsgs(); if (cfg.auto) autoWait(cid); }
    else if (a === 'timg') { o.plus = false; render(); const cid = o.id; inputBox('文字图片', '描述这张图片的画面，如：傍晚的海边，一个人的背影', (v) => { v = (v || '').trim(); if (!v) return; pushX(cid, 'u', v, 'timg'); save(); igMsg(cid); renderMsgs(); if (cfg.auto) autoWait(cid); }); }
    else if (a === 'call') { o.plus = false; render(); const cid = o.id; pickBox('通话', [['语音通话'], ['视频通话']], (i) => startCall(cid, i === 0 ? 'voice' : 'video', 'u'), 2); }
    else if (a === 'callsend' && call && call.multi) { const i = $('xyp-cin'); const v = i ? i.value.trim() : ''; if (v) { call.log.push({ r: 'u', t: v }); i.value = ''; renderCall(); syncCall(); } else callTurn(); }
    else if (a === 'callsend') { const i = $('xyp-cin'); if (!call || !i || !i.value.trim() || call.busy) return; call.log.push({ r: 'u', t: i.value.trim() }); i.value = ''; renderCall(); callTurn(); }
    else if (a === 'chup') endCall();
    else if (a === 'callyes') { const ic = incoming; clearTimeout(ic && ic.tm); incoming = null; closeBox(); if (ic) startCall(ic.id, ic.mode, 'c'); }
    else if (a === 'callno') { const ic = incoming; clearTimeout(ic && ic.tm); incoming = null; closeBox(); if (ic) { const x = getC(ic.id); pushX(ic.id, 'c', `${ic.mode === 'video' ? '视频' : '语音'}通话，${myNick()}拒绝了${cName(x)}的来电`, 'call', { cs: 'rej', cm: ic.mode }); save(); if (cur().p === 'chat' && cur().id === ic.id) renderMsgs(); if (cfg.auto) askReply(ic.id); } }
    else if (a === 'msgact') { const li = Number(t.dataset.mi); const l = D().msgs[o.id] || []; const m = l[li]; if (!m) return; const lastU = (() => { let n = l.length; while (n > 0 && l[n - 1].r === 'c') n--; return n; })(); const items = []; if (!m.k || m.k === 'voice' || m.k === 'timg') items.push(['编辑']); items.push(['删除']); if (m.r === 'c' && li >= lastU) items.push(['重新生成']);
      pickBox('这条消息', items, (i) => { const nm = items[i][0]; if (nm === '删除') { l.splice(li, 1); save(); renderMsgs(); } else if (nm === '编辑') inputBox('编辑消息', '', (v) => { v = (v || '').trim(); if (!v) { l.splice(li, 1); } else m.t = v; save(); renderMsgs(); }, m.t); else regen(o.id); }, items.length); }
    else if (a === 'regen') { o.plus = false; regen(o.id); }
    else if (a === 'vo') { o.plus = false; render(); inputBox('语音消息', '输入想说的话（对方收到的是语音）', (v) => { v = (v || '').trim(); if (!v) return; pushMsg(o.id, 'u', v, Date.now(), null, 'voice'); save(); renderMsgs(); if (cfg.auto) autoWait(o.id); }); }
    else if (a === 'gift') { o.plus = false; render(); pickGift('chat', '送礼', (i) => { const [n, p] = gifts('chat')[i]; payWith('wx', p, `送礼：${n} → ${cName(getC(o.id))}`, () => { pushMsg(o.id, 'u', `${n}（¥${p}）`, Date.now(), null, 'gift'); save(); renderMsgs(); if (cfg.auto) autoWait(o.id); }); }); }
    else if (a === 'req') { o.plus = false; const x = getC(o.id); if (x && x.share) { tip('TA已同意共享定位，可在「定位」里查看'); render(); go('locd', { id: o.id }); openLoc(x); } else { pushMsg(o.id, 'u', '查看TA的位置', Date.now(), null, 'req'); save(); render(); askReply(o.id, 'loc'); } }
    else if (a === 'sloc') { o.plus = false; render(); inputBox('发送定位', '你现在的位置，如：XX街咖啡店', (v) => { v = (v || '').trim(); if (!v) return; pushMsg(o.id, 'u', v, Date.now(), null, 'loc'); save(); renderMsgs(); if (cfg.auto) autoWait(o.id); }); }
    else if (a === 'exch') { const x = getC(o.id); if (!x || !x.live || x.friend) return; pushMsg(o.id, 'u', '我们交换个联系方式吧，加个微信？', Date.now()); save(); renderMsgs(); askReply(o.id, 'exch'); }
    else if (a === 'locd') { const lx = getC(t.dataset.id); go('locd', { id: t.dataset.id }); if (lx && lx.loc) { locSeen(lx); save(); } openLoc(lx); }
    else if (a === 'genloc') genLoc(getC(t.dataset.id));
    else if (a === 'unshare') { const x = getC(t.dataset.id); if (x) { x.share = false; save(); } back(); }
    else if (a === 'lvpref') { lvPrefOpen = !lvPrefOpen; render(); }
    else if (a === 'livemode') { LV().mode = t.dataset.m; save(); render(); }
    else if (a === 'liverefresh') genRooms();
    else if (a === 'room') { const rm = (LV().rooms[LV().mode] || [])[Number(t.dataset.i)]; go('room', { m: LV().mode, i: Number(t.dataset.i), first: !(rm && rm.seen) }); if (rm) { rm.seen = 1; save(); } }
    else if (a === 'rtop' || a === 'rbot') { const l = $('xyp-log'); if (l) l.scrollTo({ top: a === 'rtop' ? 0 : l.scrollHeight, behavior: 'smooth' }); }
    else if (a === 'rsend') { const i = $('xyp-lin'); const r = (LV().rooms[o.m] || [])[o.i]; if (!r || !i || !i.value.trim()) return; const v = i.value.trim(); i.value = ''; r.log.push({ k: 'u', t: v }); save(); renderLog.force = true; renderLog(); roomTurn(r, `${myNick()}发了弹幕：${v}（主播看到后回应）`); }
    else if (a === 'rtip') { const r = (LV().rooms[o.m] || [])[o.i]; if (!r) return; pickGift('live', '打赏', (i) => { const [n, p] = gifts('live')[i]; inputBox('打赏备注（可不填，会像弹幕一样随礼物发出；取消则不打赏）', '想对主播说的话', (note) => { note = (note || '').trim(); payWith('live', p, `直播打赏：${n} → ${r.name}`, () => { r.myTip = (Number(r.myTip) || 0) + p; r.log.push({ k: 'g', t: `${lvNick()} 打赏了 ${n}` }); { const pf9 = profOf(r); pf9.tipN = (pf9.tipN || 0) + 1; if (!pf9.sf && Math.random() < (pf9.tipN > 4 ? 0.75 : 0.25)) setTimeout(() => sFollow(r), 2500); } if (note) r.log.push({ k: 'u', t: note }); burst(p); pushEvent(`${myNick()}私下在直播里给主播「${r.name}」打赏了${n}`); save(); renderLog(); roomTurn(r, `${lvNick()}打赏了${n}${note ? '，并留言「' + note + '」' : ''}（主播要念出观众名字致谢${note ? '并回应留言' : ''}）`); }); }, ''); }); }
    else if (a === 'dmlist') { go('dms'); }
    else if (a === 'dmopen') { if (lpF) { lpF = false; return; } go('chat', { id: t.dataset.id }); }
    else if (a === 'gotoroom') { const L = LV(); for (const m of ['normal', 'r18', 'keep']) { const i = (L.rooms[m] || []).findIndex((r) => r.cid === t.dataset.id); if (i >= 0) { go('room', { m, i }); return; } } tip('这个直播间已经下播了'); }
    else if (a === 'rsave') { const im = $('xyp-rimg'); if (!im || !im.src) return; Promise.resolve().then(() => { if (/^data:/.test(im.src)) { const p = im.src.split(','); const bin = atob(p[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: (p[0].match(/:(.*?);/) || [0, 'image/jpeg'])[1] }); } return win.fetch(im.src).then((r) => r.blob()); }).then((b) => { const u = URL.createObjectURL(b); const l = doc.createElement('a'); l.href = u; l.download = 'live_' + Date.now() + '.jpg'; doc.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); tip('已保存到下载'); }).catch(() => tip('保存失败，请长按图片')); }
    else if (a === 'rzoom') { scr.classList.toggle('rv'); }
    else if (a === 'rrefresh') { const r = (LV().rooms[o.m] || [])[o.i]; if (r && !roomBusy) { r.log = []; r.err = ''; o.topDone = 0; save(); renderLog(); roomTurn(r, '刚开播，向观众打招呼并介绍今天的内容'); } }
    else if (a === 'rretry' || a === 'rmore') { const r = (LV().rooms[o.m] || [])[o.i]; if (r) roomTurn(r, r.log.length ? '直播继续，主播接着聊、玩或表演，观众弹幕互动' : '刚开播，向观众打招呼并介绍今天的内容'); }
    else if (a === 'rdm') { const r = (LV().rooms[o.m] || [])[o.i]; if (r) { const x = streamerContact(r); if (!r.dm) { r.dm = 1; pushEvent(`${myNick()}私信了直播间主播「${r.name}」`); } go('chat', { id: x.id }); } }
    else if (a === 'shoparr') { const od = SH().orders.find((x) => x.id === t.dataset.id); if (od && !od.arr) { od.arr = 1; save(); render(); } }
else if (a === 'shopedit') shopEditDlg();
else if (a === 'shopcup' || a === 'shopcdn') { const cs = SH().cats || (SH().cats = SHOP_ALL()); const i = Number(t.dataset.i); const j = a === 'shopcup' ? i - 1 : i + 1; if (j >= 0 && j < cs.length) { const x = cs[i]; cs[i] = cs[j]; cs[j] = x; save(); render(); } shopEditDlg(); }
else if (a === 'shopcdel') { const cs = SH().cats || (SH().cats = SHOP_ALL()); cs.splice(Number(t.dataset.i), 1); save(); render(); shopEditDlg(); }
else if (a === 'shopcadd') inputBox('添加种类', '种类名，如：宠物用品', (v) => { v = (v || '').trim().slice(0, 8); if (v) { const cs = SH().cats || (SH().cats = SHOP_ALL()); if (cs.indexOf(v) < 0) cs.push(v); save(); render(); } shopEditDlg(); });
else if (a === 'shoprf') { const o2 = cur(); const c = o2.cat && shopCats().indexOf(o2.cat) >= 0 ? o2.cat : shopCats()[0]; if (c) shopGen(c); }
else if (a === 'shopdel') { const o2 = cur(); const x = shopItems(o2)[Number(t.dataset.i)]; if (x) { const ex = SH().extra || {}; Object.keys(ex).forEach((k) => { const p0 = ex[k].indexOf(x); if (p0 >= 0) ex[k].splice(p0, 1); }); save(); render(); } }
else if (a === 'shopopt') { if (shopCur) { shopCur.sel[Number(t.dataset.g)] = Number(t.dataset.v); shopOptDlg(); } }
else if (a === 'shopgo') { const k = Number(t.dataset.k); closeBox(); if (shopCur) shopFinal(k); }
else if (a === 'shopcat') { const o2 = cur(); o2.cat = t.dataset.c; o2.q = ''; render(); }
else if (a === 'shopbuy') { const l = shopItems(cur()); const it = l[Number(t.dataset.i)]; if (it) shopBuy(it); }
else if (a === 'shopme') go('shopme');
else if (a === 'shopq') inputBox('搜索商品', '商品名关键字', (v) => { cur().q = (v || '').trim(); render(); }, cur().q || '');
else if (a === 'shopqx') { cur().q = ''; render(); }
else if (a === 'shopcust') inputBox('自己写一个商品', '商品名 价格，如：羽绒服 899', (v) => { v = (v || '').trim(); const p0 = numOf(v); if (!v || !isFinite(p0) || p0 <= 0) { tip('请写成「商品名 价格」'); return; } shopBuy([fcTitle(v) || '商品', Math.round(p0 * 100) / 100]); });
else if (a === 'logmore') { logOpen[t.dataset.k] = !logOpen[t.dataset.k]; render(); }
else if (a === 'walclr') confirmBox('清空明细', '只清空记录，不改余额。', () => { W().log = []; save(); render(); });
else if (a === 'fcx_clr') { const n2 = t.dataset.n; const f2 = FCg(n2); confirmBox('清空明细', '只清空记录，不改卡内余额。', () => { if (t.dataset.w === '1') f2.bk.log = []; else f2.log = []; save(); render(); }); }
else if (a === 'paydef') { const w = W(); w.pd = w.pd || {}; w.pd[t.dataset.app] = t.dataset.v; save(); render(); }
else if (a === 'usehr') { const o2 = cur(); o2.uh = o2.uh === Number(t.dataset.h) ? -1 : Number(t.dataset.h); render(); }
else if (a.slice(0, 4) === 'fcx_') fcAct(a, t);
else if (a === 'walself') { const w = W(); w.self = !(w.self === false) ? false : true; save(); render(); if (w.self === false && !w.aiDone) { w.aiDone = 1; busyWal = true; walGenAI().finally(() => { busyWal = false; }); } }
else if (a === 'walai') { busyWal = true; render(); walGenAI().finally(() => { busyWal = false; render(); }); }
else if (a === 'walset' || a === 'waladd') { if (W().self === false) { tip('当前由 AI 定金额，可打开「自己修改金额」'); return; } let v = Number(($('xyp-wal-in') || {}).value); if (!isFinite(v) || v < 0 || !$('xyp-wal-in').value) { tip('请输入有效金额'); return; } const w = W(); if (v > WAL_MAX || (a === 'waladd' && w.bal + v > WAL_MAX)) { tip('余额上限为 ¥' + WAL_MAX.toLocaleString('en-US')); return; } v = Math.round(v * 100) / 100; if (a === 'walset') { w.log.unshift({ t: '手动设置余额', amt: v - w.bal, ts: Date.now() }); w.bal = v; } else { w.bal += v; w.log.unshift({ t: '充值', amt: v, ts: Date.now() }); } w.log.length = Math.min(w.log.length, 40); save(); render(); }
    else if (a === 'lk') lockKey(t.dataset.k);
    else if (a === 'lkdel') { lkBuf = lkBuf.slice(0, -1); renderLock(); }
    else if (a === 'lkfp') unlock();
    else if (a === 'savepw') {
      const v = ($('xyp-pw').value || '').trim();
      if (v && !/^\d{4,8}$/.test(v)) { toast.innerHTML = '<b>锁屏</b>密码需要是 4~8 位数字'; toast.dataset.id = ''; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), 3000); return; }
      cfg.pw = v ? hpw(v) : ''; cfg.pwLen = v ? v.length : 0; saveCfg(); render();
    }
    else if (a === 'gen') genCP(t.dataset.sec);
    else if (a === 'genall') { if (allBusy) return; confirmBox('一键生成', `将依次生成或刷新全部 ${secKeys().length} 项内容（约 ${secKeys().length} 次 API 请求），已有内容会被覆盖。`, genAll); }
    else if (a === 'dlgno') { if (dlgTwo === 1) { dlgTwo = 2; t.textContent = '再点一次取消'; t.style.color = '#e11d48'; return; } const n0 = dlgNo; closeBox(); if (n0) n0(); }
    else if (a === 'dlgok') { const iv = $('xyp-dlg-in'); const v = iv ? iv.value : undefined; const f = dlgFn; closeBox(); if (f) f(v); }
    else if (a === 'rrank') { const r = (LV().rooms[o.m] || [])[o.i]; if (r) rkShow(r); }
    else if (a === 'rkedit') { const r = (LV().rooms[o.m] || [])[o.i]; if (r) { closeBox(); rkEdit(r); } }
    else if (a === 'rksave') { const r = (LV().rooms[o.m] || [])[o.i]; const ta = $('xyp-rk-in'); if (!r || !ta) return; const me = lvNick(); const rows = []; let mine = 0; ta.value.split(/\n+/).forEach((ln) => { const m = ln.trim().match(/^(.{1,16}?)[\s,，:：]+(\d{1,9})$/); if (!m) return; const n = m[1].trim(); const sc = Number(m[2]); if (n === me || n === me + '（你）') mine = sc; else rows.push({ n, s: sc }); }); r.rank = rows.slice(0, 20); r.myTip = mine; save(); closeBox(); rkShow(r); }
    else if (a === 'cgmgr') { closeBox(); giftMgr(); }
    else if (a === 'cgadd') { closeBox(); inputBox('新增礼物（格式：名称 价格）', '如：小鱼干 66', (v) => { const g = parseGift(v); if (!g) { tip('格式：名称 价格，如 小鱼干 66'); setTimeout(giftMgr, 50); return; } cgArr(cgKind).push(g); saveCfg(); giftMgr(); }); }
    else if (a === 'cgedit') { const i = Number(t.dataset.i); const g0 = cgArr(cgKind)[i]; if (!g0) return; closeBox(); inputBox('编辑礼物（格式：名称 价格）', '如：小鱼干 66', (v) => { const g = parseGift(v); if (!g) { tip('格式：名称 价格，如 小鱼干 66'); setTimeout(giftMgr, 50); return; } cgArr(cgKind)[i] = g; saveCfg(); giftMgr(); }, g0[0] + ' ' + g0[1]); }
    else if (a === 'cgdel') { cgArr(cgKind).splice(Number(t.dataset.i), 1); saveCfg(); giftMgr(); }
    else if (a === 'dlgpick') { const f = dlgFn; closeBox(); if (f) f(Number(t.dataset.i)); }
    else if (a === 'vthought') genThought(Number(t.dataset.i));
    else if (a === 'cpm') { const c = (((D().cp.wechat || {}).data || {}).chats || [])[o.i]; const k = Number(t.dataset.k); const m = c && c.msgs && c.msgs[k]; if (!m) return; pickBox('这条消息', [['编辑'], ['删除']], (i) => { if (i === 0) inputBox('编辑消息', '', (v) => { v = (v || '').trim(); if (v) { m.text = v; save(); render(); } }, m.text); else { c.msgs.splice(k, 1); save(); render(); } }, 2); }
    else if (a === 'cpreply') cpReply(o.i);
    else if (a === 'cpsend') { const i = $('xyp-cpin'); const c = (((D().cp.wechat || {}).data || {}).chats || [])[o.i]; if (!i || !c || !i.value.trim()) return; const v = i.value.trim(); (c.msgs || (c.msgs = [])).push({ from: 'me', text: v }); pushEvent(`${myNick()}拿${cName(getC('char'))}的手机，替他回复${c.name}：「${clip(v, 40)}」（帮他发的）`, true); save(); render(); }
    else if (a === 'cpchat') go('cpchat', { i: Number(t.dataset.i) });
  });
  let noClickUntil = 0; let dg = null;
  winEl.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.xyp-apps')) e.preventDefault(); });
winEl.addEventListener('touchmove', (e) => { if (dg && dg.on && e.cancelable) e.preventDefault(); }, { passive: false });
  winEl.addEventListener('pointerdown', (e) => {
    const a = e.target.closest && e.target.closest('.xyp-app'); if (!a || !a.parentElement.classList.contains('xyp-apps') || e.button > 0) return;
    dg = { a, sx: e.clientX, sy: e.clientY, on: false, id: e.pointerId };
    dg.t = setTimeout(() => { if (!dg) return; dg.on = true; const r = a.getBoundingClientRect(); dg.gx = dg.sx - r.left; dg.gy = dg.sy - r.top; a.classList.add('drag'); a.parentElement.classList.add('dragging'); a.style.transform = 'scale(1.14)'; try { navigator.vibrate && navigator.vibrate(12); } catch (x) { /* ignore */ } try { a.setPointerCapture(dg.id); } catch (x) { /* ignore */ } }, 420);
  });
  winEl.addEventListener('pointermove', (e) => {
    if (!dg) return;
    if (!dg.on) { if (Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) > 8) { clearTimeout(dg.t); dg = null; } return; }
    const a = dg.a; const par = a.parentElement;
    // 图标跟手
    a.style.transform = 'none'; const r = a.getBoundingClientRect();
    a.style.transform = `translate(${e.clientX - dg.gx - r.left}px,${e.clientY - dg.gy - r.top}px) scale(1.14)`;
    // 进入别的图标范围：换位，其余图标平滑让位
    // 命中判断用“布局位置”（不受动画位移影响），并只在格子中心区域触发，避免来回抖动
    const pb = par.getBoundingClientRect(); const px = e.clientX - pb.left; const py = e.clientY - pb.top;
    const over = [...par.children].find((k) => { if (k === a) return false; const l = k.offsetLeft - par.offsetLeft; const t = k.offsetTop - par.offsetTop; const w = k.offsetWidth; const h = k.offsetHeight; return px > l + w * 0.2 && px < l + w * 0.8 && py > t + h * 0.15 && py < t + h * 0.85; });
    if (!over) return;
    const sibs = [...par.children].filter((k) => k !== a); const before = new Map(sibs.map((k) => [k, k.getBoundingClientRect()]));
    const kids = [...par.children]; if (kids.indexOf(a) < kids.indexOf(over)) over.after(a); else over.before(a);
    sibs.forEach((k) => { const q = k.getBoundingClientRect(); const o = before.get(k); const dx = o.left - q.left; const dy = o.top - q.top; if (!dx && !dy) return; k.style.transition = 'none'; k.style.transform = `translate(${dx}px,${dy}px)`; requestAnimationFrame(() => requestAnimationFrame(() => { k.style.transition = 'transform .2s ease'; k.style.transform = ''; })); });
    a.style.transform = 'none'; const r2 = a.getBoundingClientRect(); a.style.transform = `translate(${e.clientX - dg.gx - r2.left}px,${e.clientY - dg.gy - r2.top}px) scale(1.14)`;
  });
  const endDg = () => {
    if (!dg) return; clearTimeout(dg.t); const g = dg; dg = null; if (!g.on) return;
    noClickUntil = Date.now() + 400; const a = g.a; const par = a.parentElement;
    a.style.transition = 'transform .16s ease'; a.style.transform = 'none';
    setTimeout(() => { a.classList.remove('drag'); par.classList.remove('dragging'); [...par.children].forEach((k) => { k.style.transition = ''; k.style.transform = ''; }); }, 260);
    const key = par.dataset.ord; cfg.order = cfg.order || {}; cfg.order[key] = [...par.children].map((k) => k.dataset.p || k.dataset.sec); saveCfg();
  };
  winEl.addEventListener('pointerup', endDg); winEl.addEventListener('pointercancel', endDg);
  winEl.addEventListener('click', (e) => { if (Date.now() < noClickUntil) { e.stopPropagation(); return; } onClick(e); });
  winEl.addEventListener('error', (e) => { const im = e.target; if (im && im.tagName === 'IMG' && im.dataset && im.dataset.n) { const sp = doc.createElement('span'); sp.className = im.className + ' xyp-avt'; sp.textContent = im.dataset.n; im.replaceWith(sp); } }, true);
  winEl.addEventListener('contextmenu', (e) => { const t = e.target; if (t.closest && t.closest('img[data-noav], .xyp-rimg.ns')) e.preventDefault(); });
  winEl.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.ap) { const [k, f] = t.dataset.ap.split('.'); cfg.ap = cfg.ap || {}; (cfg.ap[k] || (cfg.ap[k] = {}))[f] = t.value; saveCfg(); } else if (t.id === 'xyp-wbq') { const q = t.value.trim().toLowerCase(); dlgEl.querySelectorAll('.xyp-wbr').forEach((r) => { r.style.display = !q || r.textContent.toLowerCase().includes(q) ? '' : 'none'; }); } });
  winEl.addEventListener('change', guard('设置', (e) => {
    const t = e.target; if (t.id === 'xyp-in') syncSend(); if (t.dataset.ap) { const [k, f] = t.dataset.ap.split('.'); cfg.ap = cfg.ap || {}; (cfg.ap[k] || (cfg.ap[k] = {}))[f] = t.value; saveCfg(); } else if (t.dataset.cfg) { if (t.dataset.cfg === 'liveAdult' && t.value === 'on' && !cfg.adultOk) { t.value = 'off'; cfg.liveAdult = 'off'; saveCfg(); confirmBox('请确认', '请确认用户已满18岁', () => { cfg.adultOk = true; cfg.liveAdult = 'on'; saveCfg(); render(); }); return; } cfg[t.dataset.cfg] = t.type === 'number' ? Number(t.value) : t.value; saveCfg(); if (t.dataset.cfg === 'wbMode') { wbCache = null; wbCacheL = null; cur().wbo = 1; render(); } }
    else if (t.dataset.pln || t.dataset.plu || t.dataset.plm || t.dataset.pla || t.dataset.plc) { const dr = cur().pl; if (!dr) return; if (t.dataset.pln) dr.n = Number(t.value) || 1; else if (t.dataset.plu) dr.u = t.value; else if (t.dataset.plm) { dr.mode = t.dataset.plm; render(); } else { const k = t.dataset.pla ? 'apps' : 'cts'; const v = t.dataset.pla || t.dataset.plc; dr[k] = dr[k].filter((q) => q !== v); if (t.checked) dr[k].push(v); render(); } }
    else if (t.dataset.wbc || t.dataset.wbn || t.dataset.wbi) { if (t.dataset.wbc) cfg.wbCard = t.checked; else { const k = t.dataset.wbn ? 'wbNames' : 'wbImp'; const v = t.dataset.wbn || t.dataset.wbi; cfg[k] = (cfg[k] || []).filter((q) => q !== v); if (t.checked) cfg[k].push(v); } wbCache = null; wbCacheL = null; saveCfg(); const wl = scr.querySelector('[data-act=wbpick]'); if (wl) wl.textContent = '选择世界书（已选 ' + wbCount() + '）'; }
    else if (t.dataset.vid) { cfg.vid = cfg.vid || {}; cfg.vid[t.dataset.vid] = t.checked ? 1 : 0; saveCfg(); }
    else if (t.dataset.lue) { cfg.lue = cfg.lue || {}; cfg.lue[t.dataset.lue] = t.checked ? 1 : 0; saveCfg(); }
    else if (t.dataset.cfgb) { cfg[t.dataset.cfgb] = t.checked; saveCfg(); if (t.dataset.cfgb === 'fab') fab.style.display = cfg.fab ? 'flex' : 'none'; if (t.dataset.cfgb === 'apiw') apiwSync(); if (t.dataset.cfgb === 'igOn' || t.dataset.cfgb === 'lsync') render(); }
    else if (t.dataset.me) { D().user[t.dataset.me] = t.value.trim(); save(); }
    else if (t.dataset.lvpf) { meD()[t.dataset.lvpf] = t.value === '1'; save(); }
    else if (t.dataset.pfa) { const r = roomAt(cur()); if (r) { const pf = profOf(r); pf.amsg = !!t.checked; if (pf.amsg) streamerContact(r); save(); } }
    else if (t.dataset.lvme) { const L = LV(); (L.me || (L.me = {}))[t.dataset.lvme] = t.value.trim(); save(); }
  }));
  winEl.addEventListener('keydown', (e) => { if (e.target.id === 'xyp-dlg-in' && cfg.entSend !== false && hkStr(e) === hkMap().send && !e.isComposing && win.matchMedia && win.matchMedia('(pointer:fine)').matches) { e.preventDefault(); const b = dlgEl.querySelector('[data-act=dlgok]'); if (b) b.click(); return; } if ((e.target.id === 'xyp-in' || e.target.id === 'xyp-lin') && cfg.entSend !== false && hkStr(e) === hkMap().send && !e.isComposing && win.matchMedia && win.matchMedia('(pointer:fine)').matches) { e.preventDefault(); const i = e.target; if (e.target.id === 'xyp-lin') { const b = winEl.querySelector('[data-act=rsend]'); if (b) b.click(); } else if (i.value.trim()) { const v = i.value; i.value = ''; sendMsg(cur().id, v); } } });
  $('xyp-back').addEventListener('click', back);
  // 右边缘左滑返回：边缘冒出黑色半圆，随手指变宽，够远变实心，松手返回
  (() => {
    const ind = doc.createElement('div'); ind.className = 'xyp-bk'; ind.innerHTML = '<b>‹</b>'; winEl.appendChild(ind); let st = null;
    const hide = () => { ind.classList.remove('on', 'rdy'); ind.style.setProperty('--w', '0px'); };
    winEl.addEventListener('touchstart', (e) => { st = null; if (nav.length < 2 || e.touches.length !== 1) return; const t = e.touches[0]; const r = winEl.getBoundingClientRect(); if (r.right - t.clientX > 28 || t.clientX > r.right) return; st = { x: t.clientX, y: t.clientY, dx: 0, go: false }; }, { passive: true });
    winEl.addEventListener('touchmove', (e) => { if (!st) return; const t = e.touches[0]; const dx = st.x - t.clientX; const dy = Math.abs(t.clientY - st.y); if (!st.go) { if (dy > 12 && dy > dx) { st = null; return; } if (dx > 8 && dx > dy) st.go = true; else return; } st.dx = dx; ind.style.setProperty('--w', Math.min(dx, 96) + 'px'); ind.style.top = clamp(t.clientY - winEl.getBoundingClientRect().top, 60, winEl.offsetHeight - 60) + 'px'; ind.classList.add('on'); ind.classList.toggle('rdy', dx >= 64); }, { passive: true });
    const end = () => { const ok = st && st.go && st.dx >= 64; st = null; hide(); if (ok) back(); };
    winEl.addEventListener('touchend', end); winEl.addEventListener('touchcancel', () => { st = null; hide(); });
  })();
  $('xyp-close').addEventListener('click', () => winEl.classList.remove('on'));
  function setMs(w) { winEl.style.setProperty('--ms', String(Math.max(0.7, Math.min(1.7, w / 300)).toFixed(3))); }
  const isD = () => win.innerWidth > 600;
  function applyMini() { const d = isD(), m = d || cfg.mini; winEl.classList.toggle('mini', !!m); winEl.classList.toggle('dsk', d); $('xyp-mini').textContent = cfg.mini ? '▢' : '—'; const clr = () => { winEl.style.width = ''; winEl.style.height = ''; winEl.style.removeProperty('--ms'); };
    if (!m) { clr(); return; } const w = cfg.miniW ? Math.min(cfg.miniW, win.innerWidth) : (d ? 380 : 0); if (!w) { clr(); return; }
    const h = cfg.miniH ? Math.min(cfg.miniH, win.innerHeight) : Math.min(690, win.innerHeight - 24); winEl.style.width = w + 'px'; winEl.style.height = h + 'px'; setMs(d ? w * 0.9 : w); }
  const setMini = (m) => { cfg.mini = !!m; saveCfg(); applyMini(); placeWin(); };
  $('xyp-mini').addEventListener('click', () => setMini(!cfg.mini));
    { const pb = $('xyp-pin'); const ap = () => pb.classList.toggle('on', !!cfg.pin); ap(); pb.addEventListener('click', () => { cfg.pin = !cfg.pin; saveCfg(); ap(); }); }
  applyMini(); win.addEventListener('resize', () => { const d = winEl.classList.contains('dsk'); if (d !== isD()) { applyMini(); placeWin(); } });

  const toast = $('xyp-toast'); let toastT = null; const bn = $('xyp-banner'); let bnT = null;
  const hideBn = (up) => { clearTimeout(bnT); if (!bn.classList.contains('on')) return; bn.style.transition = ''; bn.classList.remove('in'); if (up) bn.style.transform = 'translateY(-130%)'; setTimeout(() => { if (!bn.classList.contains('in')) bn.classList.remove('on'); }, 300); };
  const refreshBadge = () => { try { fab.classList.toggle('has-new', D().contacts.some((x) => x.unread > 0)); } catch (e) { /* ignore */ } };
  const notify = (x, text) => {
    refreshBadge();
    if (winEl.classList.contains('on') && cur().p === 'chat' && cur().id === x.id) { x.unread = 0; refreshBadge(); renderMsgs(); return; }
    bn.innerHTML = '<b>' + esc(cName(x)) + '<small>' + (x.live && !x.friend ? '直播私信' : '微信') + ' · 现在</small></b>' + esc(clip(text, 50)); bn.dataset.id = x.id;
    { const op = winEl.classList.contains('on'); const r = (op ? winEl : null); const w = r ? r.getBoundingClientRect().width - 16 : Math.min(360, win.innerWidth - 24); const left = r ? r.getBoundingClientRect().left + 8 : (win.innerWidth - w) / 2; const top = r ? r.getBoundingClientRect().top + 8 : 10; bn.style.width = w + 'px'; bn.style.left = Math.max(4, left) + 'px'; bn.style.top = top + 'px'; }
    bn.style.transform = ''; bn.classList.add('on'); void bn.offsetWidth; bn.classList.add('in'); clearTimeout(bnT); bnT = setTimeout(() => hideBn(true), 5000);
    if (winEl.classList.contains('on')) render();
  };
  const jumpChat = (id) => { toast.classList.remove('on'); hideBn(false); if (!winEl.classList.contains('on')) setLock(!!cfg.lock); winEl.classList.add('on'); placeWin(); nav.length = 1; const cx = getC(id); if (cx && cx.live && !cx.friend) nav.push({ p: 'live' }, { p: 'chat', id }); else nav.push({ p: 'wx', tab: 'chats' }, { p: 'chat', id }); render(); };
  toast.addEventListener('click', () => { const id = toast.dataset.id; if (id) jumpChat(id); else toast.classList.remove('on'); });
  { let st = null; bn.addEventListener('pointerdown', (e) => { st = { y: e.clientY, dy: 0 }; clearTimeout(bnT); bn.style.transition = 'none'; try { bn.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } }); bn.addEventListener('pointermove', (e) => { if (!st) return; st.dy = Math.min(0, e.clientY - st.y); bn.style.transform = 'translateY(' + st.dy + 'px)'; bn.style.opacity = String(Math.max(0.2, 1 + st.dy / 80)); }); const endB = (ok) => { if (!st) return; const d = st.dy; st = null; bn.style.transition = ''; bn.style.opacity = ''; if (d < -28) { hideBn(true); return; } bn.style.transform = ''; if (ok && d > -6) jumpChat(bn.dataset.id); else bnT = setTimeout(() => hideBn(true), 3000); }; bn.addEventListener('pointerup', () => endB(true)); bn.addEventListener('pointercancel', () => endB(false)); }
  // 悬浮按钮 / 窗口位置（可拖动，设置里可重置）
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const readPos = (k) => { try { const p = JSON.parse(store.get(k, 'null')); return p && typeof p.x === 'number' ? p : null; } catch (e) { return null; } };
  const placeFab = () => { const p = readPos(FAB_KEY) || { x: win.innerWidth - 58, y: Math.round(win.innerHeight * 0.42) }; fab.style.left = clamp(p.x, 4, win.innerWidth - 48) + 'px'; fab.style.top = clamp(p.y, 4, win.innerHeight - 48) + 'px'; };
  const placeWin = () => { const w = winEl.offsetWidth || 380; const h = winEl.offsetHeight || 690; const p = readPos(POS_KEY) || { x: win.innerWidth - w - 16, y: Math.max(8, (win.innerHeight - h) / 2) }; winEl.style.left = clamp(p.x, 0, Math.max(0, win.innerWidth - w)) + 'px'; winEl.style.top = clamp(p.y, 0, Math.max(0, win.innerHeight - 60)) + 'px'; };
  const drag = (handle, target, key, onTap) => {
    let st = null;
    handle.addEventListener('pointerdown', (e) => { if (e.button > 0 || (e.target.closest && e.target.closest('#xyp-back,#xyp-close,#xyp-mini,#xyp-rs,#xyp-pin'))) return; if (win.innerWidth <= 600 && target === winEl && !winEl.classList.contains('mini')) return; const r = target.getBoundingClientRect(); st = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false }; try { handle.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    handle.addEventListener('pointermove', (e) => { if (!st) return; const dx = e.clientX - st.sx; const dy = e.clientY - st.sy; if (!st.moved && Math.abs(dx) + Math.abs(dy) < 5) return; st.moved = true; const w = target.offsetWidth; const h = target.offsetHeight; target.style.left = clamp(st.x + dx, 0, win.innerWidth - w) + 'px'; target.style.top = clamp(st.y + dy, 0, win.innerHeight - 44) + 'px'; });
    const end = () => { if (!st) return; if (st.moved) store.set(key, JSON.stringify({ x: parseInt(target.style.left, 10), y: parseInt(target.style.top, 10) })); else if (onTap) onTap(); st = null; };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', () => { st = null; });
  };
  { const rz = $('xyp-rz'); let rs = null; const savePos = () => store.set(POS_KEY, JSON.stringify({ x: parseInt(winEl.style.left, 10) || 0, y: parseInt(winEl.style.top, 10) || 0 }));
    rz.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const r = winEl.getBoundingClientRect(); rs = { R: r.right, T: r.top }; try { rz.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } });
    rz.addEventListener('pointermove', (e) => { if (!rs) return; const w = clamp(rs.R - e.clientX, 230, Math.min(600, rs.R)); const h = clamp(e.clientY - rs.T, 320, win.innerHeight - rs.T); winEl.style.width = w + 'px'; winEl.style.height = h + 'px'; winEl.style.left = (rs.R - w) + 'px'; setMs(isD() ? w * 0.9 : w); });
    const rend = () => { if (!rs) return; rs = null; cfg.miniW = winEl.offsetWidth; cfg.miniH = winEl.offsetHeight; saveCfg(); savePos(); };
    rz.addEventListener('pointerup', rend); rz.addEventListener('pointercancel', rend);
    $('xyp-rs').addEventListener('click', (e) => { e.stopPropagation(); const R = winEl.getBoundingClientRect().right; delete cfg.miniW; delete cfg.miniH; saveCfg(); applyMini(); winEl.style.left = Math.max(0, R - winEl.offsetWidth) + 'px'; savePos(); }); }
  drag(fab, fab, FAB_KEY, () => { const on = winEl.classList.toggle('on'); if (on) { { const dd = D(); if (!dd.used) { dd.used = 1; save(); } } nav.length = 1; setLock(!!cfg.lock); placeWin(); render(); } });
  let mpCtx = null, hkCap = '';
  const HK_DEF = { save: 'ctrl+z', back: 'arrowleft', close: 'escape', send: 'enter' }, HK_NM = { save: '保存图片 / 保存预设', back: '返回上一页', close: '收起小手机', send: '发送（聊天 / 弹幕 / 输入弹窗；换行用 Shift+Enter）' };
  const hkMap = () => Object.assign({}, HK_DEF, cfg.hkm || {});
  const hkStr = (e) => { const k = (e.key || '').toLowerCase(); if (['control', 'shift', 'alt', 'meta'].includes(k)) return ''; return (e.ctrlKey || e.metaKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey ? 'shift+' : '') + (k === ' ' ? 'space' : k); };
  const hkShow = (x) => x ? x.split('+').map((p) => ({ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', space: '空格', enter: 'Enter' }[p] || p.toUpperCase())).join(' + ') : '未设置';
  const hkDlg = () => { const m = hkMap(); showDlg(`<div class="bx"><b>修改快捷键</b><div style="text-align:left;margin:8px 0">${Object.keys(HK_DEF).map((id) => `<div data-act="hkrow" data-id="${id}" style="display:flex;justify-content:space-between;padding:10px 4px;border-bottom:1px solid rgba(128,128,128,.25);font-size:13px;cursor:pointer"><span>${HK_NM[id]}</span><span style="opacity:.8">${hkCap === id ? '请按下新按键…' : hkShow(m[id])}</span></div>`).join('')}</div><div class="xyp-tip">点一行，再按键盘上的新按键；按 Esc 取消。</div><div class="xyp-center" style="margin:6px 0"><span class="xyp-btn" data-act="hkreset">恢复默认</span></div><div class="bt"><span class="ok" data-act="hkdone">完成</span></div></div>`); };
  win.addEventListener('keydown', (e) => {
    if (!isD() || !winEl.classList.contains('on') || e.isComposing) return;
    const dOn = dlgEl.classList.contains('on'); if (hkCap && !dOn) hkCap = '';
    const tg = e.target; const ed = !!(tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)); const inside = !!(tg && winEl.contains(tg));
    if (!hkCap && !(winEl.matches(':hover') || inside)) return;
    if (ed && !inside) return;
    if (hkCap) { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { hkCap = ''; hkDlg(); return; } const x = hkStr(e); if (!x) return; const m = hkMap(), old = m[hkCap]; Object.keys(m).forEach((k) => { if (k !== hkCap && m[k] === x) m[k] = old; }); m[hkCap] = x; cfg.hkm = m; saveCfg(); hkCap = ''; hkDlg(); return; }
    if (cfg.hk === false || ed) { if (!ed) e.stopPropagation(); return; }
    e.stopPropagation();
    const x = hkStr(e); if (!x) return; const m = hkMap(); const id = Object.keys(m).find((k) => m[k] === x); if (!id) return;
    if (id === 'send') return;
    if (dOn) { if (id === 'close') { e.preventDefault(); closeBox(); } return; }
    if (id === 'save') { const b = winEl.querySelector('[data-act="rsave"]'); if (b && b.offsetParent) b.click(); else { const p = winEl.querySelector('[data-act="presave"]'); if (!p) return; p.click(); } }
    else if (id === 'back') { if (nav.length > 1 || (cur().p === 'call' && call)) back(); else return; }
    else winEl.classList.remove('on');
    e.preventDefault();
  }, true);
  winEl.addEventListener('keydown', (e) => { if (isD()) e.stopPropagation(); });
  winEl.addEventListener('click', (e) => { const av0 = e.target.closest && e.target.closest('#xyp-msgs .xyp-row:not(.me) > .xyp-av'); if (!av0) return; const o = cur(); if (o.p !== 'chat') return; const x = getC(o.id); if (x && x.pid && !x.isGroup) openProfOf(x); });
  drag($('xyp-bar'), winEl, POS_KEY);
  const onResize = () => { placeFab(); if (winEl.classList.contains('on')) placeWin(); };
  win.addEventListener('resize', onResize);
  fab.style.display = cfg.fab ? 'flex' : 'none'; setFab(); applyTheme(); placeFab(); placeWin();

  // 事件
  const handlers = [];
  const on = (name, fn) => { const c = getCtx(); const ev = c && c.event_types && c.event_types[name]; if (ev && c.eventSource) { c.eventSource.on(ev, fn); handlers.push([ev, fn]); } };
  on('CHAT_COMPLETION_PROMPT_READY', onReady);
  on('MESSAGE_RECEIVED', onReceived);
  on('MESSAGE_SWIPED', (mid) => { try { ingest(mid); } catch (e) { /* ignore */ } });
  on('CHAT_CHANGED', () => { nav.length = 1; if (winEl.classList.contains('on')) render(); refreshBadge(); setTimeout(() => hideMarks(true), 600); });
  on('CHARACTER_MESSAGE_RENDERED', () => hideMarks(false));
  // 点空白处关闭窗口（只收起，不会中断正在进行的生成/回复）
  const outClick = (e) => { try { if (winEl.classList.contains('on') && !root.contains(e.target) && cfg.outClose !== false && !cfg.pin) winEl.classList.remove('on'); } catch (x) { /* ignore */ } };
  doc.addEventListener('pointerdown', outClick, true);
  setTimeout(() => hideMarks(true), 800);
  // ---- 快速切换 API 悬浮窗 ----
  const APIW_KEY = 'xy_phone_apiw';
  const apiw = doc.createElement('div'); apiw.id = 'xyp-apiw'; apiw.className = 'xyp-apiw'; apiw.style.display = 'none';
  apiw.innerHTML = '<div class="aw-pill" id="xyp-awp"><i></i><span></span></div><div class="aw-panel" id="xyp-awb" style="display:none"></div>';
  root.appendChild(apiw);
  let apiwOpen = false, apiwMsg = ''; let apiwMods = [], apiwQ = '';
const apiwList = () => { const q = apiwQ.trim().toLowerCase(); const l = apiwMods.filter((m) => !q || String(m).toLowerCase().includes(q)).slice(0, 200); return l.length ? l.map((m) => '<div class="aw-mi" data-aw="pick" data-m="' + esc(m) + '">' + esc(m) + '</div>').join('') : '<div class="aw-mi" style="opacity:.6">没有匹配的模型</div>'; };
  const apiPre = () => (Array.isArray(cfg.apiPre) ? cfg.apiPre : (cfg.apiPre = []));
  const apiCur = () => apiPre().find((q) => q.url === (cfg.url || '') && q.key === (cfg.key || '') && q.model === (cfg.model || ''));
  const apiHost = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apiwPill = () => { const cu = apiCur(); const m = String(cfg.model || '').trim(); apiw.querySelector('.aw-pill span').textContent = clip(cu ? cu.name : (m || '未设置'), 8); apiw.className = 'xyp-apiw ' + ((fab.className.match(/th-\w+/) || [''])[0]); };
  const apiwPanel = () => { const cu = apiCur(); const pre = apiPre();
    return `<div class="aw-h"><b>API 快速切换</b><span data-aw="close">✕</span></div>
<div class="aw-f"><label>地址</label><input data-awf="url" value="${esc(cfg.url || '')}" placeholder="留空=用酒馆连接"></div>
<div class="aw-f"><label>密钥</label><input data-awf="key" type="password" value="${esc(cfg.key || '')}"></div>
<div class="aw-f"><label>模型</label><input data-awf="model" value="${esc(cfg.model || '')}" placeholder="模型名"><span class="aw-b" data-aw="pull" style="margin-left:6px;white-space:nowrap">拉取</span></div>
${apiwMods.length ? `<div class="aw-f"><label>搜索</label><input data-awq value="${esc(apiwQ)}" placeholder="关键字，如 claude"></div><div class="aw-ml" id="xyp-awml">${apiwList()}</div>` : ''}
<div class="aw-r"><span class="aw-b" data-aw="test">测试连接</span><span class="aw-b aw-x" data-aw="off" style="margin-left:auto">关闭悬浮窗</span></div>
<div class="aw-m">${esc(apiwMsg)}</div>
${pre.length ? '<div class="aw-s">预设（点一下切换）</div>' + pre.map((q) => `<div class="aw-i${cu && cu.id === q.id ? ' on' : ''}" data-aw="use" data-id="${esc(q.id)}"><div><b>${esc(clip(q.name, 10))}</b><small>${esc(clip(q.model || '默认模型', 16))}</small></div><span data-aw="del" data-id="${esc(q.id)}">✕</span></div>`).join('') : ''}
<div class="aw-r"><input data-awn placeholder="预设名，存下当前三项" maxlength="16"><span class="aw-b" data-aw="save">存预设</span></div>`; };
  const apiwPlace = () => { const w = apiw.offsetWidth || 90; const p = readPos(APIW_KEY) || { x: win.innerWidth - w - 12, y: Math.round(win.innerHeight * 0.42) + 56 }; apiw.style.left = clamp(p.x, 4, Math.max(4, win.innerWidth - w - 4)) + 'px'; apiw.style.top = clamp(p.y, 4, win.innerHeight - 40) + 'px'; };
  const apiwFit = () => { const b = $('xyp-awb'); if (!apiwOpen) { b.style.display = 'none'; return; } b.style.display = 'block'; b.innerHTML = apiwPanel(); b.style.top = b.style.bottom = b.style.left = b.style.right = ''; const r = apiw.getBoundingClientRect(); const vh = (win.visualViewport && win.visualViewport.height) || win.innerHeight; const sb = vh - r.bottom - 20, sa = r.top - 12; b.style.maxHeight = ''; const h = b.offsetHeight + 8; const w = b.offsetWidth; const up = h > sb && (h <= sa || sa > sb); if (up) { b.style.bottom = 'calc(100% + 8px)'; b.style.maxHeight = Math.max(160, sa - 8) + 'px'; } else { b.style.top = 'calc(100% + 8px)'; b.style.maxHeight = Math.max(160, sb - 8) + 'px'; } if (r.left + w > win.innerWidth - 4) b.style.right = '0'; else b.style.left = '0'; };
  const apiwSync = () => { apiw.style.display = cfg.apiw ? 'block' : 'none'; if (!cfg.apiw) apiwOpen = false; else { apiwPill(); apiwPlace(); } apiwPill(); apiwFit(); };
  drag($('xyp-awp'), apiw, APIW_KEY, () => { apiwOpen = !apiwOpen; apiwMsg = ''; apiwFit(); });
  apiw.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.awf) { cfg[t.dataset.awf] = t.value.trim(); saveCfg(); apiwPill(); } });
  apiw.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.awq !== undefined) { apiwQ = t.value; const l = $('xyp-awml'); if (l) l.innerHTML = apiwList(); } });
apiw.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-aw]'); if (!t) return; e.stopPropagation(); const a = t.dataset.aw; const id = t.dataset.id;
    if (a === 'close') { apiwOpen = false; apiwFit(); return; }
if (a === 'pull') { apiwMsg = '拉取中……'; const m0 = apiw.querySelector('.aw-m'); if (m0) m0.textContent = apiwMsg; fetchModels().then((l) => { apiwMods = l; apiwQ = ''; apiwMsg = '已拉取 ' + l.length + ' 个模型，可搜索后点选'; }).catch((er) => { apiwMsg = '✗ ' + clip(er.message || String(er), 30); }).finally(() => { apiwFit(); }); return; }
if (a === 'pick') { cfg.model = t.dataset.m; saveCfg(); apiwMsg = '已选：' + clip(cfg.model, 18); apiwPill(); apiwFit(); return; }
    if (a === 'off') { cfg.apiw = false; saveCfg(); apiwSync(); tip('已关闭悬浮窗，可在设置里重新打开'); return; }
    if (a === 'del') { cfg.apiPre = apiPre().filter((q) => q.id !== id); saveCfg(); apiwMsg = '已删除预设'; apiwPill(); apiwFit(); return; }
    if (a === 'use') { const q = apiPre().find((x) => x.id === id); if (!q) return; cfg.url = q.url; cfg.key = q.key; cfg.model = q.model; saveCfg(); apiwMsg = '已切换到：' + q.name; apiwPill(); apiwFit(); return; }
    if (a === 'save') { const inp = apiw.querySelector('[data-awn]'); const nm = (inp.value || '').trim() || String(cfg.model || '').trim() || apiHost(cfg.url) || '未命名'; const ex = apiCur(); if (ex) { ex.name = nm; } else { apiPre().push({ id: 'a' + Date.now().toString(36), name: nm, url: cfg.url || '', key: cfg.key || '', model: cfg.model || '' }); cfg.apiPre = apiPre().slice(-20); } saveCfg(); apiwMsg = '已保存预设：' + nm; apiwPill(); apiwFit(); return; }
    if (a === 'test') { apiwMsg = '测试中……'; const m = apiw.querySelector('.aw-m'); if (m) m.textContent = apiwMsg; callAPI([{ role: 'user', content: '只回复两个字：成功' }], { max: 20, nowb: true }).then((r) => { apiwMsg = '✓ ' + clip(String(r).replace(/\s+/g, ' '), 14); }).catch((er) => { apiwMsg = '✗ ' + clip(er.message || String(er), 30); }).finally(() => { const m2 = apiw.querySelector('.aw-m'); if (m2) m2.textContent = apiwMsg; }); }
  });
  apiwSync();
  win.__stPhoneCleanup = () => {
    const c = getCtx(); handlers.forEach(([ev, fn]) => { try { c.eventSource.removeListener(ev, fn); } catch (e) { /* ignore */ } });
    try { doc.removeEventListener('pointerdown', outClick, true); } catch (e) { /* ignore */ }
    win.removeEventListener('resize', onResize); try { root.remove(); style.remove(); themeStyle.remove(); } catch (e) { /* ignore */ }
  };
  window.addEventListener('pagehide', () => win.__stPhoneCleanup && win.__stPhoneCleanup());
  console.log('[st-phone] 竹影小手机 ' + VERSION + ' 已加载');
})();
