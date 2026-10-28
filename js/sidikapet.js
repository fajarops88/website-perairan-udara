/* SIDIKAPET — gabungan (offline, core, public, staff, ops, notif, integration). Dihasilkan oleh build_frontend.py. */
/* ===== offline.js ===== */
/* IndexedDB untuk validasi tiket saat sinyal lemah:
   daftar  = daftar tiket sah per jadwal (diunduh sebelum berangkat)
   outbox  = hasil scan yang belum terkirim ke server (terkirim otomatis saat online) */
window.SKOff = (function () {
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('IndexedDB tidak tersedia'));
      const q = indexedDB.open('sidikapet', 1);
      q.onupgradeneeded = function () { const d = q.result; d.createObjectStore('daftar', { keyPath: 'id' }); d.createObjectStore('outbox', { keyPath: 'n', autoIncrement: true }); };
      q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) { const t = d.transaction(store, mode), s = t.objectStore(store); let out; const r = fn(s); if (r) r.onsuccess = function () { out = r.result; }; t.oncomplete = function () { res(out); }; t.onerror = t.onabort = function () { rej(t.error); }; }); });
  }
  return {
    saveDaftar: function (id, payload) { return tx('daftar', 'readwrite', function (s) { return s.put({ id: id, at: Date.now(), jadwal: payload.jadwal, tiket: payload.tiket, lokal: {} }); }); },
    getDaftar: function (id) { return tx('daftar', 'readonly', function (s) { return s.get(id); }); },
    allDaftar: function () { return tx('daftar', 'readonly', function (s) { return s.getAll(); }); },
    putDaftar: function (rec) { return tx('daftar', 'readwrite', function (s) { return s.put(rec); }); },
    addOut: function (ev) { return tx('outbox', 'readwrite', function (s) { return s.add(ev); }); },
    allOut: function () { return tx('outbox', 'readonly', function (s) { return s.getAll(); }); },
    delOut: function (ns) { return tx('outbox', 'readwrite', function (s) { ns.forEach(function (n) { s.delete(n); }); }); },
    countOut: function () { return tx('outbox', 'readonly', function (s) { return s.count(); }); }
  };
})();
;
/* ===== core.js ===== */
/* SIDIKAPET (gabungan Perud) — inti: API (fetch ke GAS lewat fn "tk"), sesi, cache SWR, UI helper, animasi.
   Seluruh kelas CSS di bawah .sk-app agar tidak bentrok dengan Tailwind situs. Navigasi memakai router situs (navigateTo). */
(function () {
  'use strict';
  const App = window.SKA = { versi: '5.0', boot: null, bootP: null, online: navigator.onLine, cleanups: [], pages: {}, ctx: 'public' };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  App.$ = $; App.$$ = $$;

  // ---------- util ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = App.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  App.tgl = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? (+m[3]) + ' ' + BLN[+m[2] - 1] + ' ' + m[1] : (iso || '-'); };
  App.jam = iso => { const m = /T(\d\d:\d\d)/.exec(iso || ''); return m ? m[1] : ''; };
  App.tglJam = iso => App.tgl(iso) + (App.jam(iso) ? ', ' + App.jam(iso) + ' WITA' : '');
  App.rp = n => 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  App.ts = iso => Date.parse(String(iso) + '+08:00');           // waktu server = WITA
  App.wita = d => { const t = new Date((d || new Date()).getTime() + 8 * 3600e3); return t.toISOString().slice(0, 19); };
  App.hariIni = () => App.wita().slice(0, 10);
  App.sleep = ms => new Promise(r => setTimeout(r, ms));
  App.debounce = (fn, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms || 300); }; };
  App.hp62 = v => { let s = String(v || '').replace(/\D/g, ''); if (s.startsWith('0')) s = '62' + s.slice(1); else if (s.startsWith('8')) s = '62' + s; return s; };
  App.copy = async t => { try { await navigator.clipboard.writeText(t); App.toast('Disalin: ' + t); } catch (e) { App.toast('Salin manual: ' + t, 'warn'); } };
  App.csv = (nama, rows) => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const blob = new Blob(['\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  App.qr = (text, cell) => { try { const q = qrcode(0, 'M'); q.addData(String(text)); q.make(); return q.createSvgTag(cell || 4, 0); } catch (e) { return '<div class="xs">QR gagal</div>'; } };
  const mkErr = (m, kind, code) => { const e = new Error(m); e.kind = kind; e.code = code; return e; };

  // ---------- sesi ----------
  // Admin = sesi login admin situs (AppState.token, hanya di memori). Staf (loket/pelabuhan/operator) = token SIDIKAPET di localStorage.
  const SK = 'sdk_sesi';
  const adminTok = () => (typeof AppState !== 'undefined' && AppState.token) ? AppState.token : '';
  const staf = { get() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }, set(o) { try { localStorage.setItem(SK, JSON.stringify(o)); } catch (e) { } },
    clear() { try { localStorage.removeItem(SK); Object.keys(localStorage).filter(k => k.indexOf('sdk_c_s_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { } } };
  App.sesi = {
    get() { const t = adminTok(); if (t) return { token: t, admin: true, me: { id: 'ADMIN', nama: (AppState.adminName || 'Admin'), role: 'admin' } }; return staf.get(); },
    set: staf.set, clear: staf.clear, staf: staf.get, isAdmin: () => !!adminTok()
  };
  const ROLEL = { admin: 'A', loket: 'L', pelabuhan: 'P', operator: 'O' }, ROLENAMA = { admin: 'Admin Dishub', loket: 'Petugas Loket', pelabuhan: 'Petugas Pelabuhan', operator: 'Operator Kapal' };
  App.roleNama = r => ROLENAMA[r] || r;

  // ---------- Perf ----------
  const perf = [];
  window.Perf = {
    rec(a, total, server) { perf.push({ aksi: a, total: Math.round(total), server: server == null ? null : server, jaringan: server == null ? null : Math.round(total - server) }); if (perf.length > 200) perf.shift(); },
    table() { console.table(perf.slice(-30)); },
    summary() { const g = {}; perf.forEach(p => { const x = g[p.aksi] = g[p.aksi] || { n: 0, total: 0, server: 0 }; x.n++; x.total += p.total; x.server += p.server || 0; }); console.table(Object.keys(g).map(k => ({ aksi: k, n: g[k].n, rataTotalMs: Math.round(g[k].total / g[k].n), rataServerMs: Math.round(g[k].server / g[k].n) }))); }
  };

  // ---------- API ----------
  const READ = new Set(['pub.boot', 'pub.jadwal', 'pub.cek', 'auth.me', 'admin.dash', 'jadwal.list', 'master.list', 'user.list', 'set.get', 'audit.list', 'report.run', 'loket.riwayat', 'kas.ringkas', 'kas.riwayat', 'port.jadwal', 'port.manifest', 'op.kapal', 'op.manifest']);
  let epoch = 0; const inflight = {};
  function handleAuth(code, action) {
    if (code !== 'AUTH' || action === 'auth.login') return;
    if (App.sesi.isAdmin()) { if (typeof forceLogout === 'function') forceLogout('Sesi admin berakhir. Silakan masuk lagi.'); return; }
    App.sesi.clear(); App.toast('Sesi berakhir. Silakan masuk lagi.', 'warn'); App.nav('/masuk');
  }
  async function call(action, data, opts) {
    const GAS = window.GAS_URL; if (!GAS || /XXXX|GANTI/.test(GAS)) throw mkErr('Alamat server belum diisi di js/config.js.', 'CONFIG');
    const s = App.sesi.get(), t0 = performance.now(), isRead = READ.has(action) || action === 'batch'; let res, tries = 0;
    for (; ;) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 30000);
      try {
        const r = await fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'tk', args: [action, data || {}, (s && s.token) || ''] }), redirect: 'follow', credentials: 'omit', signal: ctl.signal });
        clearTimeout(to); res = await r.json(); break;
      } catch (e) {
        clearTimeout(to);
        if (isRead && ++tries < 2) { await App.sleep(700); continue; }
        throw mkErr(navigator.onLine ? (isRead ? 'Server tidak merespons. Coba lagi sebentar.' : 'Koneksi terputus. Periksa dulu apakah permintaan sudah tercatat sebelum mengulang.') : 'Tidak ada koneksi internet.', 'NET');
      }
    }
    window.Perf.rec(action, performance.now() - t0, res.ms);
    if (!res.success) { handleAuth(res.code, action); throw mkErr(res.message || 'Terjadi kesalahan.', 'SRV', res.code); }
    return res;
  }
  App.api = function (action, data, opts) {
    const isRead = READ.has(action) || action === 'batch'; if (!isRead) epoch++;
    if (!isRead) return call(action, data, opts);
    const key = epoch + '|' + action + '|' + JSON.stringify(data || {}); if (inflight[key]) return inflight[key];
    const p = call(action, data, opts); inflight[key] = p; const done = () => { delete inflight[key]; }; p.then(done, done); return p;
  };
  // penggabung batch otomatis: beberapa baca pada tik yang sama => 1 eksekusi server
  let bq = null;
  App.apiQ = function (action, data) {
    if (!READ.has(action)) return App.api(action, data);
    return new Promise((resolve, reject) => { if (!bq) { bq = []; Promise.resolve().then(flush); } bq.push({ action, data: data || {}, resolve, reject }); });
  };
  async function flush() {
    const q = bq; bq = null; if (!q || !q.length) return;
    const uniq = {}; q.forEach(x => { const k = x.action + JSON.stringify(x.data); (uniq[k] = uniq[k] || { a: x.action, d: x.data, w: [] }).w.push(x); });
    const list = Object.keys(uniq).map(k => uniq[k]);
    if (list.length === 1) { App.api(list[0].a, list[0].d).then(r => list[0].w.forEach(w => w.resolve(r)), e => list[0].w.forEach(w => w.reject(e))); return; }
    for (let i = 0; i < list.length; i += 10) {
      const part = list.slice(i, i + 10);
      try { const res = await App.api('batch', { calls: part.map(u => ({ action: u.a, data: u.d })) }); res.data.forEach((r, j) => { if (r.success) part[j].w.forEach(w => w.resolve(r)); else { handleAuth(r.code, part[j].a); part[j].w.forEach(w => w.reject(mkErr(r.message, 'SRV', r.code))); } }); }
      catch (e) { part.forEach(u => u.w.forEach(w => w.reject(e))); }
    }
  }
  App.fetchMany = function (acts) { return Promise.all(acts.map(a => App.apiQ(a[0], a[1]))); };
  // stale-while-revalidate: tampil dari cache lokal dulu, lalu segarkan
  App.swr = function (key, fetcher, render, ttl) {
    const K = 'sdk_c_' + key; let shown = false, old = null;
    try { const c = JSON.parse(localStorage.getItem(K)); if (c) { old = JSON.stringify(c.d); render(c.d, true); shown = true; if (ttl && Date.now() - c.t < ttl) return Promise.resolve(c.d); } } catch (e) { }
    return fetcher().then(d => { const s = JSON.stringify(d); try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), d })); } catch (e) { } if (!shown || s !== old) render(d, false); return d; });
  };

  // ---------- UI: toast, modal, form ----------
  // lapisan mengambang (modal, toast) di luar #app-container agar tidak terhapus saat halaman diganti; tetap diberi .sk-app untuk gaya
  App.portal = function () {
    let p = document.getElementById('sk-portal');
    if (!p) { p = document.createElement('div'); p.id = 'sk-portal'; p.className = 'sk-app sk-portal'; p.innerHTML = '<div class="sk-toasts" aria-live="polite"></div>'; document.body.appendChild(p); }
    return p;
  };
  App.toast = function (msg, type) {
    const el = document.createElement('div'); el.className = 'sk-toast ' + (type || ''); el.textContent = msg; $('.sk-toasts', App.portal()).appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, type === 'err' ? 6000 : 3500);
  };
  App.err = e => App.toast((e && e.message) || 'Terjadi kesalahan.', 'err');
  App.modal = function (o) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true"><header><h3>' + esc(o.title || '') + '</h3><button class="x" aria-label="Tutup">×</button></header><div class="bd"></div>' + (o.footer === false ? '' : '<footer></footer>') + '</div>';
    const bd = $('.bd', ov), ft = $('footer', ov), prevFocus = document.activeElement;
    if (typeof o.body === 'string') bd.innerHTML = o.body; else if (o.body) bd.appendChild(o.body);
    const api = { el: ov, bd, ft, close() { ov.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { } if (o.onClose) o.onClose(); } };
    const onKey = e => { if (e.key === 'Escape' && !o.persist) api.close(); };
    document.addEventListener('keydown', onKey);
    $('.x', ov).onclick = api.close; ov.addEventListener('mousedown', e => { if (e.target === ov && !o.persist) api.close(); });
    (o.buttons || []).forEach(b => { const x = document.createElement('button'); x.className = 'btn ' + (b.cls || ''); x.type = 'button'; x.innerHTML = b.label; x.onclick = () => b.onClick && b.onClick(api, x); ft.appendChild(x); });
    App.portal().appendChild(ov); const f = $('input,select,textarea,button.btn', bd) || $('.btn', ov); if (f && !o.noFocus) setTimeout(() => f.focus(), 50);
    return api;
  };
  App.confirm = (msg, label, cls) => new Promise(res => { let done = false; const m = App.modal({ title: 'Konfirmasi', body: '<p>' + msg + '</p>', onClose: () => { if (!done) res(false); }, buttons: [{ label: 'Batal', cls: 'ghost', onClick: a => a.close() }, { label: label || 'Ya, lanjutkan', cls: cls || '', onClick: a => { done = true; res(true); a.close(); } }] }); });
  App.busy = async function (btn, fn) {
    if (!btn || btn.disabled) return; const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Memproses…';
    try { return await fn(); } catch (e) { App.err(e); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = t; } }
  };
  /** Form modal generik. fields: [{k,label,type,options:[[v,label]],req,hint,value,ph,full}] */
  App.formModal = function (o) {
    const f = document.createElement('form'); f.noValidate = true; f.className = 'grid g2';
    f.innerHTML = o.fields.map(x => {
      const id = 'f_' + x.k, v = x.value == null ? '' : x.value; let ctl;
      if (x.type === 'select') ctl = '<select class="in" id="' + id + '">' + (x.options || []).map(p => '<option value="' + esc(p[0]) + '"' + (String(p[0]) === String(v) ? ' selected' : '') + '>' + esc(p[1]) + '</option>').join('') + '</select>';
      else if (x.type === 'textarea') ctl = '<textarea class="in" id="' + id + '" placeholder="' + esc(x.ph || '') + '">' + esc(v) + '</textarea>';
      else if (x.type === 'checkbox') ctl = '<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(x.label) + '</label>';
      else ctl = '<input class="in" id="' + id + '" type="' + (x.type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(x.ph || '') + '"' + (x.inputmode ? ' inputmode="' + x.inputmode + '"' : '') + (x.maxlength ? ' maxlength="' + x.maxlength + '"' : '') + '>';
      return '<div class="field" style="' + (x.full || x.type === 'textarea' ? 'grid-column:1/-1' : '') + '">' + (x.type === 'checkbox' ? '' : '<label for="' + id + '">' + esc(x.label) + (x.req ? ' <span style="color:var(--err)">*</span>' : '') + '</label>') + ctl + (x.hint ? '<div class="hint">' + esc(x.hint) + '</div>' : '') + '</div>';
    }).join('') + '<div class="err-t" id="f_err" style="grid-column:1/-1"></div>';
    const read = () => { const v = {}; o.fields.forEach(x => { const el = $('#f_' + x.k, f); v[x.k] = x.type === 'checkbox' ? el.checked : el.value.trim(); }); return v; };
    const submit = async (api, btn) => {
      const v = read(), miss = o.fields.filter(x => x.req && !v[x.k] && x.type !== 'checkbox')[0];
      if (miss) { $('#f_err', f).textContent = miss.label + ' wajib diisi.'; $('#f_' + miss.k, f).focus(); return; }
      $('#f_err', f).textContent = ''; const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Menyimpan…';
      try { const r = await o.onSubmit(v, api); if (r !== false) api.close(); } catch (e) { $('#f_err', f).textContent = e.message || 'Gagal.'; } finally { btn.disabled = false; btn.innerHTML = t; }
    };
    const m = App.modal({ title: o.title, body: f, wide: o.wide, buttons: [{ label: 'Batal', cls: 'ghost', onClick: a => a.close() }, { label: o.submitLabel || 'Simpan', cls: o.cls || '', onClick: (a, b) => submit(a, b) }] });
    f.addEventListener('submit', e => { e.preventDefault(); submit(m, $('.btn:last-child', m.ft)); });
    return m;
  };
  App.table = function (cols, rows, o) {
    o = o || {}; if (!rows.length) return '<div class="empty"><div class="ic">📭</div>' + esc(o.empty || 'Belum ada data.') + '</div>';
    return '<div class="tw"><table><thead><tr>' + cols.map(c => '<th class="' + (c.cls || '') + '">' + (c.hr || esc(c.h)) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r, i) => '<tr>' + cols.map(c => '<td class="' + (c.cls || '') + '">' + c.f(r, i) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  };
  App.skel = (n, h) => Array.from({ length: n || 3 }, () => '<div class="sk" style="height:' + (h || 70) + 'px;margin-bottom:12px"></div>').join('');
  App.badge = (s) => { const m = { Menunggu: 'warn', Dibayar: 'ok', Kedaluwarsa: 'gray', Batal: 'err', Refund: 'warn', Terjadwal: '', Berangkat: 'warn', Tiba: 'ok', Terbit: 'ok', Tervalidasi: 'gray', Aktif: 'ok', Nonaktif: 'gray', Pending: 'warn', Ditolak: 'err', Terkirim: 'ok', Antri: 'warn', Gagal: 'err', Berjalan: 'warn', Selesai: 'ok', Dihentikan: 'gray', Terdaftar: 'ok', 'Tidak Terdaftar': 'err' }; return '<span class="badge ' + (m[s] || '') + '">' + esc(s) + '</span>'; };
  App.tiketCard = function (t, J, kode) {
    return '<div class="tiket"><div class="l"><div class="xs mut">' + (t.R2 ? 'TIKET MOTOR (R2)' : 'TIKET KAPAL') + ' · ' + esc(kode) + '</div><div class="tk mono">' + esc(t.TiketKode) + '</div><div class="b">' + esc(t.Nama) + ' <span class="badge gray">' + esc(t.Kategori) + '</span></div>' +
      (t.R2 ? '<div class="plat">' + esc(t.NoPol || '-') + '</div>' : '') + '<div class="sm">' + esc(J.Asal) + ' → ' + esc(J.Tujuan) + '</div><div class="sm mut">' + App.tgl(J.Berangkat) + ' · ' + App.jam(J.Berangkat) + ' WITA · ' + esc(J.Kapal) + '</div><div style="margin-top:6px">' + App.badge(t.TiketStatus || 'Terbit') + '</div></div><div class="q">' + App.qr(t.TiketKode, 4) + '</div></div>';
  };
  App.countdown = function (el, iso, done) {
    const end = App.ts(iso), tick = () => { const s = Math.max(0, Math.floor((end - Date.now()) / 1000)); el.textContent = s ? String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : 'Waktu habis'; if (!s) { clearInterval(iv); if (done) done(); } };
    const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); tick(); }, 1000); tick(); App.cleanups.push(() => clearInterval(iv));
  };

  // ---------- animasi ----------
  let io = null;
  function count(el) {
    const to = Number(el.dataset.count) || 0, fmt = el.dataset.fmt, f = v => fmt === 'rp' ? App.rp(v) : Math.round(v).toLocaleString('id-ID');
    if (reduced || to === 0) { el.textContent = f(to); return; }
    const t0 = performance.now(), d = 900; (function step(t) { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = f(to * e); if (p < 1) requestAnimationFrame(step); })(t0);
  }
  App.fx = function (scope) {
    scope = scope || document;
    if (!io && 'IntersectionObserver' in window) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { threshold: .1 });
    $$('.rv:not(.shown)', scope).forEach((el, i) => { el.style.setProperty('--d', (i % 6) * 70 + 'ms'); if (io) io.observe(el); else el.classList.add('shown'); });
    $$('[data-count]', scope).forEach(count);
    $$('[data-w]', scope).forEach(el => requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = el.dataset.w + '%'; })));
  };
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return; const c = e.target.closest && e.target.closest('.card.fx'); if (!c) return;
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; c.style.setProperty('--mx', x + 'px'); c.style.setProperty('--my', y + 'px');
    if (!reduced && c.dataset.tilt !== '0') c.style.transform = 'perspective(900px) rotateX(' + (((y / r.height) - .5) * -6).toFixed(2) + 'deg) rotateY(' + (((x / r.width) - .5) * 6).toFixed(2) + 'deg) translateY(-3px)';
  }, { passive: true });
  document.addEventListener('pointerout', e => { const c = e.target.closest && e.target.closest('.card.fx'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.btn'); if (!b || reduced) return; const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), sp = document.createElement('span');
    sp.className = 'rip'; sp.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px'; b.appendChild(sp); setTimeout(() => sp.remove(), 650);
  });

  /** Cetak potongan HTML (kuitansi/tiket) tanpa ikut mencetak halaman. */
  App.printHtml = function (html) {
    const pa = document.createElement('div'); pa.id = 'pa'; pa.className = 'sk-app'; pa.innerHTML = html; document.body.appendChild(pa); document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); pa.remove(); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 80); setTimeout(done, 60000);
  };
  /** Cetak isi sebuah elemen halaman (laporan/manifest) tanpa menu situs; bagian .no-print tidak ikut. */
  App.printEl = function (el) { const c = el.cloneNode(true); App.$$('.no-print', c).forEach(x => x.remove()); App.printHtml(c.innerHTML); };
  App.landing = r => ({ admin: 'dash', loket: 'loket', pelabuhan: 'scan', operator: 'kapal' })[r] || 'akun';
  App.page = (name, roles, fn) => { App.pages[name] = { roles, fn }; };
  App.route = (pat, fn) => { const keys = []; const re = new RegExp('^' + pat.replace(/:(\w+)/g, (m, k) => { keys.push(k); return '([^/]+)'; }) + '$'); App.routes.push({ re, keys, fn }); };
  App.cleanup = () => { const c = App.cleanups; App.cleanups = []; c.forEach(f => { try { f(); } catch (e) { } }); App.$$('.ov').forEach(o => o.remove()); };
  App.routes = [];

  // ---------- status jaringan ----------
  function netUpdate() { App.online = navigator.onLine; $$('#netTop').forEach(n => { n.className = 'net ' + (App.online ? 'on' : 'off'); n.lastChild.textContent = App.online ? 'ONLINE' : 'OFFLINE'; }); document.dispatchEvent(new CustomEvent('sdk-net', { detail: App.online })); }
  window.addEventListener('online', netUpdate); window.addEventListener('offline', netUpdate);

  App.ROLEL = ROLEL;
})();
;
/* ===== public.js ===== */
/* SIDIKAPET — halaman publik: beranda, jadwal, pesan tiket, cek pesanan, login petugas. */
(function () {
  'use strict';
  const App = window.SKA, { esc, $, $$, rp, tgl, jam } = App;
  const SHIP = '<svg class="ship" viewBox="0 0 400 220" aria-hidden="true"><defs><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cfe9ee"/></linearGradient></defs>' +
    '<path d="M20 130h360l-34 62H62z" fill="#0B3F52"/><path d="M20 130h360l-6 11H26z" fill="#34A06A"/><rect x="70" y="84" width="250" height="46" rx="6" fill="url(#hl)"/><rect x="104" y="48" width="170" height="38" rx="6" fill="#e7f4f7"/><rect x="150" y="22" width="60" height="28" rx="5" fill="#43A2AC"/><rect x="170" y="8" width="20" height="16" rx="3" fill="#11607C"/>' +
    [84, 118, 152, 186, 220, 254, 288].map(x => '<rect x="' + x + '" y="96" width="20" height="18" rx="4" fill="#43A2AC" opacity=".85"/>').join('') + [118, 150, 182, 214, 246].map(x => '<rect x="' + x + '" y="58" width="18" height="14" rx="3" fill="#11607C" opacity=".8"/>').join('') + '<path d="M215 22l26 10-26 10z" fill="#34A06A"/></svg>';
  const WAVES = '<div class="waves" aria-hidden="true"><svg viewBox="0 0 1200 90" preserveAspectRatio="none"><path d="M0 40c100 0 100 24 200 24s100-24 200-24 100 24 200 24 100-24 200-24 100 24 200 24 100-24 200-24v50H0z" fill="#F4F8F9"/></svg><svg viewBox="0 0 1200 90" preserveAspectRatio="none"><path d="M0 52c100 0 100-22 200-22s100 22 200 22 100-22 200-22 100 22 200 22 100-22 200-22 100 22 200 22v38H0z" fill="#F4F8F9"/></svg></div><div class="bubbles" aria-hidden="true"><span></span><span></span><span></span><span></span></div>';

  const mine = { get() { try { return JSON.parse(localStorage.getItem('sdk_mine')) || []; } catch (e) { return []; } }, add(kode, hp) { const a = mine.get().filter(x => x.kode !== kode); a.unshift({ kode, hp, t: Date.now() }); try { localStorage.setItem('sdk_mine', JSON.stringify(a.slice(0, 5))); } catch (e) { } } };

  function optPel(sel) { const p = (App.boot && App.boot.pelabuhan) || []; return '<option value="">Semua</option>' + p.map(x => '<option value="' + esc(x.PelabuhanID) + '"' + (x.PelabuhanID === sel ? ' selected' : '') + '>' + esc(x.Nama) + '</option>').join(''); }
  const minR2 = j => (j.TarifR2 || []).length ? Math.min.apply(null, j.TarifR2.map(t => t.Harga)) : 0;
  function r2info(j) { return j.KuotaR2 > 0 && (j.TarifR2 || []).length ? '<div class="sm">🏍️ Motor: ' + (j.SisaR2 > 0 ? 'sisa <b>' + j.SisaR2 + '</b> dari ' + j.KuotaR2 + ' unit · mulai ' + rp(minR2(j)) : '<span style="color:var(--err)">kuota penuh</span>') + '</div>' : ''; }
  function jadwalCard(j) {
    const pct = j.Kuota ? Math.round(j.Terisi / j.Kuota * 100) : 0, bisa = j.Status === 'Terjadwal' && j.Sisa > 0, low = j.Kuota && j.Sisa / j.Kuota < .2;
    const st = j.Status !== 'Terjadwal' ? App.badge(j.Status) : (j.Sisa === 0 ? '<span class="badge err">Penuh</span>' : low ? '<span class="badge warn">Sisa ' + j.Sisa + ' kursi</span>' : '<span class="badge ok">Tersedia</span>');
    return '<div class="card fx jd rv"><div class="row between"><div class="rt">' + esc(j.Asal) + ' <span class="arrow">➜</span> ' + esc(j.Tujuan) + '</div>' + st + '</div>' +
      '<div class="row" style="gap:18px;align-items:flex-end"><div><div class="xs mut">Berangkat</div><div class="tm">' + jam(j.Berangkat) + '</div></div><div><div class="xs mut">Tiba (estimasi)</div><div class="b">' + jam(j.Tiba) + '</div></div><div class="grow r"><div class="b">' + tgl(j.Berangkat) + '</div><div class="xs mut">WITA</div></div></div>' +
      '<div class="sm">🚢 ' + esc(j.Kapal) + '</div>' + r2info(j) + '<div><div class="row between xs mut"><span>Terisi ' + j.Terisi + ' / ' + j.Kuota + '</span><span>' + pct + '%</span></div><div class="bar ' + (low ? 'low' : '') + '"><i data-w="' + pct + '" style="width:0"></i></div></div>' +
      '<div class="row between"><div><span class="xs mut">Mulai dari</span><div class="price">' + (j.TarifMin ? rp(j.TarifMin) : '-') + '</div></div>' + (bisa ? '<a class="btn btn-glow" href="#/pesan/' + esc(j.JadwalID) + '">Pesan Tiket ➜</a>' : '<span class="btn dis ghost">Tidak tersedia</span>') + '</div></div>';
  }

  // ---------------- BERANDA ----------------
  App.route('/', async function (v) {
    const slogan = () => esc((App.boot && App.boot.set.SLOGAN) || 'Layanan Laut Cepat, Data Tepat');
    v.innerHTML = '<section class="hero"><div class="wrap hero-grid"><div class="rv"><span class="badge-top"><i class="dot"></i> Layanan resmi Dishub Kota Balikpapan</span><h1>Tiket kapal online.<br>Pesan dari rumah, bayar di loket.</h1><p>' + slogan() + '. Pilih jadwal, dapatkan kode booking, bayar <b>tunai di loket Dishub</b>, lalu tunjukkan QR tiket di pelabuhan.</p>' +
      '<div class="row" style="margin-top:20px"><a class="btn btn-glow lg" href="#/jadwal">🎫 Pesan Tiket Sekarang</a><a class="btn lg ghost" style="--c:#fff;color:#fff" href="#/cek">Cek Pesanan</a></div></div><div class="hero-art rv">' + SHIP + '</div></div>' + WAVES + '</section>' +
      '<section class="search wrap"><form class="card rv" id="fs"><div class="grid g4" style="align-items:end"><div class="field"><label for="sa">Asal</label><select class="in" id="sa">' + optPel('') + '</select></div><div class="field"><label for="st">Tujuan</label><select class="in" id="st">' + optPel('') + '</select></div><div class="field"><label for="sd">Tanggal</label><input class="in" type="date" id="sd" min="' + App.hariIni() + '"></div><div class="field"><button class="btn btn-glow blue block" type="submit">🔍 Cari Jadwal</button></div></div></form></section>' +
      '<section class="wrap mt2"><div id="minebox"></div><div class="row between mb"><div><h2 style="margin:0">Jadwal Terdekat</h2><div class="mut sm">Data diperbarui otomatis dari Dishub</div></div><a class="btn ghost" href="#/jadwal">Lihat semua</a></div><div id="stat" class="grid g3 mb"></div><div class="grid g3" id="jl">' + App.skel(3, 210) + '</div></section>' +
      '<section class="wrap mt2"><h2 class="rv">Cara memesan</h2><div class="grid g3 steps"><div class="card fx rv step"><h3>Pilih jadwal & isi data</h3><p class="mut sm" style="margin:0">Cukup nama dan nomor HP. NIK dan alamat boleh dikosongkan.</p></div><div class="card fx rv step"><h3>Terima kode booking</h3><p class="mut sm" style="margin:0">Bayar <b>tunai di loket Dishub</b> sebelum batas waktu. Lewat batas, pesanan otomatis hangus dan kursi dilepas.</p></div><div class="card fx rv step"><h3>Naik kapal dengan QR</h3><p class="mut sm" style="margin:0">Setelah dibayar, tiket QR terbit. Petugas memindai di pelabuhan, tetap jalan walau sinyal lemah.</p></div></div></section>' +
      '<section class="wrap mt2"><div class="grid g2"><div class="card fx rv"><h3>📍 Loket Dishub</h3><p id="lk" class="mut" style="margin:0"></p></div><form class="card fx rv" id="fc"><h3>🔎 Sudah punya kode booking?</h3><div class="row" style="flex-wrap:nowrap"><input class="in grow mono" id="kc" placeholder="SDK-XXXXXX" autocapitalize="characters" maxlength="12"><button class="btn" type="submit">Cek</button></div></form></div></section>';
    const lk = () => { const s = App.boot && App.boot.set; $('#lk', v).innerHTML = s ? esc(s.LOKET_ALAMAT || 'Alamat loket belum diisi admin.') + '<br><b>' + esc(s.LOKET_JAM || '') + '</b>' : '<span class="sk" style="display:block;height:40px"></span>'; };
    lk(); App.onBoot = () => { lk(); $$('#sa,#st', v).forEach(s => { const val = s.value; s.innerHTML = optPel(val); }); };
    $('#fs', v).onsubmit = e => { e.preventDefault(); const q = new URLSearchParams(); [['asal', 'sa'], ['tujuan', 'st'], ['tanggal', 'sd']].forEach(p => { const x = $('#' + p[1], v).value; if (x) q.set(p[0], x); }); App.nav('/jadwal' + (q.toString() ? '?' + q : '')); };
    $('#fc', v).onsubmit = e => { e.preventDefault(); const k = $('#kc', v).value.trim(); App.nav('/cek' + (k ? '?k=' + encodeURIComponent(k) : '')); };
    const m = mine.get(); if (m.length) $('#minebox', v).innerHTML = '<div class="alert ok no-print"><b>Pesanan Anda di perangkat ini:</b> ' + m.map(x => '<a class="mono b" href="#/cek?k=' + esc(x.kode) + '">' + esc(x.kode) + '</a>').join(' · ') + '</div>';
    App.swr('pj_home', () => App.api('pub.jadwal', {}).then(r => r.data), function (rows) {
      const aktif = rows.filter(j => j.Status === 'Terjadwal'), kursi = aktif.reduce((s, j) => s + j.Sisa, 0);
      $('#stat', v).innerHTML = '<div class="card fx rv kpi"><span class="ic">🗓️</span><div class="v" data-count="' + aktif.length + '">0</div><div class="l">Jadwal tersedia</div></div><div class="card fx rv kpi"><span class="ic">💺</span><div class="v" data-count="' + kursi + '">0</div><div class="l">Kursi masih kosong</div></div><div class="card fx rv kpi"><span class="ic">⚓</span><div class="v" data-count="' + ((App.boot && App.boot.pelabuhan.length) || 0) + '">0</div><div class="l">Pelabuhan / dermaga</div></div>';
      $('#jl', v).innerHTML = aktif.length ? aktif.slice(0, 6).map(jadwalCard).join('') : '<div class="empty" style="grid-column:1/-1"><div class="ic">⛴️</div>Belum ada jadwal terbuka. Silakan cek kembali nanti.</div>'; App.fx(v);
    }, 20000).catch(e => { $('#jl', v).innerHTML = '<div class="alert err" style="grid-column:1/-1">' + esc(e.message) + '</div>'; });
  });

  // ---------------- DAFTAR JADWAL ----------------
  App.route('/jadwal', async function (v, ctx) {
    const q = ctx.query;
    v.innerHTML = '<div class="wrap" style="padding-top:24px"><h2>Jadwal Kapal</h2><form class="card mb" id="ff"><div class="grid g4" style="align-items:end"><div class="field"><label>Asal</label><select class="in" id="fa">' + optPel(q.asal) + '</select></div><div class="field"><label>Tujuan</label><select class="in" id="ft">' + optPel(q.tujuan) + '</select></div><div class="field"><label>Tanggal</label><input class="in" type="date" id="fd" min="' + App.hariIni() + '" value="' + esc(q.tanggal || '') + '"></div><div class="field row"><button class="btn blue" type="submit">Terapkan</button><a class="btn ghost" href="#/jadwal">Atur ulang</a></div></div></form><div class="grid g3" id="jl">' + App.skel(3, 220) + '</div></div>';
    $('#ff', v).onsubmit = e => { e.preventDefault(); const p = new URLSearchParams(); [['asal', 'fa'], ['tujuan', 'ft'], ['tanggal', 'fd']].forEach(x => { const val = $('#' + x[1], v).value; if (val) p.set(x[0], val); }); App.nav('/jadwal' + (p.toString() ? '?' + p : '')); };
    App.onBoot = () => { $('#fa', v).innerHTML = optPel(q.asal); $('#ft', v).innerHTML = optPel(q.tujuan); };
    try {
      const r = await App.api('pub.jadwal', { asal: q.asal, tujuan: q.tujuan, tanggal: q.tanggal });
      $('#jl', v).innerHTML = r.data.length ? r.data.map(jadwalCard).join('') : '<div class="empty card" style="grid-column:1/-1"><div class="ic">🔍</div>Tidak ada jadwal yang cocok. Coba ubah filter.</div>';
    } catch (e) { $('#jl', v).innerHTML = '<div class="alert err" style="grid-column:1/-1">' + esc(e.message) + '</div>'; }
  });

  // ---------------- PESAN TIKET ----------------
  App.route('/pesan/:id', async function (v, ctx) {
    v.innerHTML = '<div class="wrap" style="padding-top:24px">' + App.skel(2, 160) + '</div>';
    let j; try { const r = await App.api('pub.jadwal', {}); j = r.data.filter(x => x.JadwalID === ctx.params.id)[0]; } catch (e) { v.innerHTML = '<div class="wrap"><div class="alert err mt">' + esc(e.message) + '</div></div>'; return; }
    if (!j || j.Status !== 'Terjadwal') { v.innerHTML = '<div class="wrap empty"><div class="ic">⛴️</div><h2>Jadwal tidak tersedia</h2><p>Jadwal ini sudah berangkat, dibatalkan, atau tidak ditemukan.</p><a class="btn" href="#/jadwal">Pilih jadwal lain</a></div>'; return; }
    const maks = Math.max(1, Math.min(Number((App.boot && App.boot.set.MAKS_PENUMPANG) || 10), j.Sisa)), kat = j.Tarif.map(t => t.Kategori), harga = {}; j.Tarif.forEach(t => { harga[t.Kategori] = t.Harga; });
    const r2k = j.TarifR2 || [], hargaR2 = {}; r2k.forEach(t => { hargaR2[t.Kategori] = t.Harga; });
    const bisaR2 = j.KuotaR2 > 0 && j.SisaR2 > 0 && r2k.length > 0, maksR2 = Math.max(0, Math.min(Number((App.boot && App.boot.set.MAKS_R2) || 5), j.SisaR2));
    const r2Row = () => '<div class="card flat r2r" style="margin-bottom:10px"><div class="row between"><b>🏍️ Motor <span class="no2"></span></b><button type="button" class="btn sm ghost red rm2" aria-label="Hapus motor">Hapus</button></div><div class="grid g3 mt"><div class="field"><label>Jenis motor *</label><select class="in r2k">' + r2k.map(t => '<option value="' + esc(t.Kategori) + '">' + esc(t.Kategori) + ' — ' + rp(t.Harga) + '</option>').join('') + '</select></div><div class="field"><label>Nomor polisi *</label><input class="in r2p" maxlength="12" placeholder="KT 1234 AB" autocapitalize="characters" autocomplete="off"></div><div class="field"><label>Nama pengendara</label><input class="in r2n" maxlength="80" placeholder="kosong = nama pemesan" autocomplete="off"></div></div></div>';
    const r2box = bisaR2 ? '<div class="card mb" id="r2box"><div class="row between"><h3 style="margin:0">🏍️ Bawa motor? <span class="mut sm">(opsional)</span></h3><span class="mut sm">Sisa kuota motor ' + j.SisaR2 + ' unit · maks ' + maksR2 + ' per pesanan</span></div><div id="r2l" class="mt"></div><button type="button" class="btn ghost" id="add2">＋ Tambah motor</button><div class="hint">Setiap motor mendapat tiket QR sendiri dan harus disertai minimal 1 penumpang. Nomor polisi dicocokkan petugas saat naik kapal.</div></div>' : (j.KuotaR2 > 0 ? '<div class="alert warn sm">Kuota motor untuk jadwal ini sudah penuh.</div>' : '');
    const t0 = Date.now(); let n = 0;
    App.waTeks = 'Halo Dishub, saya ingin memesan tiket ' + j.Asal + ' → ' + j.Tujuan + ' tanggal ' + tgl(j.Berangkat) + ' pukul ' + jam(j.Berangkat) + '.';
    const rowHtml = () => { const i = ++n; return '<div class="card flat pn" data-i="' + i + '" style="margin-bottom:12px"><div class="row between"><b>Penumpang <span class="no">' + i + '</span></b><button type="button" class="btn sm ghost red rm" aria-label="Hapus penumpang">Hapus</button></div><div class="grid g2 mt"><div class="field"><label>Nama lengkap *</label><input class="in pnama" maxlength="80" autocomplete="off"></div><div class="field"><label>Kategori tarif *</label><select class="in pkat">' + kat.map(k => '<option value="' + esc(k) + '">' + esc(k) + ' — ' + rp(harga[k]) + '</option>').join('') + '</select></div></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" class="same" checked> Nomor HP sama dengan pemesan</label><div class="field mt" hidden><label>Nomor HP penumpang *</label><input class="in php" inputmode="tel" placeholder="08xxxxxxxxxx"></div>' +
      '<details class="mt"><summary class="sm b" style="cursor:pointer">Data tambahan (opsional): NIK & alamat</summary><div class="grid g2 mt"><div class="field"><label>NIK (16 digit)</label><input class="in pnik" inputmode="numeric" maxlength="16"></div><div class="field"><label>Alamat</label><input class="in palm" maxlength="200"></div></div></details></div>'; };
    v.innerHTML = '<div class="wrap" style="padding-top:24px;max-width:860px"><a href="#/jadwal" class="sm">← Kembali ke jadwal</a><h2 class="mt">Pesan Tiket</h2><div class="card mb"><div class="row between"><div class="rt b" style="font-size:1.1rem">' + esc(j.Asal) + ' ➜ ' + esc(j.Tujuan) + '</div>' + App.badge('Terjadwal') + '</div><div class="sm mut mt">' + App.tglJam(j.Berangkat) + ' · tiba ± ' + jam(j.Tiba) + ' · 🚢 ' + esc(j.Kapal) + ' · sisa ' + j.Sisa + ' kursi</div></div>' +
      '<form id="fp" novalidate><div class="card mb"><h3>Data pemesan</h3><div class="grid g2"><div class="field"><label for="pn">Nama pemesan *</label><input class="in" id="pn" maxlength="80" autocomplete="name"></div><div class="field"><label for="ph">Nomor HP / WhatsApp *</label><input class="in" id="ph" inputmode="tel" placeholder="08xxxxxxxxxx" autocomplete="tel"><div class="hint">Kode booking dan notifikasi dikirim ke nomor ini.</div></div></div></div>' +
      '<div id="pl"></div><div class="row mb"><button type="button" class="btn ghost" id="add">＋ Tambah penumpang</button><span class="mut sm">Maksimal ' + maks + ' penumpang (sisa kursi ' + j.Sisa + ')</span></div>' + r2box +
      '<div class="card mb"><div class="row between"><div><div class="mut sm">Total pembayaran (tunai di loket)</div><div class="price" style="font-size:1.8rem;font-weight:800;color:var(--grn)" id="tot">Rp 0</div></div><label style="display:flex;gap:8px;align-items:flex-start;max-width:380px;font-weight:500;font-size:.85rem"><input type="checkbox" id="ok" style="margin-top:3px"> Saya setuju data saya dipakai untuk manifest penumpang dan keselamatan pelayaran, serta menyadari pesanan hangus bila tidak dibayar sebelum batas waktu.</label></div></div>' +
      '<input class="hp" name="situs" id="situs" tabindex="-1" autocomplete="off" aria-hidden="true"><div id="er" class="alert err" hidden></div><button class="btn btn-glow lg block" type="submit" id="go">✅ Buat Pesanan</button></form></div>';
    const pl = $('#pl', v), tot = () => { let s = 0; $$('.pn', pl).forEach(r => { s += harga[$('.pkat', r).value] || 0; }); $$('.r2r', v).forEach(r => { s += hargaR2[$('.r2k', r).value] || 0; }); $('#tot', v).textContent = rp(s); };
    const addRow = () => { if ($$('.pn', pl).length >= maks) return App.toast('Maksimal ' + maks + ' penumpang.', 'warn'); pl.insertAdjacentHTML('beforeend', rowHtml()); renum(); tot(); };
    const renum = () => $$('.pn', pl).forEach((r, i) => { $('.no', r).textContent = i + 1; $('.rm', r).style.visibility = $$('.pn', pl).length === 1 ? 'hidden' : 'visible'; });
    pl.addEventListener('click', e => { const b = e.target.closest('.rm'); if (b) { b.closest('.pn').remove(); renum(); tot(); } });
    pl.addEventListener('change', e => { if (e.target.classList.contains('pkat')) tot(); if (e.target.classList.contains('same')) e.target.closest('.pn').querySelector('.php').closest('.field').hidden = e.target.checked; });
    $('#add', v).onclick = addRow; addRow();
    if (bisaR2) {
      const l2 = $('#r2l', v), renum2 = () => $$('.r2r', l2).forEach((r, i) => { $('.no2', r).textContent = i + 1; });
      $('#add2', v).onclick = () => { if ($$('.r2r', l2).length >= maksR2) return App.toast('Maksimal ' + maksR2 + ' motor.', 'warn'); l2.insertAdjacentHTML('beforeend', r2Row()); renum2(); tot(); };
      l2.addEventListener('click', e => { const b = e.target.closest('.rm2'); if (b) { b.closest('.r2r').remove(); renum2(); tot(); } });
      l2.addEventListener('change', e => { if (e.target.classList.contains('r2k')) tot(); });
    }
    $('#fp', v).onsubmit = async e => {
      e.preventDefault(); const er = $('#er', v); er.hidden = true; const fail = m => { er.textContent = m; er.hidden = false; er.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      const nama = $('#pn', v).value.trim(), hp = $('#ph', v).value.trim(); if (nama.length < 2) return fail('Nama pemesan wajib diisi.'); if (!/^(\+?62|0)8\d{8,12}$/.test(hp.replace(/[\s-]/g, ''))) return fail('Nomor HP pemesan tidak valid. Contoh: 081234567890.');
      const pn = []; for (const r of $$('.pn', pl)) { const i = $('.no', r).textContent, nm = $('.pnama', r).value.trim(), same = $('.same', r).checked, ph = same ? hp : $('.php', r).value.trim(), nik = $('.pnik', r).value.replace(/\D/g, ''); if (nm.length < 2) return fail('Nama penumpang ' + i + ' wajib diisi.'); if (!/^(\+?62|0)8\d{8,12}$/.test(ph.replace(/[\s-]/g, ''))) return fail('Nomor HP penumpang ' + i + ' tidak valid.'); if (nik && nik.length !== 16) return fail('NIK penumpang ' + i + ' harus 16 digit atau dikosongkan.'); pn.push({ nama: nm, hp: ph, kategori: $('.pkat', r).value, nik, alamat: $('.palm', r).value.trim() }); }
      const kd = []; for (const r of $$('.r2r', v)) { const i = kd.length + 1, np = $('.r2p', r).value.trim().toUpperCase(); if (np.replace(/\s/g, '').length < 3) return fail('Nomor polisi motor ' + i + ' wajib diisi (contoh KT 1234 AB).'); kd.push({ nama: $('.r2n', r).value.trim() || nama, nopol: np, kategori: $('.r2k', r).value }); }
      if (!$('#ok', v).checked) return fail('Centang persetujuan terlebih dahulu.');
      await App.busy($('#go', v), async () => {
        try { const r = await App.api('pub.pesan', { jadwalId: j.JadwalID, pemesan: { nama, hp }, penumpang: pn, kendaraan: kd, situs: $('#situs', v).value, ts: t0 }); mine.add(r.data.kode, hp); sukses(v, r.data, j, hp); }
        catch (x) { fail(x.message); }
      });
    };
  });
  function sukses(v, d, j, hp) {
    const s = (App.boot && App.boot.set) || {}; App.waTeks = 'Halo Dishub, saya sudah memesan tiket dengan kode ' + d.kode + '.';
    v.innerHTML = '<div class="wrap c" style="padding-top:36px;max-width:640px"><div style="font-size:3rem">🎉</div><h2>Pesanan berhasil dibuat</h2><p class="mut">Simpan kode booking ini. <b>Pesanan belum menjadi tiket</b> sampai Anda membayar tunai di loket.</p><div class="kode-big">' + esc(d.kode) + '</div>' +
      '<div class="row mt" style="justify-content:center"><button class="btn" id="cp">📋 Salin kode</button><a class="btn grn" href="#/cek?k=' + esc(d.kode) + '">Lihat status pesanan</a></div>' +
      '<div class="card mt" style="text-align:left"><div class="row between"><div><div class="mut sm">Total bayar tunai</div><div class="price" style="font-size:1.6rem;font-weight:800;color:var(--grn)">' + rp(d.total) + '</div></div><div class="r"><div class="mut sm">Bayar sebelum</div><div class="b">' + App.tglJam(d.batasBayar) + '</div><div class="timer" id="cd" style="color:var(--err)"></div></div></div><hr style="border:0;border-top:1px solid var(--bd);margin:14px 0"><div class="sm"><b>' + esc(j.Asal) + ' → ' + esc(j.Tujuan) + '</b> · ' + App.tglJam(j.Berangkat) + ' · ' + d.jumlah + ' penumpang' + (d.jumlahR2 ? ' + ' + d.jumlahR2 + ' motor' : '') + '</div></div>' +
      '<div class="alert mt" style="text-align:left"><b>Langkah berikutnya</b><br>1. Datang ke ' + esc(s.LOKET_ALAMAT || 'loket Dishub') + ' (' + esc(s.LOKET_JAM || '') + ').<br>2. Sebutkan kode <b>' + esc(d.kode) + '</b> atau nomor HP Anda.<br>3. Bayar tunai, terima kuitansi dan tiket QR.</div></div>';
    $('#cp', v).onclick = () => App.copy(d.kode); App.countdown($('#cd', v), d.batasBayar); window.scrollTo(0, 0);
  }

  // ---------------- CEK PESANAN ----------------
  App.route('/cek', async function (v, ctx) {
    const last = mine.get()[0], k0 = (ctx.query.k || (last && last.kode) || '').toUpperCase(), h0 = (last && last.kode === k0 ? last.hp : '');
    v.innerHTML = '<div class="wrap" style="padding-top:24px;max-width:860px"><h2>Cek Pesanan & Tiket</h2><form class="card mb no-print" id="fc"><div class="grid g3" style="align-items:end"><div class="field"><label for="ck">Kode booking</label><input class="in mono" id="ck" placeholder="SDK-XXXXXX" maxlength="12" autocapitalize="characters" value="' + esc(k0) + '"></div><div class="field"><label for="ch">Nomor HP pemesan</label><input class="in" id="ch" inputmode="tel" placeholder="08xxxxxxxxxx" value="' + esc(h0) + '"></div><div class="field"><button class="btn btn-glow blue block" type="submit">🔎 Cek</button></div></div></form><div id="out"></div></div>';
    const out = $('#out', v); let poll = null;
    const load = async (quiet) => {
      const kode = $('#ck', v).value.trim().toUpperCase(), hp = $('#ch', v).value.trim(); if (!kode || !hp) { if (!quiet) App.toast('Isi kode booking dan nomor HP.', 'warn'); return; }
      if (!quiet) out.innerHTML = App.skel(2, 120);
      try { const r = await App.api('pub.cek', { kode, hp }); mine.add(kode, hp); App.waTeks = 'Halo Dishub, saya ingin bertanya tentang pesanan ' + kode + '.'; tampil(out, r.data, kode); if (r.data.pesanan.Status === 'Menunggu') { clearInterval(poll); poll = setInterval(() => { if (!out.isConnected) return clearInterval(poll); if (document.visibilityState === 'visible') load(true); }, 20000); } else clearInterval(poll); }
      catch (e) { if (!quiet) out.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    App.cleanups.push(() => clearInterval(poll));
    $('#fc', v).onsubmit = e => { e.preventDefault(); load(); }; if (k0 && h0) load();
  });
  function tampil(out, d, kode) {
    const p = d.pesanan, J = d.jadwal, st = p.Status;
    const banner = { Menunggu: '<div class="alert"><b>Menunggu pembayaran tunai.</b> Bayar di loket sebelum <b>' + App.tglJam(p.BatasBayar) + '</b>. Sisa waktu: <span class="timer" id="cd" style="color:var(--err)"></span></div>', Dibayar: '<div class="alert ok"><b>Pembayaran diterima. Tiket sudah terbit.</b> Tunjukkan kode QR kepada petugas di pelabuhan.</div>', Kedaluwarsa: '<div class="alert warn"><b>Pesanan kedaluwarsa</b> karena tidak dibayar sebelum batas waktu. Kursi sudah dilepas; silakan memesan ulang.</div>', Batal: '<div class="alert err"><b>Pesanan dibatalkan.</b> Hubungi loket bila Anda butuh penjelasan.</div>', Refund: '<div class="alert warn"><b>Jadwal dibatalkan Dishub.</b> Datang ke loket untuk proses pengembalian dana.</div>' }[st] || '';
    out.innerHTML = banner + '<div class="card mb"><div class="row between"><div><div class="mut sm">Kode booking</div><div class="mono b" style="font-size:1.4rem;color:var(--pri)">' + esc(p.Kode) + '</div></div>' + App.badge(st) + '<div class="r"><div class="mut sm">Total</div><div class="b" style="font-size:1.2rem">' + rp(p.Total) + '</div></div></div>' +
      (J ? '<hr style="border:0;border-top:1px solid var(--bd);margin:12px 0"><div class="b">' + esc(J.Asal) + ' → ' + esc(J.Tujuan) + '</div><div class="sm mut">' + App.tglJam(J.Berangkat) + ' · ' + esc(J.Kapal) + ' · Status kapal: ' + esc(J.Status) + '</div>' : '') + '</div>' +
      (st === 'Dibayar' ? '<div class="row between mb no-print"><h3 style="margin:0">Tiket Anda</h3><button class="btn" id="pcetak">🖨️ Cetak / simpan PDF</button></div><div class="grid g2" id="tkgrid">' + d.penumpang.map(x => App.tiketCard(x, J, kode)).join('') + '</div>' :
        '<h3>Penumpang' + (p.JumlahR2 ? ' & Kendaraan' : '') + '</h3>' + App.table([{ h: 'Nama', f: r => esc(r.Nama) }, { h: 'Kategori', f: r => (r.R2 ? '🏍️ ' : '') + esc(r.Kategori) + (r.R2 ? '<div class="plat">' + esc(r.NoPol || '-') + '</div>' : '') }, { h: 'Tarif', cls: 'num', f: r => rp(r.Harga) }], d.penumpang)) +
      '<div class="card flat mt sm mut no-print">Loket: ' + esc(d.loket.alamat || '-') + ' · ' + esc(d.loket.jam || '') + '</div>';
    const pc = $('#pcetak', out); if (pc) pc.onclick = () => App.printHtml('<div class="grid g2">' + $('#tkgrid', out).innerHTML + '</div>');
    const cd = $('#cd', out); if (cd) App.countdown(cd, p.BatasBayar, () => setTimeout(() => $('#fc', out.parentNode).requestSubmit(), 800)); App.fx(out);
  }

  // ---------------- LOGIN PETUGAS ----------------
  App.route('/masuk', async function (v, ctx) {
    const s = App.sesi.get(); if (s && s.token) { App.nav('/app/' + App.landing(s.me.role)); return; }
    const cfgOk = window.GAS_URL && !/XXXX|GANTI/.test(window.GAS_URL);
    v.innerHTML = '<div class="wrap" style="max-width:440px;padding:40px 16px"><div class="c mb"><img src="assets/sidikapet-logo.png" alt="" width="84" height="84" style="border-radius:20px"><h2 class="mt">Masuk Petugas</h2><p class="mut sm">Untuk Petugas Loket, Petugas Pelabuhan, dan Operator Kapal.<br>Admin Dishub masuk lewat <a href="javascript:void(0)" data-nav="login"><b>Login Admin</b></a> situs (satu login untuk semua panel).</p></div>' +
      (cfgOk ? '' : '<div class="alert err">Alamat server belum diisi di <code>js/config.js</code>.</div>') +
      '<form class="card fx" id="fl" data-tilt="0"><div class="field"><label for="u">Nama pengguna</label><input class="in" id="u" autocomplete="username" autocapitalize="none" required></div><div class="field"><label for="p">Kata sandi</label><div class="row" style="flex-wrap:nowrap"><input class="in grow" id="p" type="password" autocomplete="current-password" required><button type="button" class="btn ghost" id="sh" aria-label="Tampilkan sandi">👁</button></div></div><div id="er" class="err-t" style="margin-bottom:10px"></div><button class="btn btn-glow block lg" type="submit">Masuk</button></form><p class="c sm mut mt"><a href="#/">← Kembali ke SIDIKAPET</a></p></div>';
    $('#sh', v).onclick = () => { const p = $('#p', v); p.type = p.type === 'password' ? 'text' : 'password'; };
    $('#fl', v).onsubmit = async e => {
      e.preventDefault(); const b = $('button[type=submit]', v); $('#er', v).textContent = '';
      await App.busy(b, async () => { try { const r = await App.api('auth.login', { username: $('#u', v).value, password: $('#p', v).value, perangkat: navigator.platform || '' }); App.sesi.set({ token: r.data.token, me: r.data.me }); App.toast('Selamat datang, ' + r.data.me.nama + '.'); App.nav('/app/' + App.landing(r.data.me.role)); } catch (x) { $('#er', v).textContent = x.message; } });
    };
  });
})();
;
/* ===== staff.js ===== */
/* SIDIKAPET — panel petugas (bagian admin): dashboard, jadwal, master data, pengguna, pengaturan, audit, laporan, akun. */
(function () {
  'use strict';
  const App = window.SKA, { esc, $, $$, rp, tgl, jam } = App;
  const head = (judul, extra) => '<div class="pagehead"><h2>' + judul + '</h2><div class="row no-print">' + (extra || '') + '</div></div>';

  // ---------- grafik SVG ringan ----------
  App.chartLine = function (data, o) {
    o = o || {}; const W = 640, H = 230, pl = 38, pr = 12, pt = 14, pb = 30, max = Math.max(4, Math.ceil(Math.max.apply(null, data.map(d => d.n)) * 1.15)), n = data.length;
    const X = i => pl + (n < 2 ? 0 : i * (W - pl - pr) / (n - 1)), Y = v => pt + (H - pt - pb) * (1 - v / max);
    const pts = data.map((d, i) => [X(i), Y(d.n)]), path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const grid = [0, 1, 2, 3, 4].map(k => { const v = max * k / 4, y = Y(v); return '<line class="gr" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(v) + '</text>'; }).join('');
    const step = Math.ceil(n / 6), xl = data.map((d, i) => i % step === 0 || i === n - 1 ? '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(d.t.slice(8, 10) + '/' + d.t.slice(5, 7)) + '</text>' : '').join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Grafik garis') + '"><defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43A2AC"/><stop offset="1" stop-color="#43A2AC" stop-opacity="0"/></linearGradient></defs>' + grid + xl +
      (n ? '<path class="ar" d="' + path + ' L' + X(n - 1) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + 'Z"/><path class="ln" style="--len:' + Math.ceil(len) + '" d="' + path + '"/>' + pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="#fff" stroke="#11607C" stroke-width="2"><title>' + esc(data[i].t) + ': ' + data[i].n + '</title></circle>').join('') : '') + '</svg>';
  };
  App.chartBars = function (rows, fmt) {
    if (!rows.length) return '<div class="empty">Belum ada data.</div>'; const max = Math.max.apply(null, rows.map(r => r.n)) || 1;
    return rows.map(r => '<div style="margin-bottom:12px"><div class="row between sm"><span class="b">' + esc(r.nama) + '</span><span class="mut">' + (fmt ? fmt(r.n) : r.n) + '</span></div><div class="bar"><i data-w="' + Math.round(r.n / max * 100) + '" style="width:0"></i></div></div>').join('');
  };

  // ---------- DASHBOARD ----------
  App.page('dash', 'A', async function (v) {
    v.innerHTML = head('Dashboard', '<button class="btn sm ghost" id="rf">↻ Segarkan</button>') + '<div id="db">' + App.skel(2, 110) + '</div>';
    const render = d => {
      const k = d.kartu, t = d.tindakan, tin = [];
      if (t.kapalPending) tin.push('<a href="#/app/master"><b>' + t.kapalPending + ' kapal</b> menunggu verifikasi dokumen</a>');
      t.dokumenHampirHabis.forEach(x => tin.push('Dokumen <b>' + esc(x.nama) + '</b> berakhir ' + tgl(x.berlaku)));
      if (t.perluRefund) tin.push('<a href="#/app/loket"><b>' + t.perluRefund + ' pesanan</b> perlu diproses pengembalian dana</a>');
      t.selisihKas.forEach(x => tin.push('Selisih kas ' + tgl(x.tgl) + ' (' + esc(x.petugas) + '): <b>' + rp(x.selisih) + '</b>'));
      $('#db', v).innerHTML = '<div class="grid g4 mb">' + [['🗓️', k.jadwalHariIni, 'Jadwal hari ini'], ['👥', k.penumpangHariIni, 'Penumpang terbayar hari ini'], ['🎫', k.tiketHariIni, 'Tiket terbit hari ini'], ['💵', k.pendapatanHariIni, 'Penerimaan tunai hari ini (bersih)', 'rp']].map(x => '<div class="card fx rv kpi"><span class="ic">' + x[0] + '</span><div class="v" data-count="' + x[1] + '"' + (x[3] ? ' data-fmt="rp"' : '') + '>0</div><div class="l">' + x[2] + '</div></div>').join('') + '</div>' +
        (tin.length ? '<div class="alert warn"><b>Perlu tindakan</b><ul style="margin:6px 0 0 18px;padding:0">' + tin.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' : '') +
        '<div class="grid g2 mb"><div class="card"><h3>Tren penumpang terbayar (30 hari)</h3>' + App.chartLine(d.tren, { label: 'Tren penumpang 30 hari' }) + '</div><div class="card"><h3>Penumpang per rute (30 hari)</h3>' + App.chartBars(d.perRute) + '</div></div>' +
        '<h3>Jadwal hari ini</h3>' + App.table([{ h: 'Berangkat', f: r => '<b>' + jam(r.Berangkat) + '</b>' }, { h: 'Rute', f: r => esc(r.Asal) + ' → ' + esc(r.Tujuan) }, { h: 'Kapal', f: r => esc(r.Kapal) }, { h: 'Terisi', f: r => r.Terisi + ' / ' + r.Kuota }, { h: 'Motor', f: r => r.KuotaR2 ? '🏍️ ' + r.TerisiR2 + ' / ' + r.KuotaR2 : '-' }, { h: 'Status', f: r => App.badge(r.Status) }], d.hariIni, { empty: 'Tidak ada jadwal hari ini.' });
      App.fx(v);
    };
    const muat = fresh => { if (fresh) try { localStorage.removeItem('sdk_c_s_dash'); } catch (e) { } return App.swr('s_dash', () => App.apiQ('admin.dash').then(r => r.data), render, fresh ? 0 : 30000).catch(e => { $('#db', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }); };
    $('#rf', v).onclick = e => App.busy(e.currentTarget, () => muat(true)); muat();
  });

  // ---------- JADWAL ----------
  App.page('jadwal', 'A', async function (v) {
    v.innerHTML = head('Jadwal Pelayaran', '<button class="btn grn" id="baru">＋ Jadwal baru</button>') + '<div class="card mb no-print"><div class="grid g4" style="align-items:end"><div class="field"><label>Dari tanggal</label><input class="in" type="date" id="d1"></div><div class="field"><label>Sampai</label><input class="in" type="date" id="d2"></div><div class="field"><label>Status</label><select class="in" id="ds"><option value="">Semua</option><option>Terjadwal</option><option>Berangkat</option><option>Tiba</option><option>Batal</option></select></div><div class="field"><button class="btn block" id="cari">Terapkan</button></div></div></div><div id="jl">' + App.skel(3, 60) + '</div>';
    let ref = { kapal: [], rute: [] };
    const muat = async () => {
      $('#jl', v).innerHTML = App.skel(3, 60);
      try {
        const r = await App.api('jadwal.list', { dari: $('#d1', v).value, sampai: $('#d2', v).value, status: $('#ds', v).value }); ref = r.data;
        $('#jl', v).innerHTML = App.table([{ h: 'Berangkat', f: x => '<b>' + tgl(x.Berangkat) + '</b><br><span class="mut sm">' + jam(x.Berangkat) + ' → ' + jam(x.Tiba) + ' WITA</span>' }, { h: 'Rute', f: x => esc(x.Asal) + ' → ' + esc(x.Tujuan) }, { h: 'Kapal', f: x => esc(x.Kapal) }, { h: 'Terisi', cls: 'num', f: x => x.Terisi + ' / ' + x.Kuota }, { h: 'Motor', cls: 'num', f: x => x.KuotaR2 ? x.TerisiR2 + ' / ' + x.KuotaR2 : '-' }, { h: 'Status', f: x => App.badge(x.Status) },
        { h: 'Aksi', f: x => '<div class="row" style="gap:6px;flex-wrap:nowrap">' + (x.Status === 'Terjadwal' ? '<button class="btn sm ghost" data-e="' + esc(x.JadwalID) + '">Ubah</button><button class="btn sm ghost red" data-c="' + esc(x.JadwalID) + '">Batalkan</button>' : '') + '<a class="btn sm ghost" href="#/app/manifest?j=' + esc(x.JadwalID) + '">Manifest</a></div>' }], r.data.rows, { empty: 'Tidak ada jadwal pada rentang ini.' });
      } catch (e) { $('#jl', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    const form = (j) => {
      const dt = s => s ? s.slice(0, 16) : '';
      App.formModal({ title: j ? 'Ubah jadwal' : 'Jadwal baru', wide: true, fields: [
        { k: 'KapalID', label: 'Kapal', type: 'select', req: true, value: j && j.KapalID, options: ref.kapal.map(k => [k.KapalID, k.Nama + ' (kapasitas ' + k.Kapasitas + ')']) },
        { k: 'RuteID', label: 'Rute', type: 'select', req: true, value: j && j.RuteID, options: ref.rute.map(r => [r.RuteID, r.Nama]) },
        { k: 'Berangkat', label: 'Berangkat (WITA)', type: 'datetime-local', req: true, value: dt(j && j.Berangkat) }, { k: 'Tiba', label: 'Tiba (WITA)', type: 'datetime-local', req: true, value: dt(j && j.Tiba) },
        { k: 'Kuota', label: 'Kuota kursi', type: 'number', req: true, value: j ? j.Kuota : '', hint: 'Tidak boleh melebihi kapasitas kapal.' },
        { k: 'KuotaR2', label: 'Kuota motor (R2)', type: 'number', value: j ? j.KuotaR2 : 0, hint: 'Jumlah motor yang bisa dimuat pada pelayaran ini. Isi 0 bila tidak menerima motor.' }],
        onSubmit: async x => { x.Kuota = Number(x.Kuota); x.KuotaR2 = Number(x.KuotaR2) || 0; if (j) x.JadwalID = j.JadwalID; await App.api('jadwal.save', x); App.toast('Jadwal disimpan.'); muat(); } });
    };
    $('#baru', v).onclick = () => { if (!ref.kapal.length || !ref.rute.length) return App.toast('Lengkapi kapal aktif dan rute di Master Data dulu.', 'warn'); form(null); };
    $('#cari', v).onclick = muat;
    v.addEventListener('click', async e => {
      const eb = e.target.closest('[data-e]'), cb = e.target.closest('[data-c]');
      if (eb) { const j = ref.rows.filter(x => x.JadwalID === eb.dataset.e)[0]; form(j); }
      if (cb) App.formModal({ title: 'Batalkan jadwal', cls: 'red', submitLabel: 'Batalkan jadwal', fields: [{ k: 'alasan', label: 'Alasan pembatalan', type: 'textarea', req: true, hint: 'Pesanan terdampak otomatis dibatalkan; yang sudah dibayar berstatus Refund.' }], onSubmit: async x => { const r = await App.api('jadwal.cancel', { jadwalId: cb.dataset.c, alasan: x.alasan }); App.toast(r.message, 'warn'); muat(); } });
    });
    muat();
  });

  // ---------- MASTER DATA ----------
  const MT = { operator: 'Operator', kapal: 'Kapal', pelabuhan: 'Pelabuhan', rute: 'Rute', tarif: 'Tarif' };
  App.page('master', 'A', async function (v, ctx) {
    let tab = ctx.query.tab || 'kapal', data = null;
    v.innerHTML = head('Master Data') + '<div class="tabs no-print" id="tb">' + Object.keys(MT).map(k => '<button data-t="' + k + '">' + MT[k] + '</button>').join('') + '</div><div id="mb"></div>';
    const nm = (list, id) => { const x = (list || []).filter(y => y.id === id)[0]; return x ? x.nama : id; };
    const fields = (t, row, ref) => ({
      operator: [{ k: 'Nama', label: 'Nama operator', req: true }, { k: 'PenanggungJawab', label: 'Penanggung jawab' }, { k: 'Kontak', label: 'Kontak (HP)' }],
      kapal: [{ k: 'Nama', label: 'Nama kapal', req: true }, { k: 'NoRegistrasi', label: 'No. registrasi', req: true }, { k: 'Jenis', label: 'Jenis' }, { k: 'Kapasitas', label: 'Kapasitas penumpang', type: 'number', req: true }, { k: 'OperatorID', label: 'Operator', type: 'select', req: true, options: ref.operator.map(o => [o.id, o.nama]) }, { k: 'DokumenBerlaku', label: 'Dokumen berlaku sampai', type: 'date' }, { k: 'DokumenUrl', label: 'Tautan dokumen (Drive)', full: true }, { k: 'Catatan', label: 'Catatan', full: true }],
      pelabuhan: [{ k: 'Nama', label: 'Nama pelabuhan / dermaga', req: true }, { k: 'Lokasi', label: 'Lokasi' }, { k: 'Jenis', label: 'Jenis (pelabuhan rakyat, dermaga, dll.)' }],
      rute: [{ k: 'AsalID', label: 'Asal', type: 'select', req: true, options: ref.pelabuhan.map(o => [o.id, o.nama]) }, { k: 'TujuanID', label: 'Tujuan', type: 'select', req: true, options: ref.pelabuhan.map(o => [o.id, o.nama]) }, { k: 'DurasiMenit', label: 'Durasi (menit)', type: 'number' }],
      tarif: [{ k: 'RuteID', label: 'Rute', type: 'select', req: true, options: ref.rute.map(o => [o.id, o.nama]) }, { k: 'Kategori', label: 'Kategori', type: 'select', req: true, options: ref.kategori.map(o => [o, o]) }, { k: 'Harga', label: 'Harga (Rp)', type: 'number', req: true }, { k: 'BerlakuMulai', label: 'Berlaku mulai', type: 'date', req: true, value: App.hariIni() }]
    })[t].map(f => Object.assign({}, f, { value: row ? row[f.k] : f.value }));
    const cols = (t, ref) => ({
      operator: [{ h: 'Nama', f: r => '<b>' + esc(r.Nama) + '</b>' }, { h: 'Penanggung jawab', f: r => esc(r.PenanggungJawab) }, { h: 'Kontak', f: r => esc(r.Kontak) }],
      kapal: [{ h: 'Kapal', f: r => '<b>' + esc(r.Nama) + '</b><br><span class="mut sm">' + esc(r.NoRegistrasi) + '</span>' }, { h: 'Operator', f: r => esc(nm(ref.operator, r.OperatorID)) }, { h: 'Kap.', cls: 'num', f: r => r.Kapasitas }, { h: 'Dokumen s/d', f: r => r.DokumenBerlaku ? tgl(r.DokumenBerlaku) : '-' }],
      pelabuhan: [{ h: 'Nama', f: r => '<b>' + esc(r.Nama) + '</b>' }, { h: 'Lokasi', f: r => esc(r.Lokasi) }, { h: 'Jenis', f: r => esc(r.Jenis) }],
      rute: [{ h: 'Rute', f: r => '<b>' + esc(nm(ref.pelabuhan, r.AsalID)) + ' → ' + esc(nm(ref.pelabuhan, r.TujuanID)) + '</b>' }, { h: 'Durasi', cls: 'num', f: r => r.DurasiMenit ? r.DurasiMenit + ' mnt' : '-' }],
      tarif: [{ h: 'Rute', f: r => esc(nm(ref.rute, r.RuteID)) }, { h: 'Kategori', f: r => esc(r.Kategori) }, { h: 'Harga', cls: 'num', f: r => '<b>' + rp(r.Harga) + '</b>' }, { h: 'Berlaku', f: r => tgl(r.BerlakuMulai) }]
    })[t].concat([{ h: 'Status', f: r => App.badge(r.Status) }, { h: 'Aksi', f: r => '<div class="row" style="gap:6px;flex-wrap:nowrap">' + (t === 'kapal' && r.Status === 'Pending' ? '<button class="btn sm grn" data-ok="' + esc(r[idk(t)]) + '">Setujui</button><button class="btn sm ghost red" data-no="' + esc(r[idk(t)]) + '">Tolak</button>' : '') + '<button class="btn sm ghost" data-ed="' + esc(r[idk(t)]) + '">Ubah</button>' + (r.Status === 'Aktif' ? '<button class="btn sm ghost" data-tg="' + esc(r[idk(t)]) + '" data-s="Nonaktif">Nonaktifkan</button>' : r.Status === 'Nonaktif' || r.Status === 'Ditolak' ? '<button class="btn sm ghost" data-tg="' + esc(r[idk(t)]) + '" data-s="Aktif">Aktifkan</button>' : '') + '</div>' }]);
    const idk = t => ({ operator: 'OperatorID', kapal: 'KapalID', pelabuhan: 'PelabuhanID', rute: 'RuteID', tarif: 'TarifID' })[t];
    const muat = async () => {
      $$('#tb button', v).forEach(b => b.classList.toggle('on', b.dataset.t === tab)); $('#mb', v).innerHTML = App.skel(3, 56);
      try { const r = await App.api('master.list', { tab }); data = r.data; const ref = data.ref;
        $('#mb', v).innerHTML = '<div class="row between mb"><span class="mut sm">' + data.rows.length + ' data</span><button class="btn grn" id="add">＋ Tambah ' + MT[tab].toLowerCase() + '</button></div>' + App.table(cols(tab, ref), data.rows, { empty: 'Belum ada data. Tambahkan yang pertama.' });
      } catch (e) { $('#mb', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    const simpan = (row) => App.formModal({ title: (row ? 'Ubah ' : 'Tambah ') + MT[tab].toLowerCase(), wide: true, fields: fields(tab, row, data.ref), onSubmit: async x => { if (row) x[idk(tab)] = row[idk(tab)]; await App.api('master.save', { tab, row: x }); App.toast('Tersimpan.'); muat(); } });
    $('#tb', v).onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; muat(); } };
    v.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t || !data) return;
      if (t.id === 'add') simpan(null);
      if (t.dataset.ed) simpan(data.rows.filter(r => r[idk(tab)] === t.dataset.ed)[0]);
      if (t.dataset.tg) App.busy(t, async () => { await App.api('master.toggle', { tab, id: t.dataset.tg, status: t.dataset.s }); App.toast('Status diubah.'); muat(); });
      if (t.dataset.ok) { if (await App.confirm('Setujui kapal ini? Kapal aktif dan bisa dipakai pada jadwal.')) App.busy(t, async () => { await App.api('kapal.verify', { id: t.dataset.ok, setuju: true }); App.toast('Kapal disetujui.'); muat(); }); }
      if (t.dataset.no) App.formModal({ title: 'Tolak kapal', cls: 'red', submitLabel: 'Tolak', fields: [{ k: 'catatan', label: 'Alasan penolakan', type: 'textarea', req: true }], onSubmit: async x => { await App.api('kapal.verify', { id: t.dataset.no, setuju: false, catatan: x.catatan }); App.toast('Kapal ditolak.', 'warn'); muat(); } });
    });
    muat();
  });

  // ---------- PENGGUNA ----------
  const tampilSandi = (judul, user, sandi) => App.modal({ title: judul, persist: true, body: '<div class="alert warn">Catat sekarang. Kata sandi <b>hanya tampil sekali</b> dan tidak dapat dilihat lagi.</div><p class="mb">Pengguna: <b>' + esc(user) + '</b></p><div class="kode-big" style="font-size:1.6rem;letter-spacing:.08em">' + esc(sandi) + '</div>', buttons: [{ label: '📋 Salin', cls: 'ghost', onClick: () => App.copy(sandi) }, { label: 'Sudah dicatat', onClick: a => a.close() }] });
  App.page('pengguna', 'A', async function (v) {
    v.innerHTML = head('Pengguna', '<button class="btn grn" id="add">＋ Pengguna</button>') + '<div id="ul">' + App.skel(3, 56) + '</div>'; let data;
    const muat = async () => { try { data = (await App.api('user.list')).data; $('#ul', v).innerHTML = App.table([{ h: 'Nama', f: r => '<b>' + esc(r.Nama) + '</b><br><span class="mut sm">@' + esc(r.Username) + '</span>' }, { h: 'Peran', f: r => esc(App.roleNama(r.Peran)) }, { h: 'Terkait', f: r => esc(((data.pelabuhan.filter(p => p.id === r.PelabuhanID)[0] || {}).nama) || ((data.operator.filter(p => p.id === r.OperatorID)[0] || {}).nama) || '-') }, { h: 'Login terakhir', f: r => r.LoginTerakhir ? App.tglJam(r.LoginTerakhir) : '-' }, { h: 'Status', f: r => App.badge(r.Status) + (r.KunciSampai && r.KunciSampai > App.wita() ? ' <span class="badge err">Terkunci</span>' : '') }, { h: 'Aksi', f: r => '<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm ghost" data-ed="' + esc(r.UserID) + '">Ubah</button><button class="btn sm ghost" data-rs="' + esc(r.UserID) + '">Reset sandi</button></div>' }], data.rows); } catch (e) { $('#ul', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; } };
    const form = u => App.formModal({ title: u ? 'Ubah pengguna' : 'Pengguna baru', fields: [
      { k: 'Username', label: 'Nama pengguna', req: !u, value: u && u.Username, hint: u ? 'Tidak dapat diubah.' : 'Huruf kecil, angka, titik, strip (3–30).' }, { k: 'Nama', label: 'Nama lengkap', req: true, value: u && u.Nama },
      { k: 'Peran', label: 'Peran', type: 'select', value: u && u.Peran, options: [['loket', 'Petugas Loket'], ['pelabuhan', 'Petugas Pelabuhan'], ['operator', 'Operator Kapal']], hint: 'Admin Dishub memakai login admin situs, tidak dibuat di sini.' },
      { k: 'PelabuhanID', label: 'Pelabuhan (petugas pelabuhan)', type: 'select', value: u && u.PelabuhanID, options: [['', '— semua —']].concat(data.pelabuhan.map(p => [p.id, p.nama])) },
      { k: 'OperatorID', label: 'Operator (untuk Operator Kapal)', type: 'select', value: u && u.OperatorID, options: [['', '—']].concat(data.operator.map(p => [p.id, p.nama])) }].concat(u ? [{ k: 'Status', label: 'Status akun', type: 'select', value: u.Status, options: [['Aktif', 'Aktif'], ['Nonaktif', 'Nonaktif']] }] : []),
      onSubmit: async x => { if (u) { x.UserID = u.UserID; delete x.Username; } const r = await App.api('user.save', x); muat(); if (r.data.sandiAwal) tampilSandi('Pengguna dibuat', x.Username, r.data.sandiAwal); else App.toast('Pengguna diperbarui.'); } });
    $('#add', v).onclick = () => data && form(null);
    v.addEventListener('click', async e => { const b = e.target.closest('button'); if (!b || !data) return; if (b.dataset.ed) form(data.rows.filter(r => r.UserID === b.dataset.ed)[0]); if (b.dataset.rs) { const u = data.rows.filter(r => r.UserID === b.dataset.rs)[0]; if (await App.confirm('Reset kata sandi <b>' + esc(u.Nama) + '</b>? Semua sesi aktifnya akan keluar.', 'Reset sandi', 'red')) App.busy(b, async () => { const r = await App.api('user.reset', { UserID: u.UserID }); tampilSandi('Sandi baru', u.Username, r.data.sandiBaru); muat(); }); } });
    muat();
  });

  // ---------- PENGATURAN ----------
  App.page('pengaturan', 'A', async function (v) {
    v.innerHTML = head('Pengaturan Umum') + '<div id="sb">' + App.skel(3, 60) + '</div>';
    try {
      let rows = (await App.api('set.get')).data; const asli = {}; rows.forEach(r => { asli[r.Kunci] = r.Nilai; });
      const lbl = { NAMA_INSTANSI: 'Nama instansi', SLOGAN: 'Slogan', LOKET_ALAMAT: 'Alamat loket', LOKET_JAM: 'Jam layanan loket', WA_CS: 'WhatsApp layanan (tombol chat mengambang)', BATAS_BAYAR_JAM: 'Batas waktu bayar (jam)', MAKS_PESANAN_AKTIF_HP: 'Maks. pesanan menunggu per nomor HP', MAKS_PENUMPANG: 'Maks. penumpang per pesanan', KATEGORI_TARIF: 'Kategori tarif penumpang (pisahkan koma)', KATEGORI_R2: 'Kategori kendaraan roda dua / motor (pisahkan koma; tarifnya diisi di Master Data > Tarif)', MAKS_R2: 'Maks. motor per pesanan' };
      rows = rows.filter(r => r.Kunci !== 'APP_URL');
      $('#sb', v).innerHTML = '<form class="card" id="fs"><div class="grid g2">' + rows.map(r => '<div class="field"><label for="s_' + r.Kunci + '">' + esc(lbl[r.Kunci] || r.Kunci) + '</label><input class="in" id="s_' + r.Kunci + '" value="' + esc(r.Nilai) + '"><div class="hint">' + esc(r.Keterangan) + '</div></div>').join('') + '</div><div id="er" class="err-t"></div><button class="btn grn" type="submit">Simpan pengaturan</button></form>';
      $('#fs', v).onsubmit = e => { e.preventDefault(); const nilai = {}; rows.forEach(r => { const x = $('#s_' + r.Kunci, v).value.trim(); if (x !== String(asli[r.Kunci])) nilai[r.Kunci] = x; }); if (!Object.keys(nilai).length) return App.toast('Tidak ada perubahan.'); App.busy($('button', e.target), async () => { try { await App.api('set.save', { nilai }); Object.assign(asli, nilai); try { localStorage.removeItem('sdk_c_pubboot'); } catch (x) { } App.toast('Pengaturan disimpan.'); } catch (x) { $('#er', v).textContent = x.message; } }); };
    } catch (e) { $('#sb', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
  });

  // ---------- AUDIT ----------
  App.page('audit', 'A', async function (v) {
    v.innerHTML = head('Log Audit') + '<div class="card mb no-print"><div class="grid g3" style="align-items:end"><div class="field"><label>Cari</label><input class="in" id="q" placeholder="nama, aksi, objek…"></div><div class="field"><label>Awalan aksi</label><input class="in" id="a" placeholder="mis. loket., scan., jadwal."></div><div class="field"><button class="btn block" id="go">Cari</button></div></div></div><div id="al"></div>';
    const muat = async () => { $('#al', v).innerHTML = App.skel(4, 44); try { const r = await App.api('audit.list', { cari: $('#q', v).value, aksi: $('#a', v).value }); $('#al', v).innerHTML = App.table([{ h: 'Waktu', f: x => App.tglJam(x.Waktu) }, { h: 'Pengguna', f: x => esc(x.Nama) + '<br><span class="mut xs">' + esc(x.Peran) + '</span>' }, { h: 'Aksi', f: x => '<span class="badge ' + (/ganda|batal|reset/.test(x.Aksi) ? 'warn' : '') + '">' + esc(x.Aksi) + '</span>' }, { h: 'Objek', f: x => esc(x.Objek) }, { h: 'Detail', f: x => '<span class="sm">' + esc(x.Detail) + '</span>' }], r.data); } catch (e) { $('#al', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; } };
    $('#go', v).onclick = muat; $('#q', v).onkeydown = e => { if (e.key === 'Enter') muat(); }; muat();
  });

  // ---------- LAPORAN ----------
  App.page('laporan', 'A', async function (v) {
    const d2 = App.hariIni(), d1 = App.wita(new Date(Date.now() - 29 * 864e5)).slice(0, 10);
    v.innerHTML = head('Laporan', '<button class="btn ghost" id="pdf">🖨️ Cetak / PDF</button><button class="btn ghost" id="xls">⬇ Excel (CSV)</button>') + '<div class="card mb no-print"><div class="grid g4" style="align-items:end"><div class="field"><label>Dari</label><input class="in" type="date" id="d1" value="' + d1 + '"></div><div class="field"><label>Sampai</label><input class="in" type="date" id="d2" value="' + d2 + '"></div><div class="field"><button class="btn block" id="go">Tampilkan</button></div></div></div><div class="only-print"><h2>Laporan Penerimaan & Penumpang — ' + esc((App.boot && App.boot.set.NAMA_INSTANSI) || 'Dishub Balikpapan') + '</h2></div><div id="lp"></div>'; let D = null;
    const muat = async () => {
      $('#lp', v).innerHTML = App.skel(3, 90);
      try { D = (await App.api('report.run', { dari: $('#d1', v).value, sampai: $('#d2', v).value })).data; const t = D.total;
        $('#lp', v).innerHTML = '<p class="mut sm">Periode ' + tgl(D.dari) + ' – ' + tgl(D.sampai) + ' · sumber: buku kas (Pembayaran)</p><div class="grid g4 mb">' + [['Penumpang (neto)', t.penumpang], ['Motor / R2 (neto)', t.kendaraan || 0], ['Penerimaan kotor', t.pendapatanKotor, 'rp'], ['Pengembalian', t.pengembalian, 'rp'], ['Penerimaan bersih', t.pendapatanBersih, 'rp']].map(x => '<div class="card fx kpi"><div class="v" data-count="' + x[1] + '"' + (x[2] ? ' data-fmt="rp"' : '') + ' style="font-size:1.5rem">0</div><div class="l">' + x[0] + '</div></div>').join('') + '</div>' +
          '<div class="grid g2 mb"><div class="card"><h3>Penumpang per hari</h3>' + App.chartLine(D.harian.map(h => ({ t: h.tgl, n: h.penumpang })), { label: 'Penumpang per hari' }) + '</div><div class="card"><h3>Penumpang per rute</h3>' + App.chartBars(D.perRute.map(r => ({ nama: r.nama, n: r.penumpang }))) + '</div></div>' +
          '<h3>Rekap harian</h3>' + App.table([{ h: 'Tanggal', f: x => tgl(x.tgl) }, { h: 'Pesanan', cls: 'num', f: x => x.pesanan }, { h: 'Penumpang', cls: 'num', f: x => x.penumpang }, { h: 'Motor', cls: 'num', f: x => x.kendaraan || 0 }, { h: 'Penerimaan', cls: 'num', f: x => rp(x.pendapatan) }], D.harian, { empty: 'Tidak ada transaksi pada periode ini.' }) +
          '<div class="grid g2 mt"><div><h3>Per rute</h3>' + App.table([{ h: 'Rute', f: x => esc(x.nama) }, { h: 'Penumpang', cls: 'num', f: x => x.penumpang }, { h: 'Motor', cls: 'num', f: x => x.kendaraan || 0 }, { h: 'Penerimaan', cls: 'num', f: x => rp(x.pendapatan) }], D.perRute) + '</div><div><h3>Per kapal</h3>' + App.table([{ h: 'Kapal', f: x => esc(x.nama) }, { h: 'Penumpang', cls: 'num', f: x => x.penumpang }, { h: 'Motor', cls: 'num', f: x => x.kendaraan || 0 }, { h: 'Penerimaan', cls: 'num', f: x => rp(x.pendapatan) }], D.perKapal) + '</div></div>'; App.fx(v);
      } catch (e) { $('#lp', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    $('#go', v).onclick = muat; $('#pdf', v).onclick = () => App.printEl(v);
    $('#xls', v).onclick = () => { if (!D) return; const r = [['Laporan SIDIKAPET', D.dari + ' s/d ' + D.sampai], [], ['Rekap harian'], ['Tanggal', 'Pesanan', 'Penumpang', 'Motor', 'Penerimaan']].concat(D.harian.map(h => [h.tgl, h.pesanan, h.penumpang, h.kendaraan || 0, h.pendapatan]), [[], ['Per rute'], ['Rute', 'Penumpang', 'Motor', 'Penerimaan']], D.perRute.map(x => [x.nama, x.penumpang, x.kendaraan || 0, x.pendapatan]), [[], ['Per kapal'], ['Kapal', 'Penumpang', 'Motor', 'Penerimaan']], D.perKapal.map(x => [x.nama, x.penumpang, x.kendaraan || 0, x.pendapatan]), [[], ['Total penumpang', D.total.penumpang], ['Total motor', D.total.kendaraan || 0], ['Penerimaan kotor', D.total.pendapatanKotor], ['Pengembalian', D.total.pengembalian], ['Penerimaan bersih', D.total.pendapatanBersih]]); App.csv('laporan-sidikapet-' + D.dari + '_' + D.sampai + '.csv', r); };
    muat();
  });

  // ---------- AKUN ----------
  App.page('akun', 'ALPO', async function (v, ctx) {
    v.innerHTML = head('Akun Saya') + '<div class="card" style="max-width:520px"><p><b>' + esc(ctx.me.nama) + '</b><br><span class="mut">' + esc(App.roleNama(ctx.me.role)) + '</span></p><h3>Ganti kata sandi</h3><form id="fg"><div class="field"><label>Kata sandi lama</label><input class="in" type="password" id="l" autocomplete="current-password" required></div><div class="field"><label>Kata sandi baru</label><input class="in" type="password" id="b" autocomplete="new-password" required><div class="hint">Minimal 8 karakter, memuat huruf dan angka.</div></div><div class="field"><label>Ulangi kata sandi baru</label><input class="in" type="password" id="u" autocomplete="new-password" required></div><div class="err-t" id="er"></div><button class="btn grn" type="submit">Ganti kata sandi</button></form></div>';
    $('#fg', v).onsubmit = e => { e.preventDefault(); if ($('#b', v).value !== $('#u', v).value) { $('#er', v).textContent = 'Pengulangan kata sandi tidak sama.'; return; } App.busy($('button', e.target), async () => { try { await App.api('auth.ganti', { lama: $('#l', v).value, baru: $('#b', v).value }); App.sesi.clear(); App.toast('Kata sandi diganti. Silakan masuk lagi.'); App.nav('/masuk'); } catch (x) { $('#er', v).textContent = x.message; } }); };
  });
})();
;
/* ===== ops.js ===== */
/* SIDIKAPET — operasional: loket (bayar tunai), tutup kas, validasi pelabuhan (QR, offline), manifest, kapal operator. */
(function () {
  'use strict';
  const App = window.SKA, { esc, $, $$, rp, tgl, jam } = App, Off = window.SKOff;
  const head = (judul, extra) => '<div class="pagehead"><h2>' + judul + '</h2><div class="row no-print">' + (extra || '') + '</div></div>';

  // =============== LOKET ===============
  function cetak(p, kui) {
    const J = p.jadwal, s = (App.boot && App.boot.set) || {};
    App.printHtml('<div style="font-family:Inter,sans-serif;max-width:720px;margin:auto"><h2 style="margin:0">' + esc(s.NAMA_INSTANSI || 'Dinas Perhubungan Kota Balikpapan') + '</h2><div>' + esc(s.LOKET_ALAMAT || '') + '</div><hr><h3>KUITANSI PEMBAYARAN TUNAI</h3>' +
      (kui ? '<table style="width:100%"><tr><td>No. kuitansi</td><td><b>' + esc(kui.No) + '</b></td><td>Waktu</td><td>' + App.tglJam(kui.Waktu) + '</td></tr><tr><td>Kode booking</td><td><b>' + esc(p.Kode) + '</b></td><td>Petugas</td><td>' + esc(kui.Petugas) + '</td></tr></table>' : '') +
      '<p><b>' + esc(J.Asal) + ' → ' + esc(J.Tujuan) + '</b> · ' + App.tglJam(J.Berangkat) + ' · ' + esc(J.Kapal) + '</p><table style="width:100%;border-collapse:collapse">' + p.penumpang.map((x, i) => '<tr><td style="border-bottom:1px solid #ccc">' + (i + 1) + '. ' + esc(x.Nama) + ' (' + esc(x.Kategori) + (x.R2 ? ' · ' + esc(x.NoPol || '') : '') + ')</td><td style="text-align:right;border-bottom:1px solid #ccc">' + rp(x.Harga) + '</td></tr>').join('') + '<tr><td><b>TOTAL</b></td><td style="text-align:right"><b>' + rp(p.Total) + '</b></td></tr>' + (kui ? '<tr><td>Diterima</td><td style="text-align:right">' + rp(kui.Diterima) + '</td></tr><tr><td>Kembalian</td><td style="text-align:right">' + rp(kui.Kembalian) + '</td></tr>' : '') + '</table><hr><h3>TIKET</h3>' + p.penumpang.map(x => App.tiketCard(x, J, p.Kode)).join('') + '</div>');
  }
  function pesananCard(p) {
    const J = p.jadwal || {}, ac = [];
    if (p.Status === 'Menunggu') ac.push('<button class="btn btn-glow" data-bayar="' + esc(p.Kode) + '">💵 Terima Tunai</button>');
    if (p.Status === 'Dibayar') ac.push('<button class="btn" data-cetak="' + esc(p.Kode) + '">🖨️ Cetak tiket</button>');
    if (['Menunggu', 'Dibayar', 'Refund'].indexOf(p.Status) >= 0) ac.push('<button class="btn ghost red" data-batal="' + esc(p.Kode) + '">' + (p.Status === 'Refund' ? 'Proses pengembalian' : 'Batalkan') + '</button>');
    return '<div class="card fx rv" data-tilt="0"><div class="row between"><div><span class="mono b" style="font-size:1.3rem;color:var(--pri)">' + esc(p.Kode) + '</span> ' + App.badge(p.Status) + '</div><div class="r"><div class="xs mut">Total</div><div class="b" style="font-size:1.25rem">' + rp(p.Total) + '</div></div></div>' +
      '<div class="sm mt">👤 <b>' + esc(p.NamaPemesan) + '</b> · ' + esc(p.HP) + ' · ' + p.JumlahPenumpang + ' penumpang' + (p.JumlahR2 ? ' + ' + p.JumlahR2 + ' motor' : '') + '</div><div class="sm">⛴️ ' + esc(J.Asal) + ' → ' + esc(J.Tujuan) + ' · ' + App.tglJam(J.Berangkat) + ' · ' + esc(J.Kapal) + '</div>' +
      (p.Status === 'Menunggu' ? '<div class="sm">⏳ Batas bayar ' + App.tglJam(p.BatasBayar) + '</div>' : '') + (p.Catatan ? '<div class="sm mut">Catatan: ' + esc(p.Catatan) + '</div>' : '') +
      '<div class="mt">' + App.table([{ h: 'Penumpang / pengendara', f: x => (x.R2 ? '🏍️ ' : '') + esc(x.Nama) }, { h: 'Kategori', f: x => esc(x.Kategori) + (x.R2 ? '<div class="plat">' + esc(x.NoPol || '-') + '</div>' : '') }, { h: 'NIK', f: x => esc(x.NIK || '-') }, { h: 'Tarif', cls: 'num', f: x => rp(x.Harga) }, { h: 'Tiket', f: x => x.TiketKode ? '<span class="mono">' + esc(x.TiketKode) + '</span> ' + App.badge(x.TiketStatus) : '-' }], p.penumpang) + '</div><div class="row mt">' + ac.join('') + '</div></div>';
  }
  App.page('loket', 'AL', async function (v) {
    v.innerHTML = head('Loket Tiket') + '<form class="card mb" id="fq"><div class="row" style="flex-wrap:nowrap"><input class="in grow mono" id="q" placeholder="Kode booking (SDK-XXXXXX) atau nomor HP" autocomplete="off" autocapitalize="characters" style="font-size:1.1rem"><button class="btn lg" type="submit">🔎 Cari</button></div></form><div id="hs" class="grid">' + '</div><h3 class="mt2">Transaksi saya hari ini</h3><div id="rw">' + App.skel(2, 50) + '</div>';
    let list = [];
    const riwayat = async () => { try { const r = await App.api('loket.riwayat'); $('#rw', v).innerHTML = App.table([{ h: 'Waktu', f: x => jam(x.Waktu) }, { h: 'Kuitansi', f: x => '<span class="mono">' + esc(x.NoKuitansi) + '</span>' }, { h: 'Kode', f: x => esc(x.Kode) }, { h: 'Jenis', f: x => x.Metode === 'Pengembalian' ? '<span class="badge warn">Pengembalian</span>' : '<span class="badge ok">Tunai</span>' }, { h: 'Jumlah', cls: 'num', f: x => '<b>' + rp(x.Jumlah) + '</b>' }, { h: 'Petugas', f: x => esc(x.Petugas) }], r.data, { empty: 'Belum ada transaksi hari ini.' }); } catch (e) { $('#rw', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; } };
    const cari = async (q) => { if (!q) return; $('#hs', v).innerHTML = App.skel(1, 180); try { const r = await App.api('loket.cari', { q }); list = r.data; $('#hs', v).innerHTML = list.length ? list.map(pesananCard).join('') : '<div class="card empty"><div class="ic">🔍</div>Pesanan tidak ditemukan.</div>'; App.fx(v); } catch (e) { $('#hs', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; } };
    $('#fq', v).onsubmit = e => { e.preventDefault(); cari($('#q', v).value.trim()); }; $('#q', v).focus();
    const bayar = p => {
      const m = App.modal({ title: 'Terima pembayaran tunai', body: '<div class="c"><div class="mono b" style="color:var(--pri);font-size:1.2rem">' + esc(p.Kode) + '</div><div class="mut sm">' + esc(p.NamaPemesan) + ' · ' + p.JumlahPenumpang + ' penumpang' + (p.JumlahR2 ? ' + ' + p.JumlahR2 + ' motor' : '') + '</div><div class="mt"><div class="mut sm">TOTAL YANG HARUS DIBAYAR</div><div style="font-size:2.4rem;font-weight:900;color:var(--grn)">' + rp(p.Total) + '</div></div></div><div class="field mt"><label for="dt">Uang diterima (Rp)</label><input class="in" id="dt" inputmode="numeric" style="font-size:1.5rem;font-weight:800" autocomplete="off"></div><div class="row mb" id="qk"></div><div class="alert" id="kb">Kembalian: <b>Rp 0</b></div><div class="err-t" id="er"></div>',
        buttons: [{ label: 'Batal', cls: 'ghost', onClick: a => a.close() }, { label: '✔ Konfirmasi & terbitkan tiket', cls: 'btn-glow', onClick: async (a, b) => { const n = Number($('#dt', a.el).value.replace(/\D/g, '')); if (n < p.Total) { $('#er', a.el).textContent = 'Uang diterima kurang dari total.'; return; } await App.busy(b, async () => { try { const r = await App.api('loket.konfirmasi', { kode: p.Kode, diterima: n, perangkat: 'loket' }); a.close(); selesai(r.data); } catch (x) { $('#er', a.el).textContent = x.message; } }); } }] });
      const dt = $('#dt', m.el), up = () => { const n = Number(dt.value.replace(/\D/g, '')) || 0; dt.value = n ? n.toLocaleString('id-ID') : ''; const k = n - p.Total; $('#kb', m.el).className = 'alert ' + (n && k < 0 ? 'err' : n ? 'ok' : ''); $('#kb', m.el).innerHTML = n && k < 0 ? 'Kurang: <b>' + rp(-k) + '</b>' : 'Kembalian: <b>' + rp(Math.max(0, k)) + '</b>'; };
      dt.addEventListener('input', up); const pecahan = [p.Total, Math.ceil(p.Total / 50000) * 50000, Math.ceil(p.Total / 100000) * 100000].filter((x, i, a) => a.indexOf(x) === i);
      $('#qk', m.el).innerHTML = pecahan.map(x => '<button type="button" class="btn sm ghost" data-n="' + x + '">' + (x === p.Total ? 'Uang pas' : rp(x)) + '</button>').join(''); $('#qk', m.el).onclick = e => { const b = e.target.closest('button'); if (b) { dt.value = b.dataset.n; up(); } };
    };
    const selesai = d => { riwayat(); const p = d.pesanan; $('#hs', v).innerHTML = pesananCard(p); App.fx(v);
      App.modal({ title: '✅ Pembayaran berhasil', wide: true, body: '<div class="alert ok"><b>Kuitansi ' + esc(d.kuitansi.No) + '</b> · Kembalian <b>' + rp(d.kuitansi.Kembalian) + '</b></div><div class="grid g2">' + p.penumpang.map(x => App.tiketCard(x, p.jadwal, p.Kode)).join('') + '</div>', buttons: [{ label: 'Tutup', cls: 'ghost', onClick: a => a.close() }, { label: '🖨️ Cetak kuitansi & tiket', cls: 'btn-glow', onClick: () => cetak(p, d.kuitansi) }] }); };
    v.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; const k = b.dataset.bayar || b.dataset.cetak || b.dataset.batal, p = list.filter(x => x.Kode === k)[0]; if (!p) return;
      if (b.dataset.bayar) bayar(p); if (b.dataset.cetak) cetak(p, null);
      if (b.dataset.batal) App.formModal({ title: 'Batalkan ' + p.Kode, cls: 'red', submitLabel: 'Batalkan pesanan', fields: [{ k: 'alasan', label: 'Alasan pembatalan', type: 'textarea', req: true }].concat(p.Status !== 'Menunggu' ? [{ k: 'pengembalian', label: 'Nominal dikembalikan (Rp)', type: 'number', value: p.Total, hint: 'Pesanan ini sudah dibayar. Total ' + rp(p.Total) + '. Isi 0 bila tidak ada pengembalian (tercatat).' }] : []), onSubmit: async x => { await App.api('loket.batal', { kode: p.Kode, alasan: x.alasan, pengembalian: Number(x.pengembalian) || 0 }); App.toast('Pesanan dibatalkan.', 'warn'); cari(p.Kode); riwayat(); } });
    });
    riwayat();
  });

  // =============== TUTUP KAS ===============
  App.page('kas', 'AL', async function (v) {
    v.innerHTML = head('Tutup Kas') + '<div id="ks">' + App.skel(2, 100) + '</div>';
    const muat = async () => {
      try { const [r, h] = await Promise.all([App.api('kas.ringkas'), App.api('kas.riwayat')]), d = r.data;
        $('#ks', v).innerHTML = '<div class="grid g2 mb"><div class="card fx kpi" data-tilt="0"><div class="l">Transaksi belum ditutup</div><div class="v" data-count="' + d.jumlahTransaksi + '">0</div></div><div class="card fx kpi" data-tilt="0"><div class="l">Total menurut sistem</div><div class="v" data-count="' + d.totalSistem + '" data-fmt="rp" style="color:var(--grn)">0</div></div></div>' +
          (d.jumlahTransaksi ? '<form class="card mb" id="ft"><h3>Hitung uang fisik di laci</h3><div class="grid g2"><div class="field"><label>Total uang fisik (Rp)</label><input class="in" id="fz" inputmode="numeric" style="font-size:1.4rem;font-weight:800" autocomplete="off"></div><div class="field"><label>Catatan (opsional)</label><input class="in" id="ct" maxlength="200"></div></div><div class="alert" id="sl">Selisih: —</div><div class="err-t" id="er"></div><button class="btn btn-glow" type="submit">🔒 Tutup kas sekarang</button></form>' : '<div class="alert ok">Semua transaksi sudah ditutup. Tidak ada kas yang menunggu.</div>') +
          '<h3>Transaksi belum ditutup</h3>' + App.table([{ h: 'Waktu', f: x => App.tglJam(x.Waktu) }, { h: 'Kuitansi', f: x => '<span class="mono">' + esc(x.NoKuitansi) + '</span>' }, { h: 'Kode', f: x => esc(x.Kode) }, { h: 'Jumlah', cls: 'num', f: x => rp(x.Jumlah) }], d.items, { empty: 'Tidak ada.' }) +
          '<h3 class="mt2">Riwayat tutup kas</h3>' + App.table([{ h: 'Tanggal', f: x => App.tglJam(x.Waktu) }, { h: 'Petugas', f: x => esc(x.Petugas) }, { h: 'Transaksi', cls: 'num', f: x => x.JumlahTransaksi }, { h: 'Sistem', cls: 'num', f: x => rp(x.TotalSistem) }, { h: 'Fisik', cls: 'num', f: x => rp(x.TotalFisik) }, { h: 'Selisih', cls: 'num', f: x => '<b style="color:' + (x.Selisih ? 'var(--err)' : 'var(--grn)') + '">' + rp(x.Selisih) + '</b>' }, { h: 'Catatan', f: x => esc(x.Catatan) }], h.data, { empty: 'Belum ada riwayat.' });
        App.fx(v);
        const fz = $('#fz', v); if (fz) { const up = () => { const n = Number(fz.value.replace(/\D/g, '')); fz.value = fz.value ? n.toLocaleString('id-ID') : ''; const s = n - d.totalSistem; const el = $('#sl', v); el.className = 'alert ' + (fz.value ? (s ? 'warn' : 'ok') : ''); el.innerHTML = fz.value ? 'Selisih: <b>' + rp(s) + '</b> ' + (s ? '(isi catatan penyebab)' : '— cocok') : 'Selisih: —'; }; fz.addEventListener('input', up);
          $('#ft', v).onsubmit = async e => { e.preventDefault(); if (!fz.value) { $('#er', v).textContent = 'Isi total uang fisik.'; return; } const n = Number(fz.value.replace(/\D/g, '')); if (!await App.confirm('Tutup kas dengan total fisik <b>' + rp(n) + '</b> (sistem ' + rp(d.totalSistem) + ')? Tindakan ini tercatat di log audit.', 'Tutup kas')) return; await App.busy($('button[type=submit]', v), async () => { try { const r = await App.api('kas.tutup', { fisik: n, catatan: $('#ct', v).value }); App.toast(r.message, r.data.selisih ? 'warn' : ''); muat(); } catch (x) { $('#er', v).textContent = x.message; } }); }; }
      } catch (e) { $('#ks', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    muat();
  });

  // =============== VALIDASI PELABUHAN (QR + offline) ===============
  const dev = (() => { let d = localStorage.getItem('sdk_dev'); if (!d) { d = 'HP-' + Math.random().toString(36).slice(2, 7).toUpperCase(); localStorage.setItem('sdk_dev', d); } return d; })();
  function loadScript(src) { return new Promise((res, rej) => { if (window.Html5Qrcode) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Pemindai kamera belum terunduh. Buka halaman ini sekali saat online.')); document.head.appendChild(s); }); }
  function bunyi(ok) { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = ok ? 880 : 220; g.gain.value = .15; o.start(); o.stop(c.currentTime + (ok ? .12 : .35)); if (navigator.vibrate) navigator.vibrate(ok ? 60 : [120, 60, 120]); } catch (e) { } }
  const KET = { OK: ['✔ VALID', 'Silakan naik'], GANDA: ['⚠ SUDAH DIPAKAI', ''], BATAL: ['✖ TIKET BATAL', ''], TIDAK: ['✖ TIDAK DITEMUKAN', 'Kode tidak dikenal'], TIDAK_LOKAL: ['✖ TIDAK ADA DI DAFTAR LOKAL', 'Tiket mungkin terbit setelah daftar diunduh. Sinkron ulang saat online atau cari manual kode booking.'], SALAH_JADWAL: ['⚠ JADWAL BERBEDA', 'Tiket untuk jadwal lain'] };

  App.page('scan', 'AP', async function (v) {
    v.innerHTML = head('Validasi Tiket', '<span class="net on" id="net"><i></i><span>ONLINE</span></span>') +
      '<div class="card mb no-print"><div class="grid g2" style="align-items:end"><div class="field"><label for="js">Jadwal</label><select class="in" id="js"><option value="">Memuat…</option></select></div><div class="field row"><button class="btn" id="dl">⬇ Unduh daftar tiket</button><button class="btn ghost" id="st">Ubah status kapal</button></div></div><div class="row between sm mt"><span id="inf" class="mut">Belum ada daftar lokal.</span><span>Antrean sinkron: <b id="qc">0</b> <button class="btn sm ghost" id="sy">Sinkron</button></span></div></div>' +
      '<div class="card mb"><div id="reader"></div><div class="row mt" style="justify-content:center"><button class="btn grn" id="cam">📷 Mulai kamera</button><button class="btn ghost" id="stop" hidden>Hentikan</button></div><form class="row mt" id="fm" style="flex-wrap:nowrap"><input class="in grow mono" id="mk" placeholder="…atau ketik kode tiket" autocapitalize="characters" autocomplete="off"><button class="btn" type="submit">Validasi</button></form></div>' +
      '<div id="hsl"></div><div class="grid g3 mt"><div class="card kpi"><div class="v" id="cn">0</div><div class="l">Sudah naik (lokal)</div></div><div class="card kpi"><div class="v" id="ct2">0</div><div class="l">Tiket sah di daftar</div></div><div class="card kpi"><div class="v" id="cg" style="color:var(--warn)">0</div><div class="l">Konflik sinkron</div></div></div><div id="kf"></div>';
    let rec = null, jadwal = [], scanner = null, last = { k: '', t: 0 }, konflik = [];
    const jid = () => $('#js', v).value;
    const net = () => { const n = $('#net', v); n.className = 'net ' + (App.online ? 'on' : 'off'); n.lastChild.textContent = App.online ? 'ONLINE' : 'OFFLINE'; $('#dl', v).disabled = !App.online; };
    const onNet = () => { net(); if (App.online) sync(); }; document.addEventListener('sdk-net', onNet); App.cleanups.push(() => document.removeEventListener('sdk-net', onNet));
    const hit = () => { if (!rec) { $('#cn', v).textContent = 0; $('#ct2', v).textContent = 0; return; } $('#ct2', v).textContent = rec.tiket.length; $('#cn', v).textContent = rec.tiket.filter(t => t.s).length; };
    const q = async () => { try { $('#qc', v).textContent = await Off.countOut(); } catch (e) { } };
    const info = () => { $('#inf', v).innerHTML = rec ? 'Daftar lokal: <b>' + rec.tiket.length + ' tiket</b> · diunduh ' + new Date(rec.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '<b style="color:var(--err)">Belum ada daftar lokal untuk jadwal ini.</b> Unduh dulu saat ada sinyal.'; hit(); };
    const pilih = async () => { rec = jid() ? (await Off.getDaftar(jid()).catch(() => null)) || null : null; info(); };
    const isiJadwal = (rows, sumber) => { jadwal = rows; $('#js', v).innerHTML = rows.length ? rows.map(j => '<option value="' + esc(j.JadwalID) + '">' + jam(j.Berangkat) + ' · ' + esc(j.Asal) + ' → ' + esc(j.Tujuan) + ' · ' + esc(j.Kapal) + ' (' + tgl(j.Berangkat) + ')</option>').join('') : '<option value="">Tidak ada jadwal</option>'; if (sumber === 'lokal') App.toast('Offline: memakai jadwal yang pernah diunduh.', 'warn'); pilih(); };
    (async () => { try { const r = await App.api('port.jadwal'); isiJadwal(r.data); } catch (e) { const all = await Off.allDaftar().catch(() => []); isiJadwal(all.map(a => a.jadwal), 'lokal'); } })();
    $('#js', v).onchange = pilih;
    const unduh = async () => { if (!jid()) return App.toast('Pilih jadwal.', 'warn'); await sync(); const r = await App.api('port.daftar', { jadwalId: jid() }); await Off.saveDaftar(jid(), r.data); await pilih(); App.toast('Daftar tiket tersimpan di perangkat (' + r.data.tiket.length + ' tiket). Siap dipakai offline.'); };
    $('#dl', v).onclick = e => App.busy(e.currentTarget, unduh);
    const tampil = (r, nama, kode, pl) => { const k = KET[r] || [r, '']; bunyi(r === 'OK'); $('#hsl', v).innerHTML = '<div class="hasil ' + r + '"><div class="big">' + k[0] + '</div>' + (nama ? '<div style="font-size:1.4rem;font-weight:700">' + esc(nama) + '</div>' : '') + (pl ? '<div class="plat plat-big">🏍️ ' + esc(pl) + '</div><div class="sm" style="opacity:.95">Cocokkan nomor polisi dengan motor</div>' : '') + '<div class="mono" style="opacity:.9">' + esc(kode) + '</div>' + (k[1] ? '<div style="opacity:.95;margin-top:4px">' + k[1] + '</div>' : '') + '</div>'; };
    let flushT = null; const flushSoon = () => { clearTimeout(flushT); flushT = setTimeout(sync, 1500); };
    async function sync() {
      if (!App.online) return; let out; try { out = await Off.allOut(); } catch (e) { return; } if (!out.length) return q();
      for (let i = 0; i < out.length; i += 100) { const part = out.slice(i, i + 100); try { const r = await App.api('port.sync', { events: part.map(x => ({ k: x.k, j: x.j, d: x.d, ms: x.ms })) }); await Off.delOut(part.map(x => x.n)); r.data.hasil.forEach((h, idx) => { if (h.r !== 'OK') { konflik.unshift({ k: h.k, r: h.r, n: (h.n || '') + (h.pl ? ' [' + h.pl + ']' : ''), at: part[idx].ms, oleh: h.oleh }); } }); } catch (e) { break; } }
      $('#cg', v).textContent = konflik.length; $('#kf', v).innerHTML = konflik.length ? '<div class="alert warn mt"><b>Konflik hasil sinkron</b> (tiket sudah dipakai di perangkat lain / bermasalah):<ul style="margin:6px 0 0 18px">' + konflik.slice(0, 10).map(x => '<li><span class="mono">' + esc(x.k) + '</span> ' + esc(x.n) + ' — ' + esc(x.r) + (x.oleh ? ' (oleh ' + esc(x.oleh) + ')' : '') + '</li>').join('') + '</ul></div>' : ''; if (konflik.length) App.toast('Ada tiket ganda terdeteksi saat sinkron.', 'warn'); q();
    }
    $('#sy', v).onclick = e => App.busy(e.currentTarget, sync); const iv = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 15000); App.cleanups.push(() => clearInterval(iv));
    async function proses(raw) {
      const kode = String(raw || '').trim().toUpperCase().replace(/^.*[/?=#]/, ''); if (!kode) return; if (last.k === kode && Date.now() - last.t < 2500) return; last = { k: kode, t: Date.now() };
      if (!jid()) return App.toast('Pilih jadwal terlebih dahulu.', 'warn');
      const t = rec && rec.tiket.filter(x => x.k === kode)[0];
      if (!t) {
        if (App.online) { try { const r = await App.api('port.validasi', { kode, jadwalId: jid(), perangkat: dev }); tampil(r.data.r, r.data.n, kode, r.data.pl); if (r.data.r === 'OK' && rec) { rec.tiket.push({ k: kode, n: r.data.n, c: r.data.c || '', pl: r.data.pl || '', s: 1, b: '' }); await Off.putDaftar(rec); info(); } return; } catch (e) { return App.err(e); } }
        return tampil('TIDAK_LOKAL', '', kode);
      }
      if (t.s || (rec.lokal && rec.lokal[kode])) return tampil('GANDA', t.n, kode, t.pl);
      t.s = 1; rec.lokal = rec.lokal || {}; rec.lokal[kode] = Date.now(); await Off.putDaftar(rec); await Off.addOut({ k: kode, j: jid(), d: dev, ms: Date.now() }); tampil('OK', t.n + (t.c ? ' · ' + t.c : ''), kode, t.pl); hit(); q(); flushSoon();
    }
    $('#fm', v).onsubmit = e => { e.preventDefault(); const i = $('#mk', v); proses(i.value); i.value = ''; i.focus(); };
    $('#cam', v).onclick = async e => {
      await App.busy(e.currentTarget, async () => { await loadScript('js/vendor/html5-qrcode.min.js'); scanner = new Html5Qrcode('reader'); await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, txt => proses(txt), () => { }); $('#cam', v).hidden = true; $('#stop', v).hidden = false; });
      if (scanner) { $('#cam', v).hidden = true; $('#stop', v).hidden = false; }
    };
    const stop = async () => { try { if (scanner) { await scanner.stop(); scanner.clear(); } } catch (e) { } scanner = null; if ($('#cam', v)) { $('#cam', v).hidden = false; $('#stop', v).hidden = true; } };
    $('#stop', v).onclick = stop; App.cleanups.push(() => { try { if (scanner) scanner.stop(); } catch (e) { } });
    $('#st', v).onclick = () => { const j = jadwal.filter(x => x.JadwalID === jid())[0]; if (!j) return; const nxt = { Terjadwal: 'Berangkat', Berangkat: 'Tiba' }[j.Status]; if (!nxt) return App.toast('Status kapal sudah ' + j.Status + '.'); App.confirm('Ubah status kapal <b>' + esc(j.Kapal) + '</b> dari ' + j.Status + ' menjadi <b>' + nxt + '</b>?', 'Ubah ke ' + nxt).then(ok => { if (ok) App.api('port.status', { jadwalId: j.JadwalID, status: nxt }).then(() => { j.Status = nxt; App.toast('Status kapal: ' + nxt); }).catch(App.err); }); };
    net(); q(); $('#mk', v).focus();
  });

  // =============== MANIFEST ===============
  App.page('manifest', 'APO', async function (v, ctx) {
    const peran = ctx.me.role; v.innerHTML = head('Manifest Penumpang', '<button class="btn ghost" id="pr">🖨️ Cetak / PDF</button><button class="btn ghost" id="xl">⬇ Excel (CSV)</button>') + '<div class="card mb no-print"><div class="field" style="margin:0"><label for="mj">Pilih perjalanan</label><select class="in" id="mj"><option>Memuat…</option></select></div></div><div id="mf"></div>'; let D = null;
    const lst = async () => peran === 'pelabuhan' ? (await App.api('port.jadwal')).data : (await App.api('op.manifest')).data;
    const buka = async id => {
      if (!id) return; $('#mf', v).innerHTML = App.skel(2, 80);
      try { D = (await App.api(peran === 'pelabuhan' ? 'port.manifest' : 'op.manifest', { jadwalId: id })).data; const J = D.jadwal, naik = D.rows.filter(r => r.Naik).length;
        $('#mf', v).innerHTML = '<div class="card mb"><h3 style="margin:0">' + esc(J.Asal) + ' → ' + esc(J.Tujuan) + '</h3><div class="mut">' + App.tglJam(J.Berangkat) + ' · ' + esc(J.Kapal) + ' · Status ' + esc(J.Status) + '</div><div class="row mt"><span class="badge ok">Tiket sah: ' + D.rows.length + '</span><span class="badge">Sudah naik: ' + naik + '</span><span class="badge gray">Kuota: ' + J.Kuota + '</span>' + (J.KuotaR2 ? '<span class="badge warn">🏍️ Motor: ' + D.rows.filter(r => r.R2).length + ' / ' + J.KuotaR2 + '</span>' : '') + '</div></div>' +
          App.table([{ h: '#', f: r => r.No }, { h: 'Nama', f: r => '<b>' + esc(r.Nama) + '</b>' }, { h: 'Kategori', f: r => (r.R2 ? '🏍️ ' : '') + esc(r.Kategori) }, { h: 'No. polisi', f: r => r.R2 ? '<span class="plat">' + esc(r.NoPol || '-') + '</span>' : '' }, { h: 'HP', f: r => esc(r.HP) }, { h: 'NIK', f: r => esc(r.NIK || '-') }, { h: 'Alamat', f: r => esc(r.Alamat || '-') }, { h: 'Kode tiket', f: r => '<span class="mono">' + esc(r.TiketKode) + '</span>' }, { h: 'Naik', f: r => r.Naik ? '✔' : '' }], D.rows, { empty: 'Belum ada tiket terbit untuk perjalanan ini.' });
      } catch (e) { $('#mf', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    try { const rows = await lst(); $('#mj', v).innerHTML = rows.length ? rows.map(j => '<option value="' + esc(j.JadwalID) + '">' + tgl(j.Berangkat) + ' ' + jam(j.Berangkat) + ' · ' + esc(j.Asal) + ' → ' + esc(j.Tujuan) + ' · ' + esc(j.Kapal) + '</option>').join('') : '<option value="">Tidak ada perjalanan</option>'; if (ctx.query.j) $('#mj', v).value = ctx.query.j; buka($('#mj', v).value); } catch (e) { $('#mf', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    $('#mj', v).onchange = e => buka(e.target.value); $('#pr', v).onclick = () => App.printEl(v);
    $('#xl', v).onclick = () => { if (!D) return; App.csv('manifest-' + D.jadwal.JadwalID + '.csv', [['No', 'Nama', 'Kategori', 'No. polisi', 'HP', 'NIK (tersamar)', 'Alamat', 'Kode booking', 'Kode tiket', 'Naik']].concat(D.rows.map(r => [r.No, r.Nama, r.Kategori, r.NoPol || '', r.HP, r.NIK, r.Alamat, r.Kode, r.TiketKode, r.Naik ? 'YA' : ''])));
    };
  });

  // =============== KAPAL SAYA (operator) ===============
  App.page('kapal', 'O', async function (v) {
    v.innerHTML = head('Kapal Saya', '<button class="btn grn" id="add">＋ Ajukan kapal</button>') + '<div class="alert">Kapal yang diajukan atau diubah akan diverifikasi Admin Dishub sebelum dapat dijadwalkan. Jadwal dibuat oleh Dishub.</div><div id="kl">' + App.skel(2, 60) + '</div>'; let rows = [];
    const muat = async () => { try { rows = (await App.api('op.kapal')).data; $('#kl', v).innerHTML = App.table([{ h: 'Kapal', f: r => '<b>' + esc(r.Nama) + '</b><br><span class="mut sm">' + esc(r.NoRegistrasi) + '</span>' }, { h: 'Jenis', f: r => esc(r.Jenis) }, { h: 'Kapasitas', cls: 'num', f: r => r.Kapasitas }, { h: 'Dokumen s/d', f: r => r.DokumenBerlaku ? tgl(r.DokumenBerlaku) : '-' }, { h: 'Status', f: r => App.badge(r.Status) + (r.Catatan ? '<div class="xs" style="color:var(--err)">' + esc(r.Catatan) + '</div>' : '') }, { h: '', f: r => '<button class="btn sm ghost" data-ed="' + esc(r.KapalID) + '">Ubah</button>' }], rows, { empty: 'Belum ada kapal terdaftar.' }); } catch (e) { $('#kl', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; } };
    const form = k => App.formModal({ title: k ? 'Ubah kapal' : 'Ajukan kapal', wide: true, fields: [{ k: 'Nama', label: 'Nama kapal', req: true, value: k && k.Nama }, { k: 'NoRegistrasi', label: 'No. registrasi / tanda selar', req: true, value: k && k.NoRegistrasi }, { k: 'Jenis', label: 'Jenis kapal', value: k && k.Jenis }, { k: 'Kapasitas', label: 'Kapasitas penumpang', type: 'number', req: true, value: k && k.Kapasitas }, { k: 'DokumenBerlaku', label: 'Dokumen berlaku sampai', type: 'date', value: k && k.DokumenBerlaku }, { k: 'DokumenUrl', label: 'Tautan dokumen (Google Drive, akses terbatas untuk Dishub)', value: k && k.DokumenUrl, full: true }], onSubmit: async x => { if (k) x.KapalID = k.KapalID; await App.api('op.kapalSimpan', { row: x }); App.toast('Diajukan untuk verifikasi Dishub.'); muat(); } });
    $('#add', v).onclick = () => form(null); v.addEventListener('click', e => { const b = e.target.closest('[data-ed]'); if (b) form(rows.filter(r => r.KapalID === b.dataset.ed)[0]); }); muat();
  });
})();
;
/* ===== notif.js ===== */
/* SIDIKAPET — halaman admin WhatsApp & Notifikasi (Fonnte) dan CRM Kontak.
   Memakai mesin notifikasi situs (adminNotif) yang juga melayani pengaduan; token Fonnte tidak pernah dikirim ke browser (hanya versi tersamar). */
(function () {
  'use strict';
  const App = window.SKA, { esc, $, $$ } = App;
  const N = (op, a, b) => adm('adminNotif', op, a, b).then(r => r.data).catch(e => { if (e && e.message === 'SESI') e.message = 'Sesi admin berakhir. Silakan masuk lagi.'; throw e; });
  const head = (judul, extra) => '<div class="pagehead"><h2>' + judul + '</h2><div class="row no-print">' + (extra || '') + '</div></div>';
  const tabs = (list, on) => '<div class="tabs" id="tb">' + list.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === on ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>';
  const KANAL_CRM = ['Telepon', 'WA Manual', 'Kunjungan', 'Catatan'];

  // =============== WHATSAPP & NOTIFIKASI ===============
  App.page('notif', 'A', async function (v, ctx) {
    let tab = (ctx.query && ctx.query.tab) || 'pengaturan', poll = null;
    v.innerHTML = head('WhatsApp & Notifikasi') + tabs([['pengaturan', '⚙️ Pengaturan'], ['antrean', '📨 Antrean'], ['blast', '📣 Blast WhatsApp']], tab) + '<div id="nb"></div>';
    App.cleanups.push(() => clearInterval(poll));
    $('#tb', v).onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; $$('#tb button', v).forEach(x => x.classList.toggle('on', x === b)); clearInterval(poll); muat(); } };
    const muat = () => ({ pengaturan, antrean, blast })[tab]();

    // ---- pengaturan ----
    async function pengaturan() {
      const nb = $('#nb', v); nb.innerHTML = App.skel(3, 80);
      try {
        const c = await N('konfig');
        const aktif = c.waAktif && c.tokenAda;
        nb.innerHTML = '<div class="alert ' + (aktif ? 'ok' : 'warn') + '">' + (aktif ? '<b>Notifikasi WhatsApp AKTIF.</b> Pesan masuk antrean dan dikirim otomatis tiap menit.' : '<b>Notifikasi WhatsApp NONAKTIF.</b> Pesanan, pembayaran, dan pembatalan jadwal tetap diproses; pesan WA tidak dikirim sampai diaktifkan.') + (c.trigger ? '' : ' <span class="badge warn">Pemicu pengirim belum terpasang — akan dipasang saat Anda menyimpan dengan notifikasi aktif.</span>') + '</div>' +
          '<form class="card mb" id="fc"><h3>Koneksi Fonnte & saklar</h3><div class="grid g2">' +
          '<div class="field"><label for="tk">Token Fonnte</label><input class="in" id="tk" type="password" autocomplete="off" placeholder="' + (c.tokenAda ? 'Tersimpan: ' + esc(c.token) + ' (kosongkan bila tidak diubah)' : 'Tempel token dari dasbor Fonnte') + '"><div class="hint">Token disimpan di server (Script Properties), tidak pernah ditampilkan lagi. ' + (c.tokenAda ? '<a href="#" id="hps" style="color:var(--err)">Hapus token</a>' : '') + '</div></div>' +
          '<div class="field"><label>Saklar utama</label><label style="display:flex;gap:10px;align-items:center;font-weight:600"><input type="checkbox" id="on"' + (c.waAktif ? ' checked' : '') + '> Aktifkan notifikasi WhatsApp</label><label style="display:flex;gap:10px;align-items:center;font-weight:600;margin-top:8px"><input type="checkbox" id="em"' + (c.emailAktif ? ' checked' : '') + '> Aktifkan notifikasi email' + (c.kuotaEmail == null ? '' : ' <span class="mut xs">(sisa kuota hari ini ' + c.kuotaEmail + ')</span>') + '</label></div>' +
          '<div class="field"><label for="bt">Ukuran batch blast</label><select class="in" id="bt">' + [10, 20, 50].map(n => '<option' + (n === c.batch ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="jd">Jeda antarpesan (detik)</label><input class="in" id="jd" value="' + esc(c.jeda) + '" placeholder="5 atau 3-8"><div class="hint">Jeda acak mis. 3-8 mengurangi risiko nomor dibatasi WhatsApp.</div></div>' +
          '<div class="field"><label for="wa">Nomor WA admin (menerima kabar pengaduan baru)</label><input class="in" id="wa" inputmode="tel" value="' + esc(c.waAdmin) + '" placeholder="08xxxxxxxxxx"></div>' +
          '<div class="field"><label for="au">Alamat situs (untuk tautan di pesan WA)</label><input class="in" id="au" value="' + esc(c.appUrl) + '" placeholder="https://akun.github.io/nama-repo/"><div class="hint">Dipakai pada tautan <code>{link}</code>, mis. tombol cek tiket di pesan pesanan.</div></div>' +
          '</div><div id="er" class="err-t"></div><div class="row"><button class="btn grn" type="submit">Simpan</button><button class="btn ghost" type="button" id="dv">Cek perangkat Fonnte</button><button class="btn ghost" type="button" id="ts">Kirim pesan tes</button></div></form>' +
          '<form class="card" id="fm"><h3>Kejadian & templat pesan</h3><p class="mut sm">Aktif/nonaktifkan per kejadian dan ubah isi pesan. Variabel: <code>' + esc(c.varInfo) + '</code>. Yang tersedia bergantung pada kejadiannya.</p>' +
          c.matriks.map(m => '<div class="card flat mb"><div class="row"><b style="flex:1 1 220px">' + esc(m.label) + '</b><label style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" data-wa="' + m.kode + '"' + (m.wa ? ' checked' : '') + '> WA</label><label style="display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" data-em="' + m.kode + '"' + (m.email ? ' checked' : '') + '> Email</label></div><textarea class="in mt" rows="4" data-ps="' + m.kode + '">' + esc(m.pesan) + '</textarea><div class="row between mt"><input class="in grow" data-sb="' + m.kode + '" value="' + esc(m.subjek) + '" placeholder="Subjek email" style="max-width:420px"><a href="#" data-rst="' + m.kode + '" class="sm">Kembalikan ke bawaan</a></div></div>').join('') +
          '<button class="btn grn" type="submit">Simpan templat</button></form>';
        const simpan = (fn, btn) => App.busy(btn, async () => { try { await fn(); App.toast('Tersimpan.'); pengaturan(); } catch (x) { const er = $('#er', v); if (er) er.textContent = x.message; App.err(x); } });
        $('#fc', v).onsubmit = e => {
          e.preventDefault(); const btn = $('button[type=submit]', e.target), tok = $('#tk', v).value.trim();
          simpan(async () => {
            if (tok) await N('rahasiaSimpan', { kunci: 'FONNTE_TOKEN', nilai: tok });
            await N('konfigSimpan', { waAktif: $('#on', v).checked, emailAktif: $('#em', v).checked, batch: Number($('#bt', v).value), jeda: $('#jd', v).value.trim(), waAdmin: $('#wa', v).value.trim(), appUrl: $('#au', v).value.trim() });
          }, btn);
        };
        const hps = $('#hps', v); if (hps) hps.onclick = async e => { e.preventDefault(); if (await App.confirm('Hapus token Fonnte? Notifikasi WhatsApp akan dinonaktifkan.', 'Hapus token', 'red')) simpan(() => N('rahasiaSimpan', { kunci: 'FONNTE_TOKEN', nilai: '__HAPUS__' }), hps); };
        $('#fm', v).onsubmit = e => { e.preventDefault(); const m = {}; c.matriks.forEach(x => { m[x.kode] = { wa: $('[data-wa=' + x.kode + ']', v).checked, email: $('[data-em=' + x.kode + ']', v).checked, pesan: $('[data-ps=' + x.kode + ']', v).value, subjek: $('[data-sb=' + x.kode + ']', v).value }; }); simpan(() => N('konfigSimpan', { matriks: m }), $('button[type=submit]', e.target)); };
        $('#fm', v).onclick = e => { const a = e.target.closest('[data-rst]'); if (a) { e.preventDefault(); const m = c.matriks.filter(x => x.kode === a.dataset.rst)[0]; $('[data-ps=' + m.kode + ']', v).value = m.pesanDefault; $('[data-sb=' + m.kode + ']', v).value = m.subjekDefault; } };
        $('#dv', v).onclick = e => App.busy(e.currentTarget, async () => { const d = await N('device'); App.modal({ title: 'Perangkat Fonnte', body: d.status ? '<table><tr><td>Nomor</td><td><b>' + esc(d.device) + '</b></td></tr><tr><td>Status</td><td>' + (d.terhubung ? '<span class="badge ok">Terhubung</span>' : '<span class="badge err">Tidak terhubung</span>') + '</td></tr><tr><td>Paket</td><td>' + esc(d.paket || '-') + '</td></tr><tr><td>Sisa kuota</td><td>' + esc(d.kuota === '' ? '-' : d.kuota) + '</td></tr></table>' : '<div class="alert err">Tidak dapat membaca perangkat: ' + esc(d.pesan || 'periksa token') + '</div>', buttons: [{ label: 'Tutup', onClick: a => a.close() }] }); });
        $('#ts', v).onclick = () => App.formModal({ title: 'Kirim pesan tes', submitLabel: 'Kirim', fields: [{ k: 'jenis', label: 'Kanal', type: 'select', options: [['wa', 'WhatsApp'], ['email', 'Email']] }, { k: 'tujuan', label: 'Nomor WhatsApp / alamat email tujuan', req: true, ph: '08xxxxxxxxxx atau nama@contoh.id' }], onSubmit: async x => { const r = await N('tes', x.jenis, x.tujuan); App.toast(r.ok ? 'Terkirim: ' + (r.respon || 'OK') : 'Gagal: ' + (r.respon || ''), r.ok ? '' : 'err'); } });
      } catch (e) { nb.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    }

    // ---- antrean ----
    async function antrean() {
      const nb = $('#nb', v); nb.innerHTML = App.skel(2, 80); let st = '';
      const load = async () => {
        try {
          const r = await N('antrean', { status: st }), k = r.ringkas;
          nb.innerHTML = '<div class="grid g4 mb">' + ['Antri', 'Terkirim', 'Gagal', 'Batal'].map(s => '<div class="card kpi"><div class="v" data-count="' + (k[s] || 0) + '">0</div><div class="l">' + s + '</div></div>').join('') + '</div>' +
            '<div class="row between mb no-print"><select class="in" id="fs" style="max-width:200px">' + [['', 'Semua status'], ['Antri', 'Antri'], ['Terkirim', 'Terkirim'], ['Gagal', 'Gagal'], ['Batal', 'Batal']].map(o => '<option value="' + o[0] + '"' + (o[0] === st ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select><div class="row"><button class="btn ghost" id="rt">↻ Ulangi yang gagal</button><button class="btn" id="pn">▶ Proses sekarang</button></div></div>' +
            App.table([{ h: 'Dibuat', f: x => App.tglJam(x.waktu) }, { h: 'Tujuan', f: x => esc(x.nama || '') + '<br><span class="mut xs">' + esc(x.kanal) + ' · ' + esc(x.tujuan) + '</span>' }, { h: 'Kejadian', f: x => esc(x.event) + (x.blast ? ' <span class="xs mut">' + esc(x.blast) + '</span>' : '') }, { h: 'Pesan', f: x => '<span class="sm">' + esc(x.pesan) + '</span>' }, { h: 'Status', f: x => App.badge(x.status) + (x.respon && x.status !== 'Terkirim' ? '<div class="xs mut">' + esc(x.respon) + '</div>' : '') }], r.rows, { empty: 'Antrean kosong.' });
          App.fx(v);
          $('#fs', v).onchange = e => { st = e.target.value; load(); };
          $('#pn', v).onclick = e => App.busy(e.currentTarget, async () => { const r2 = await N('proses'); App.toast('Diproses: terkirim ' + (r2.terkirim || 0) + ', gagal ' + (r2.gagal || 0) + (r2.info ? ' (' + r2.info + ')' : '')); load(); });
          $('#rt', v).onclick = e => App.busy(e.currentTarget, async () => { const r2 = await N('ulangi'); App.toast(r2.diulang + ' pesan dijadwalkan ulang.'); load(); });
        } catch (e) { nb.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
      };
      load();
    }

    // ---- blast ----
    async function blast() {
      const nb = $('#nb', v); nb.innerHTML = App.skel(2, 100); let audiens = null, cfg, stat;
      try { [stat, cfg] = await Promise.all([N('crmStats'), N('konfig')]); } catch (e) { nb.innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; return; }
      const seg = Object.keys(stat.segmen || {});
      nb.innerHTML = '<form class="card mb" id="fb"><h3>Blast baru</h3><div class="alert warn sm">Gunakan hanya untuk informasi layanan pelayaran (mis. perubahan jadwal, pengumuman cuaca). Penerima yang menolak (opt-out) otomatis dilewati. Dikirim bertahap agar nomor tidak dibatasi WhatsApp.</div>' +
        '<div class="grid g2"><div class="field"><label>Judul (internal)</label><input class="in" id="bj" maxlength="80" placeholder="mis. Pengumuman cuaca"></div><div class="field"><label>Sasaran (segmen CRM)</label><select class="in" id="bs"><option value="">Semua kontak</option>' + seg.map(s => '<option value="' + esc(s) + '">' + esc(s) + ' (' + stat.segmen[s] + ')</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>Pesan <span class="mut xs" id="cc">0/1500</span></label><textarea class="in" id="bp" rows="5" maxlength="1500" placeholder="Tulis pesan. Variabel: {nama} {instansi} {link}"></textarea></div>' +
        '<div class="grid g3"><div class="field"><label>Ukuran batch</label><select class="in" id="bb">' + [10, 20, 50].map(n => '<option' + (n === cfg.batch ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div><div class="field"><label>Jeda (detik)</label><input class="in" id="bd" value="' + esc(cfg.jeda) + '"></div><div class="field"><label>&nbsp;</label><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="bl" checked> Lewati nomor tidak terdaftar WA</label></div></div>' +
        '<div id="pvo"></div><div class="row"><button type="button" class="btn ghost" id="pv">👁 Pratinjau penerima</button><button type="button" class="btn ghost" id="ck" hidden>🔎 Cek nomor WA</button><button class="btn btn-glow" type="submit" id="mk" hidden>📣 Buat blast</button></div></form>' +
        '<h3>Riwayat blast</h3><div id="bl2">' + App.skel(2, 60) + '</div>';
      const filt = () => audiens.rows.filter(r => r.valid && !r.ganda && !r.optOut && !($('#bl', v).checked && r.statusWA === 'Tidak Terdaftar'));
      $('#bp', v).oninput = e => { $('#cc', v).textContent = e.target.value.length + '/1500'; };
      $('#bs', v).onchange = () => { audiens = null; $('#mk', v).hidden = true; $('#ck', v).hidden = true; $('#pvo', v).innerHTML = ''; };
      $('#pv', v).onclick = e => App.busy(e.currentTarget, async () => {
        const r = await N('audience', { segmen: $('#bs', v).value }); audiens = r; const k = r.ringkas;
        $('#pvo', v).innerHTML = '<div class="alert ok"><b>' + filt().length + ' penerima siap</b> dari ' + k.total + ' kontak · tidak valid ' + k.tidakValid + ' · ganda ' + k.ganda + ' · opt-out ' + k.optOut + ' · tidak terdaftar WA ' + k.bukanWA + ' · belum dicek ' + k.belumDicek + (r.terpotong ? ' · <b>daftar dipotong 2.000</b>' : '') + '</div>';
        $('#mk', v).hidden = !filt().length; $('#ck', v).hidden = !k.belumDicek;
      });
      $('#bl', v).onchange = () => { if (audiens) $('#pv', v).click(); };
      $('#ck', v).onclick = e => { const btn = e.currentTarget; return App.busy(btn, async () => {
        if (!audiens) return; const hp = audiens.rows.filter(r => r.valid && !r.statusWA).map(r => r.hp), n = hp.length; if (!n) return App.toast('Semua nomor sudah dicek.');
        let ok = 0; for (let i = 0; i < n; i += 50) { const r = await N('validasi', hp.slice(i, i + 50)); ok += r.terdaftar; btn.innerHTML = '<span class="spin"></span> Mengecek ' + Math.min(i + 50, n) + '/' + n; }
        App.toast('Selesai: ' + ok + ' terdaftar dari ' + n + ' nomor.'); $('#pv', v).click();
      }); };
      $('#fb', v).onsubmit = async e => {
        e.preventDefault(); if (!audiens) return App.toast('Pratinjau penerima dulu.', 'warn'); const rows = filt(), judul = $('#bj', v).value.trim(), pesan = $('#bp', v).value.trim(); if (judul.length < 3 || pesan.length < 5) return App.toast('Isi judul dan pesan.', 'warn');
        if (!await App.confirm('Buat blast <b>' + esc(judul) + '</b> untuk <b>' + rows.length + ' penerima</b>? Dikirim bertahap ' + $('#bb', v).value + ' pesan per batch.', 'Ya, buat blast')) return;
        await App.busy($('#mk', v), async () => { const r = await N('blastBuat', { judul, pesan, ukuranBatch: Number($('#bb', v).value), jeda: $('#bd', v).value.trim(), sasaran: $('#bs', v).value || 'Semua kontak', kontakIds: rows.map(x => x.id) }); App.toast('Blast dibuat: ' + r.total + ' penerima.'); $('#fb', v).reset(); audiens = null; $('#pvo', v).innerHTML = ''; $('#mk', v).hidden = true; daftar(); });
      };
      async function daftar() {
        try {
          const rows = await N('blastList');
          $('#bl2', v).innerHTML = rows.length ? rows.map(b => '<div class="card fx mb" data-tilt="0"><div class="row between"><div><b>' + esc(b.judul) + '</b> ' + App.badge(b.status) + '<div class="xs mut">' + esc(b.id) + ' · ' + App.tglJam(b.tanggal) + ' · sasaran ' + esc(b.sasaran) + '</div></div><div class="row no-print">' + (b.status === 'Berjalan' ? '<button class="btn sm" data-p="' + esc(b.id) + '">▶ Kirim batch berikutnya</button><button class="btn sm ghost red" data-s="' + esc(b.id) + '">Hentikan</button>' : '') + '</div></div>' +
            '<div class="bar mt"><i style="width:' + b.persen + '%"></i></div><div class="row between xs mut mt"><span>Terkirim ' + b.terkirim + ' · gagal ' + b.gagal + ' · sisa ' + b.sisa + ' dari ' + b.total + '</span><span>' + b.persen + '% · batch ' + b.batch + ' · jeda ' + esc(b.jeda) + ' dtk</span></div></div>').join('') : '<div class="empty"><div class="ic">📣</div>Belum ada blast.</div>';
          clearInterval(poll); if (rows.some(b => b.status === 'Berjalan')) poll = setInterval(() => { if (document.visibilityState === 'visible' && $('#bl2', v)) daftar(); else if (!$('#bl2', v)) clearInterval(poll); }, 9000);
        } catch (e) { $('#bl2', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
      }
      $('#bl2', v).onclick = async e => {
        const p = e.target.closest('[data-p]'), s = e.target.closest('[data-s]');
        if (p) App.busy(p, async () => { const r = await N('blastProses', p.dataset.p); App.toast('Terkirim ' + (r.terkirim || 0) + ', gagal ' + (r.gagal || 0)); daftar(); });
        if (s && await App.confirm('Hentikan blast ini? Pesan yang belum terkirim dibatalkan.', 'Hentikan', 'red')) App.busy(s, async () => { const r = await N('blastStop', s.dataset.s); App.toast(r.dibatalkan + ' pesan dibatalkan.', 'warn'); daftar(); });
      };
      daftar();
    }
    muat();
  });

  // =============== CRM KONTAK ===============
  App.page('crm', 'A', async function (v) {
    let f = { q: '', segmen: '', statusWA: '', halaman: 1 }, sel = new Set(), data = null;
    v.innerHTML = head('CRM Kontak', '<button class="btn ghost" id="sy">↻ Sinkron dari data tiket & pengaduan</button><button class="btn ghost" id="im">⬆ Impor</button><button class="btn ghost" id="ex">⬇ Ekspor CSV</button><button class="btn grn" id="ad">＋ Kontak</button>') +
      '<div id="ks" class="grid g4 mb">' + App.skel(1, 80) + '</div><div class="card mb no-print"><div class="grid g4" style="align-items:end"><div class="field"><label>Cari</label><input class="in" id="q" placeholder="nama, nomor, email, tag"></div><div class="field"><label>Segmen</label><select class="in" id="sg"><option value="">Semua</option></select></div><div class="field"><label>Status WA</label><select class="in" id="sw"><option value="">Semua</option><option value="Terdaftar">Terdaftar</option><option value="Tidak Terdaftar">Tidak terdaftar</option><option value="belum">Belum dicek</option></select></div><div class="field"><button class="btn block" id="go">Terapkan</button></div></div></div><div id="bk"></div><div id="tl"></div>';
    const stats = async () => { try { const s = await N('crmStats'); $('#ks', v).innerHTML = [['Total kontak', s.total], ['Punya WA valid', s.wa], ['Terdaftar WA', s.terdaftar], ['Opt-out', s.optOut]].map(x => '<div class="card fx kpi" data-tilt="0"><div class="v" data-count="' + x[1] + '">0</div><div class="l">' + x[0] + '</div></div>').join('') + '<div class="xs mut" style="grid-column:1/-1">Baru 7 hari: ' + s.baru7 + ' · dihubungi 30 hari: ' + s.dihubungi30 + ' · nomor ganda: ' + s.ganda + ' · tanpa kontak: ' + s.tanpaKontak + ' · sinkron terakhir: ' + esc(s.sinkronTerakhir || '-') + '</div>'; App.fx(v);
      const sg = $('#sg', v), cur = sg.value; sg.innerHTML = '<option value="">Semua</option>' + Object.keys(s.segmen || {}).map(k => '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(k) + ' (' + s.segmen[k] + ')</option>').join(''); } catch (e) { $('#ks', v).innerHTML = '<div class="alert err" style="grid-column:1/-1">' + esc(e.message) + '</div>'; } };
    const list = async () => {
      $('#tl', v).innerHTML = App.skel(3, 50);
      try {
        data = await N('crmList', f); const pages = Math.max(1, Math.ceil(data.total / data.per));
        $('#tl', v).innerHTML = App.table([{ h: '', hr: '<input type="checkbox" id="all" aria-label="Pilih semua">', f: r => '<input type="checkbox" data-id="' + esc(r.id) + '"' + (sel.has(r.id) ? ' checked' : '') + '>' }, { h: 'Nama', f: r => '<a href="#" data-d="' + esc(r.id) + '"><b>' + esc(r.nama || '(tanpa nama)') + '</b></a><br><span class="mut xs">' + esc(r.email || '') + '</span>' }, { h: 'WhatsApp', f: r => r.hp ? '<span class="mono">' + esc(r.hp) + '</span>' + (r.valid ? '' : ' <span class="badge err">tidak valid</span>') : '-' }, { h: 'Segmen', f: r => esc(r.segmen) + (r.tag ? '<br><span class="badge gray">' + esc(r.tag) + '</span>' : '') }, { h: 'Status WA', f: r => r.statusWA ? App.badge(r.statusWA) : '<span class="mut xs">belum dicek</span>' }, { h: 'Pesan', cls: 'num', f: r => r.jumlah || 0 }, { h: 'Opt-out', f: r => r.optOut ? '<span class="badge err">YA</span>' : '' }], data.rows, { empty: 'Tidak ada kontak. Coba “Sinkron dari data tiket & pengaduan”.' }) +
          '<div class="row between mt no-print"><span class="mut sm">' + data.total + ' kontak · halaman ' + f.halaman + '/' + pages + '</span><div class="row"><button class="btn sm ghost" id="pvp"' + (f.halaman <= 1 ? ' disabled' : '') + '>← Sebelumnya</button><button class="btn sm ghost" id="nx"' + (f.halaman >= pages ? ' disabled' : '') + '>Berikutnya →</button></div></div>';
        bulk();
      } catch (e) { $('#tl', v).innerHTML = '<div class="alert err">' + esc(e.message) + '</div>'; }
    };
    const bulk = () => { $('#bk', v).innerHTML = sel.size ? '<div class="alert row between"><b>' + sel.size + ' dipilih</b><div class="row"><button class="btn sm" data-b="tag">＋ Tag</button><button class="btn sm ghost" data-b="optout">Opt-out</button><button class="btn sm ghost" data-b="optin">Cabut opt-out</button><button class="btn sm ghost" data-b="clr">Batal pilih</button></div></div>' : ''; };
    $('#go', v).onclick = () => { f = { q: $('#q', v).value.trim(), segmen: $('#sg', v).value, statusWA: $('#sw', v).value, halaman: 1 }; sel.clear(); list(); }; $('#q', v).onkeydown = e => { if (e.key === 'Enter') $('#go', v).click(); };
    v.addEventListener('change', e => { if (e.target.id === 'all') { $$('[data-id]', v).forEach(c => { c.checked = e.target.checked; e.target.checked ? sel.add(c.dataset.id) : sel.delete(c.dataset.id); }); bulk(); } else if (e.target.dataset && e.target.dataset.id) { e.target.checked ? sel.add(e.target.dataset.id) : sel.delete(e.target.dataset.id); bulk(); } });
    const kontakForm = k => App.formModal({ title: k ? 'Ubah kontak' : 'Kontak baru', wide: true, fields: [{ k: 'nama', label: 'Nama', req: true, value: k && k.nama }, { k: 'hp', label: 'Nomor WhatsApp', req: !k, value: k && k.hp, inputmode: 'tel', ph: '08xxxxxxxxxx' }, { k: 'email', label: 'Email', value: k && k.email, type: 'email' }, k ? { k: 'tag', label: 'Tag', value: k.tag, hint: 'Pisahkan dengan koma' } : { k: 'segmen', label: 'Segmen', value: 'Manual' }, { k: 'catatan', label: 'Catatan', type: 'textarea', value: k && k.catatan, full: true }, k ? { k: 'optOut', label: 'Opt-out (tidak menerima blast)', type: 'checkbox', value: k.optOut } : { k: 'tag', label: 'Tag' }],
      onSubmit: async x => {
        if (k) { await N('crmSimpan', { id: k.id, nama: x.nama, hp: x.hp, email: x.email, tag: x.tag, catatan: x.catatan, optOut: x.optOut }); App.toast('Kontak diperbarui.'); }
        else { const r = await N('crmImpor', { rows: [{ nama: x.nama, wa: x.hp, email: x.email, segmen: x.segmen, tag: x.tag }], dryRun: false }); if (!r.ditambah) throw new Error(r.tidakValid ? 'Nomor WhatsApp tidak valid.' : 'Kontak sudah ada (nomor/email sama pada segmen itu).'); App.toast('Kontak ditambahkan.'); }
        stats(); list();
      } });
    const detail = async id => {
      try {
        const d = await N('crmDetail', id), k = d.kontak, wa = k.hp ? 'https://wa.me/' + App.hp62(k.hp) : '';
        const m = App.modal({ title: k.nama || k.hp, wide: true, body: '<div class="row between"><div><div class="b mono">' + esc(k.hp || '-') + '</div><div class="mut sm">' + esc(k.email || 'tanpa email') + '</div><div class="mt">' + String(k.segmen).split(',').filter(Boolean).map(x => '<span class="badge">' + esc(x.trim()) + '</span>').join(' ') + (k.tag ? ' <span class="badge gray">' + esc(k.tag) + '</span>' : '') + (k.optOut ? ' <span class="badge err">Opt-out</span>' : '') + (k.statusWA ? ' ' + App.badge(k.statusWA) : '') + '</div></div><div class="row">' + (wa ? '<a class="btn sm grn" target="_blank" rel="noopener" href="' + wa + '">💬 Buka WhatsApp</a>' : '') + '<button class="btn sm ghost" id="ed">Ubah</button></div></div>' +
            (k.catatan ? '<div class="alert mt sm">' + esc(k.catatan) + '</div>' : '') + '<div class="grid g2 mt"><div><h3>Pesan terkirim</h3>' + App.table([{ h: 'Waktu', f: x => App.tglJam(x.waktu) }, { h: 'Isi', f: x => '<span class="sm">' + esc(x.kanal) + ' · ' + esc(x.ringkas) + '</span>' }, { h: '', f: x => App.badge(x.status) }], d.pesan, { empty: 'Belum ada pesan.' }) + '</div><div><h3>Catatan interaksi</h3>' + App.table([{ h: 'Waktu', f: x => App.tglJam(x.waktu) }, { h: 'Catatan', f: x => '<b>' + esc(x.kanal) + '</b>: ' + esc(x.ringkas) + '<div class="xs mut">' + esc(x.oleh) + '</div>' }], d.catatan, { empty: 'Belum ada catatan.' }) + '</div></div>' +
            '<form class="row mt" id="fi" style="flex-wrap:nowrap"><select class="in" id="ik" style="max-width:140px">' + KANAL_CRM.map(x => '<option>' + x + '</option>').join('') + '</select><input class="in grow" id="ir" placeholder="Catat interaksi…" maxlength="300"><button class="btn" type="submit">Simpan</button></form>', buttons: [{ label: 'Tutup', cls: 'ghost', onClick: a => a.close() }] });
        $('#ed', m.el).onclick = () => { m.close(); kontakForm(k); };
        $('#fi', m.el).onsubmit = async e => { e.preventDefault(); const r = $('#ir', m.el).value.trim(); if (r.length < 3) return; try { await N('crmCatat', { id, kanal: $('#ik', m.el).value, ringkasan: r }); m.close(); detail(id); list(); } catch (x) { App.err(x); } };
      } catch (e) { App.err(e); }
    };
    v.addEventListener('click', async e => {
      const a = e.target.closest('a[data-d]'); if (a) { e.preventDefault(); return detail(a.dataset.d); }
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'pvp') { f.halaman--; list(); } if (b.id === 'nx') { f.halaman++; list(); }
      if (b.dataset.b) {
        const ids = Array.from(sel), k = b.dataset.b;
        if (k === 'clr') { sel.clear(); $$('[data-id],#all', v).forEach(c => { c.checked = false; }); return bulk(); }
        if (k === 'optout' || k === 'optin') { if (await App.confirm((k === 'optout' ? 'Tandai opt-out untuk ' : 'Cabut opt-out untuk ') + ids.length + ' kontak?', 'Ya')) App.busy(b, async () => { await N('crmMassal', { ids, aksi: k }); App.toast('Diperbarui.'); sel.clear(); stats(); list(); }); return; }
        App.formModal({ title: 'Tambah tag', fields: [{ k: 'nilai', label: 'Tag', req: true }], onSubmit: async x => { await N('crmMassal', { ids, aksi: 'tag', nilai: x.nilai }); App.toast('Diperbarui.'); sel.clear(); list(); } });
      }
    });
    $('#ad', v).onclick = () => kontakForm(null);
    $('#sy', v).onclick = e => App.busy(e.currentTarget, async () => { const r = await N('crmSync'); App.toast('Sinkron: +' + r.ditambah + ' baru, ' + r.diperbarui + ' diperbarui, ' + r.dilewati + ' dilewati.'); stats(); list(); });
    $('#im', v).onclick = () => App.formModal({ title: 'Impor kontak', wide: true, submitLabel: 'Impor', fields: [{ k: 'baris', label: 'Data kontak', type: 'textarea', req: true, ph: '08123456789|Nama|email@contoh.id', hint: 'Satu kontak per baris: nomor|nama|email (nama dan email boleh dikosongkan). Maksimal 5.000 baris.' }, { k: 'segmen', label: 'Segmen', value: 'Impor' }],
      onSubmit: async x => { const rows = x.baris.split(/\r?\n/).map(l => l.split('|').map(t => t.trim())).filter(c => c[0] || c[2]).map(c => ({ wa: c[0], nama: c[1] || '', email: c[2] || '' })); if (!rows.length) throw new Error('Tidak ada baris yang bisa dibaca.');
        const dry = await N('crmImpor', { rows, segmenDefault: x.segmen, dryRun: true });
        if (!await App.confirm('Hasil uji: <b>' + dry.ditambah + '</b> baru, ' + dry.diperbarui + ' diperbarui, ' + dry.dilewati + ' dilewati, ' + dry.tidakValid + ' nomor tidak valid. Lanjutkan impor?', 'Impor')) return false;
        const r = await N('crmImpor', { rows, segmenDefault: x.segmen, dryRun: false }); App.toast('Impor selesai: +' + r.ditambah + ' kontak.'); stats(); list(); } });
    $('#ex', v).onclick = e => App.busy(e.currentTarget, async () => { const out = []; let hal = 1, tot = 1; while (out.length < tot && hal <= 40) { const r = await N('crmList', Object.assign({}, f, { halaman: hal })); tot = r.total; out.push.apply(out, r.rows); if (!r.rows.length) break; hal++; } App.csv('kontak-crm.csv', [['Nama', 'WhatsApp', 'Email', 'Segmen', 'Tag', 'Status WA', 'Opt-out', 'Jumlah pesan', 'Terakhir dihubungi']].concat(out.map(r => [r.nama, r.hp, r.email, r.segmen, r.tag, r.statusWA, r.optOut ? 'YA' : '', r.jumlah, r.terakhir]))); App.toast(out.length + ' kontak diekspor.'); });
    stats(); list();
  });
})();
;
/* ===== integration.js ===== */
/* SIDIKAPET — penghubung ke situs Bidang Perairan dan Udara.
   Mengubah rute internal SIDIKAPET menjadi halaman (route) situs: publik, admin (di dalam layout admin situs), dan petugas (loket/pelabuhan/operator). */
(function () {
  'use strict';
  const App = window.SKA, { esc, $, $$ } = App;
  const ROLEL = App.ROLEL;
  const PUB = { sidikapet: '/', 'tk-jadwal': '/jadwal', 'tk-pesan': '/pesan/', 'tk-cek': '/cek', 'tk-masuk': '/masuk' };

  App.MENU = {
    loket: [['loket', '🧾', 'Loket Tiket'], ['kas', '💰', 'Tutup Kas'], ['akun', '🙍', 'Akun']],
    pelabuhan: [['scan', '📷', 'Validasi Tiket'], ['manifest', '📋', 'Manifest'], ['akun', '🙍', 'Akun']],
    operator: [['kapal', '🚢', 'Kapal Saya'], ['manifest', '📋', 'Manifest Kapal'], ['akun', '🙍', 'Akun']]
  };
  const ADMIN_NAV = [
    ['', '', 'SIDIKAPET — Tiket Kapal'],
    ['admin-tk-dash', 'sailing', 'Dashboard Tiket'], ['admin-tk-loket', 'point_of_sale', 'Loket Tiket'], ['admin-tk-kas', 'payments', 'Tutup Kas'],
    ['admin-tk-scan', 'qr_code_scanner', 'Validasi Pelabuhan'], ['admin-tk-manifest', 'list_alt', 'Manifest'], ['admin-tk-jadwal', 'calendar_month', 'Jadwal Kapal'],
    ['admin-tk-master', 'database', 'Master Data Tiket'], ['admin-tk-laporan', 'monitoring', 'Laporan Tiket'], ['admin-tk-pengguna', 'group', 'Petugas Tiket'],
    ['admin-tk-pengaturan', 'tune', 'Pengaturan Tiket'], ['admin-tk-audit', 'policy', 'Log Audit Tiket'],
    ['', '', 'Komunikasi'],
    ['admin-tk-notif', 'chat', 'WhatsApp & Notifikasi'], ['admin-tk-crm', 'contacts', 'CRM Kontak']
  ];
  const judul = n => { const x = ADMIN_NAV.filter(a => a[0] === n)[0]; return x ? x[2] : 'SIDIKAPET'; };

  // ---- pemetaan alamat internal → halaman situs ----
  function parse(p) { const i = p.indexOf('?'), path = (i < 0 ? p : p.slice(0, i)).replace(/\/+$/, '') || '/', q = {}; new URLSearchParams(i < 0 ? '' : p.slice(i + 1)).forEach((v, k) => { q[k] = v; }); return { path, q }; }
  const isAdmin = () => typeof AppState !== 'undefined' && !!AppState.token;
  App.where = function (p) {
    const { path, q } = parse(p); let m;
    if (path === '/') return { page: 'sidikapet', params: q };
    if (path === '/jadwal') return { page: 'tk-jadwal', params: q };
    if ((m = /^\/pesan\/([^/]+)$/.exec(path))) return { page: 'tk-pesan', params: Object.assign({}, q, { id: decodeURIComponent(m[1]) }) };
    if (path === '/cek') return { page: 'tk-cek', params: q };
    if (path === '/masuk') return { page: 'tk-masuk', params: q };
    if ((m = /^\/app(?:\/([\w-]+))?$/.exec(path))) {
      const s = App.sesi.get(), name = m[1] || (s && s.me ? App.landing(s.me.role) : 'akun');
      const pg = (isAdmin() ? 'admin-tk-' : 'staf-') + name;
      return { page: window.SKPerud && !window.SKPerud.routes[pg] ? (isAdmin() ? 'admin-tk-dash' : 'tk-masuk') : pg, params: q };
    }
    return { page: 'sidikapet', params: {} };
  };
  App.nav = function (p) { const w = App.where(p); return navigateTo(w.page, { params: w.params }); };

  // tautan "#/..." di dalam halaman SIDIKAPET → navigasi situs
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (!a || !a.closest('.sk-app')) return;
    e.preventDefault(); App.nav(a.getAttribute('href').slice(1));
  });

  // ---- data awal publik ----
  function ensureBoot() {
    if (!App.bootP) App.bootP = App.swr('pubboot', () => App.api('pub.boot').then(r => r.data), d => { App.boot = d; }, 60000).catch(e => { if (!App.boot) console.warn('SIDIKAPET boot:', e.message); });
    if (App.boot) return Promise.resolve();
    return Promise.race([App.bootP, new Promise(r => setTimeout(r, 5000))]);
  }
  const redirect = (page, params) => { setTimeout(() => navigateTo(page, { params: params || {}, noHistory: true }), 0); return { html: '' }; };
  const fail = (v, e) => { console.error(e); v.innerHTML = '<div class="alert err mt">' + esc((e && e.message) || 'Gagal memuat halaman.') + '</div><button class="btn mt" onclick="location.reload()">Muat ulang</button>'; };

  // ---- halaman publik ----
  function pubPage(page) {
    return function (params) {
      params = params || {};
      let path = PUB[page]; if (page === 'tk-pesan') path = params.id ? '/pesan/' + encodeURIComponent(params.id) : '/jadwal';
      const query = Object.assign({}, params); delete query.id; delete query.focus;
      return {
        html: '<div class="sk-app sk-pub"><div id="sk-view"></div></div>',
        init: async function () {
          const v = $('#sk-view'); if (!v) return; v.innerHTML = App.skel(2, 140);
          try {
            await ensureBoot(); let hit = null;
            for (const r of App.routes) { const m = r.re.exec(path); if (m) { const pp = {}; r.keys.forEach((k, i) => { pp[k] = decodeURIComponent(m[i + 1]); }); hit = { r, pp }; break; } }
            if (!hit) { v.innerHTML = '<div class="empty">Halaman tidak ditemukan.</div>'; return; }
            v.innerHTML = ''; await hit.r.fn(v, { params: hit.pp, query }); App.fx(v);
          } catch (e) { fail(v, e); }
        }
      };
    };
  }

  // ---- halaman admin (di dalam layout admin situs) & petugas ----
  function appPage(name, staff) {
    const pg = App.pages[name];
    return async function (params) {
      params = params || {};
      if (staff) {
        if (isAdmin() && pg.roles.indexOf('A') >= 0) return redirect('admin-tk-' + name, params);
        const s = App.sesi.get(); if (!s || !s.token) { App.toast('Silakan masuk sebagai petugas.', 'warn'); return redirect('tk-masuk'); }
        if (pg.roles.indexOf(ROLEL[s.me.role]) < 0) { App.toast('Anda tidak berhak membuka halaman itu.', 'warn'); return redirect('staf-' + App.landing(s.me.role)); }
      } else if (pg.roles.indexOf('A') < 0) { return redirect('admin-tk-dash'); }
      const ctx = () => ({ me: (App.sesi.get() || {}).me, query: params, name });
      const init = async function () {
        const v = $('#sk-view'); if (!v) return; v.innerHTML = App.skel(2, 120);
        try { await ensureBoot(); v.innerHTML = ''; await pg.fn(v, ctx()); App.fx(v); } catch (e) { fail(v, e); }
      };
      if (!staff) return { html: adminLayout('admin-tk-' + name, judul('admin-tk-' + name), '<div class="sk-app sk-admin"><div id="sk-view"></div></div>'), init };
      const me = App.sesi.get().me, items = App.MENU[me.role] || [];
      return {
        html: '<div class="sk-app sk-staff"><div class="topbar no-print"><button id="sbT" aria-label="Menu">☰</button><b>SIDIKAPET</b><span class="net on" id="netTop" style="margin-left:auto"><i></i><span>ONLINE</span></span></div><div class="app"><aside class="side no-print" id="side">' +
          '<a class="brand" href="javascript:void(0)" data-nav="sidikapet"><img src="assets/sidikapet-logo.png" alt="Logo SIDIKAPET" width="40" height="40"><span>SIDIKAPET<small>' + esc(App.roleNama(me.role)) + '</small></span></a>' +
          items.map(m => '<a class="m' + (m[0] === name ? ' on' : '') + '" href="javascript:void(0)" data-nav="staf-' + m[0] + '"><span>' + m[1] + '</span>' + esc(m[2]) + '</a>').join('') +
          '<div class="who"><div class="b">' + esc(me.nama || '') + '</div><div class="mut" style="color:#9cc0c8">' + esc(App.roleNama(me.role)) + '</div><div class="row mt" style="gap:6px"><button class="btn sm ghost" style="--c:#fff;color:#fff" id="keluar">Keluar</button><button class="btn sm ghost" style="--c:#fff;color:#fff" data-nav="home">Situs</button></div></div></aside><main class="main" id="sk-view"></main></div></div>',
        init: function () {
          const sb = $('#sbT'); if (sb) sb.onclick = () => $('#side').classList.toggle('open');
          const side = $('#side'); if (side) side.addEventListener('click', e => { if (e.target.closest('a')) side.classList.remove('open'); });
          const k = $('#keluar'); if (k) k.onclick = async () => { try { await App.api('auth.keluar'); } catch (e) { } App.sesi.clear(); navigateTo('tk-masuk', { noHistory: true }); };
          init();
        }
      };
    };
  }

  // ---- daftar rute untuk situs ----
  const routes = {};
  Object.keys(PUB).forEach(k => { routes[k] = pubPage(k); });
  Object.keys(App.pages).forEach(n => {
    const r = App.pages[n].roles || '';
    if (r.indexOf('A') >= 0) routes['admin-tk-' + n] = appPage(n, false);
    if (/[LPO]/.test(r)) routes['staf-' + n] = appPage(n, true);
  });

  window.SKPerud = { routes, adminNav: ADMIN_NAV };
})();
;
