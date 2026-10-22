'use strict';
/* =====================================================================
   SPA — Website Bidang Perairan dan Udara, Dishub Kota Balikpapan
   Frontend statis (GitHub Pages) + backend Google Apps Script (REST).
   Token admin hanya di memori (AppState), tidak pernah di URL.
   ===================================================================== */
const AppState = { page: null, params: {}, token: null, adminName: '', settings: {}, cache: {}, history: [], navSeq: 0, cid: '' };
(function () {
  try { let c = localStorage.getItem('cid'); if (!c) { c = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cid', c); } AppState.cid = c; }
  catch (e) { AppState.cid = Math.random().toString(36).slice(2); }
})();

/* ---------- Utilitas ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v) || 0;
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
const paras = t => String(t || '').split(/\n{2,}/).filter(x => x.trim()).map(p => '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
const ic = (n, c) => '<span class="material-symbols-outlined ' + (c || '') + '" aria-hidden="true">' + n + '</span>';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function fmtDate(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : String(s || ''); }
function fmtDateTime(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1].slice(0, 3) + ' ' + m[1] + ', ' + m[4] + ':' + m[5] + ' WITA' : fmtDate(s); }
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* Kelas komponen (mengikuti DESIGN.md) */
const CARD = 'bg-white border border-[#E2E8F0] rounded-lg shadow-[0_1px_3px_rgba(15,41,66,0.05)]';
const INP = 'w-full rounded border border-[#CBD5E1] bg-white px-3 py-2.5 text-[15px] text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30';
const BTN = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2 rounded font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ';
const BTN_P = BTN + 'bg-primary-container text-white hover:bg-[#0A1C2E]';
const BTN_S = BTN + 'border-[1.5px] border-primary-container text-primary-container bg-transparent hover:bg-[#F1F5F9]';
const BTN_A = BTN + 'bg-[#F59E0B] text-[#1E293B] hover:bg-[#D98A08]';
const STATUS_CLS = { Diterima: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]', Diproses: 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]', Selesai: 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]' };
const statusBadge = s => '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ' + (STATUS_CLS[s] || 'bg-slate-100 border-slate-200 text-slate-700') + '">' + esc(s) + '</span>';
const field = (label, inner, hint) => '<label class="block"><span class="block text-sm font-semibold mb-1.5">' + label + '</span>' + inner + (hint ? '<span class="block text-xs text-on-surface-variant mt-1">' + hint + '</span>' : '') + '</label>';
const sectionTitle = (kicker, title, sub) => '<div class="mb-8"><div class="text-secondary text-xs font-bold uppercase tracking-wider mb-2">' + esc(kicker) + '</div><h2 class="font-headline text-2xl md:text-3xl font-bold text-primary-container">' + esc(title) + '</h2>' + (sub ? '<p class="text-on-surface-variant mt-2 max-w-2xl">' + esc(sub) + '</p>' : '') + '</div>';
const emptyBox = (icon, msg) => '<div class="' + CARD + ' p-10 text-center text-on-surface-variant">' + ic(icon, 'text-[40px] text-outline') + '<p class="mt-2">' + esc(msg) + '</p></div>';
const wrap = inner => '<div class="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14">' + inner + '</div>';

function toast(msg, type) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = 'toast ' + (type === 'error' ? 'toast-error' : type === 'warn' ? 'toast-warn' : 'toast-ok');
  el.textContent = msg; $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function openModal(html, wide) {
  closeModal();
  const w = document.createElement('div');
  w.id = 'modal'; w.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-primary-container/50 backdrop-blur-sm p-4';
  w.innerHTML = '<div role="dialog" aria-modal="true" class="bg-white rounded-lg shadow-xl w-full ' + (wide ? 'max-w-3xl' : 'max-w-lg') + ' max-h-[92vh] overflow-y-auto">' + html + '</div>';
  w.addEventListener('mousedown', e => { if (e.target === w) closeModal(); });
  $('#modal-root').appendChild(w);
  const f = w.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus();
  return w;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMobileMenu(); } });
const modalHead = t => '<div class="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]"><h3 class="font-headline text-lg font-bold text-primary-container">' + esc(t) + '</h3><button type="button" data-act="close-modal" aria-label="Tutup" class="p-1 rounded hover:bg-surface-container">' + ic('close') + '</button></div>';

/* ---------- Komunikasi server ---------- */
function call(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (!window.GAS_URL || /XXXX/.test(window.GAS_URL)) return Promise.reject(new Error('Alamat server belum diisi di js/config.js.'));
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 120000);
  return fetch(window.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // wajib text/plain: JSON memicu preflight CORS yang ditolak GAS
    body: JSON.stringify({ fn: fn, args: args }),
    signal: ctl.signal
  }).then(r => r.json()).catch(() => { throw new Error('Koneksi ke server gagal. Periksa internet Anda lalu coba lagi.'); }).finally(() => clearTimeout(tm));
}
async function api(fn) {
  const r = await call.apply(null, arguments);
  if (r && r.code === 'SESI') { forceLogout(r.message); throw new Error('SESI'); }
  if (!r || !r.success) throw new Error((r && r.message) || 'Terjadi kesalahan.');
  return r;
}
async function pub(name, params, ttl) {
  const key = name + JSON.stringify(params || {}), c = AppState.cache[key];
  if (c && Date.now() - c.t < (ttl == null ? 120000 : ttl)) return c.d;
  const r = await api('apiPublic', name, params || {});
  AppState.cache[key] = { t: Date.now(), d: r.data };
  return r.data;
}
const adm = function () { return api.apply(null, [arguments[0], AppState.token].concat(Array.prototype.slice.call(arguments, 1))); };
async function withBusy(btn, fn) {
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Memproses...';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}
function readFile(file, types) {
  return new Promise((res, rej) => {
    if (!file) return res(null);
    if (types && types.indexOf(file.type) < 0) return rej(new Error('Jenis berkas harus: ' + types.map(t => t.split('/')[1].toUpperCase()).join(', ') + '.'));
    if (file.size > 5 * 1048576) return rej(new Error('Ukuran berkas maksimal 5 MB.'));
    const r = new FileReader();
    r.onload = () => res({ name: file.name, mime: file.type, b64: String(r.result).split(',')[1] });
    r.onerror = () => rej(new Error('Gagal membaca berkas.'));
    r.readAsDataURL(file);
  });
}
function downloadB64(name, b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function copyText(t) {
  try { navigator.clipboard.writeText(t).then(() => toast('Disalin.'), () => fallbackCopy(t)); } catch (e) { fallbackCopy(t); }
}
function fallbackCopy(t) { const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); toast('Disalin.'); } catch (e) { toast('Salin manual: ' + t, 'warn'); } x.remove(); }

/* ---------- Header, footer, navigasi ---------- */
const NAV = [
  { id: 'home', l: 'Beranda' },
  { l: 'Profil', children: [
    { id: 'profil', focus: 'sejarah', l: 'Profil & Sejarah' }, { id: 'profil', focus: 'visimisi', l: 'Visi & Misi' },
    { id: 'profil', focus: 'tupoksi', l: 'Tugas & Fungsi' }, { id: 'struktur', l: 'Struktur Organisasi' }, { id: 'pegawai', l: 'Pejabat & Pegawai' }] },
  { id: 'berita', l: 'Berita & Pengumuman' },
  { id: 'agenda', l: 'Agenda' },
  { id: 'regulasi', l: 'Regulasi' },
  { l: 'SIDIKAPET', children: [
    { id: 'sidikapet', l: 'Tentang & Alur', m: 'SIDIKAPET (Tiket Kapal)' }, { id: 'tk-pesan', l: 'Pesan Tiket', m: 'Pesan Tiket Kapal' },
    { id: 'tk-cek', l: 'Cek Tiket', m: 'Cek Tiket Kapal' }, { id: 'tk-jadwal', l: 'Jadwal & Tarif', m: 'Jadwal & Tarif Kapal' }] },
  { id: 'pengaduan', l: 'Pengaduan' },
  { id: 'survei', l: 'Survei Layanan' },
  { id: 'kontak', l: 'Kontak' }
];
const navAttr = n => 'data-nav="' + n.id + '"' + (n.focus ? ' data-focus="' + n.focus + '"' : '');
const PAGE_GROUP = { profil: 'Profil', struktur: 'Profil', pegawai: 'Profil', beritaDetail: 'berita', sidikapet: 'SIDIKAPET', 'tk-pesan': 'SIDIKAPET', 'tk-cek': 'SIDIKAPET', 'tk-jadwal': 'SIDIKAPET' };

function renderHeader() {
  const s = AppState.settings;
  const tag = n => n.tag ? '<span class="ml-1.5 bg-[#FFB95F] text-[#2a1700] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">' + esc(n.tag) + '</span>' : '';
  const desk = NAV.map(n => n.children
    ? '<div class="relative group"><button type="button" data-group="' + esc(n.l) + '" class="nav-link inline-flex items-center gap-1 py-2" aria-haspopup="true">' + esc(n.l) + ic('expand_more', '!text-[18px]') + '</button>' +
      '<div class="hidden group-hover:block group-focus-within:block absolute left-0 top-full w-60 bg-white border border-[#E2E8F0] rounded-lg shadow-lg py-2 z-50">' +
      n.children.map(c => '<a href="javascript:void(0)" ' + navAttr(c) + ' class="block px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface">' + esc(c.l) + '</a>').join('') + '</div></div>'
    : '<a href="javascript:void(0)" ' + navAttr(n) + ' class="nav-link py-2">' + esc(n.l) + tag(n) + '</a>').join('');
  $('#site-header').innerHTML =
    '<div class="bg-primary-container text-white text-[12px]"><div class="max-w-7xl mx-auto px-4 md:px-6 h-9 flex items-center justify-between gap-4">' +
    '<span class="flex items-center gap-1.5 truncate">' + ic('schedule', '!text-[15px] text-secondary-container') + esc(s.jam_layanan || '') + '</span>' +
    '<span class="hidden md:flex items-center gap-3">' + (s.telepon ? '<span class="flex items-center gap-1">' + ic('call', '!text-[15px] text-secondary-container') + esc(s.telepon) + '</span>' : '') +
    '<a href="javascript:void(0)" data-nav="login" class="inline-flex items-center gap-1 bg-secondary px-2.5 py-0.5 rounded hover:bg-secondary-container hover:text-on-secondary-container">' + ic('lock', '!text-[14px]') + 'Login Admin</a></span></div></div>' +
    '<div class="max-w-7xl mx-auto px-4 md:px-6 h-16 xl:h-[72px] flex items-center justify-between gap-4">' +
    '<a href="javascript:void(0)" data-nav="home" class="flex items-center gap-3 min-w-0"><span class="w-10 h-10 rounded bg-primary-container text-white flex items-center justify-center shrink-0">' + ic('anchor') + '</span>' +
    '<span class="flex flex-col min-w-0"><span class="font-headline font-bold text-primary-container leading-tight truncate text-[15px] md:text-base">' + esc((s.nama_bidang || 'Bidang Perairan dan Udara').toUpperCase()) + '</span>' +
    '<span class="text-[11px] text-on-surface-variant tracking-wider uppercase truncate">' + esc(s.nama_dinas || '') + '</span></span></a>' +
    '<nav aria-label="Menu utama" class="hidden xl:flex items-center gap-5">' + desk + '</nav>' +
    '<button type="button" data-act="menu" aria-label="Buka menu" class="xl:hidden p-2 rounded hover:bg-surface-container">' + ic('menu', '!text-[26px]') + '</button></div>';
}
function renderMobileMenu() {
  const items = NAV.reduce((a, n) => a.concat(n.children ? n.children : [n]), []);
  $('#mobile-menu').innerHTML =
    '<div class="flex items-center justify-between px-4 h-16 border-b border-[#E2E8F0]"><span class="font-headline font-bold text-primary-container">Menu</span><button type="button" data-act="menu-close" aria-label="Tutup menu" class="p-2 rounded hover:bg-surface-container">' + ic('close', '!text-[26px]') + '</button></div>' +
    '<div class="p-4 flex flex-col gap-1">' + items.map(n => '<a href="javascript:void(0)" ' + navAttr(n) + ' class="px-3 py-3 rounded text-[15px] font-semibold hover:bg-surface-container-low">' + esc(n.m || n.l) + (n.tag ? ' <span class="ml-1 bg-[#FFB95F] text-[10px] px-1.5 py-0.5 rounded uppercase">' + esc(n.tag) + '</span>' : '') + '</a>').join('') +
    '<a href="javascript:void(0)" data-nav="login" class="px-3 py-3 rounded text-[15px] font-semibold text-secondary hover:bg-surface-container-low">' + ic('lock', '!text-[18px]') + ' Login Admin</a></div>';
}
function openMobileMenu() { $('#mobile-menu').classList.remove('hidden'); }
function closeMobileMenu() { $('#mobile-menu').classList.add('hidden'); }
function renderBottomNav() {
  const it = [['home', 'home', 'Beranda'], ['tk-pesan', 'confirmation_number', 'Tiket'], ['pengaduan', 'campaign', 'Aduan'], ['survei', 'star_rate', 'SKM']];
  $('#bottom-nav').innerHTML = '<div class="flex justify-around items-center h-16 px-2">' +
    it.map(x => '<a href="javascript:void(0)" data-nav="' + x[0] + '" class="bn-item">' + ic(x[1]) + '<span>' + x[2] + '</span></a>').join('') +
    '<button type="button" data-act="menu" class="bn-item">' + ic('menu') + '<span>Menu</span></button></div>';
}
function renderFooter() {
  const s = AppState.settings;
  const row = (i, t) => t ? '<p class="flex items-start gap-2.5">' + ic(i, '!text-[18px] text-secondary-container mt-0.5 shrink-0') + '<span>' + esc(t) + '</span></p>' : '';
  $('#site-footer').innerHTML = '<div class="bg-primary-container text-[#f0f3ff] mt-14"><div class="max-w-7xl mx-auto px-4 md:px-6 py-12 grid gap-8 md:grid-cols-3">' +
    '<div><div class="font-headline font-bold text-white text-lg">' + esc(s.nama_bidang || '') + '</div><div class="text-sm text-on-primary-container mt-1">' + esc(s.nama_dinas || '') + '</div>' +
    '<p class="text-sm text-[#c3c6ce] mt-3 leading-relaxed">Informasi resmi, layanan, pengaduan, dan survei kepuasan masyarakat.</p></div>' +
    '<div class="space-y-2 text-sm text-[#c3c6ce]"><h3 class="font-headline font-semibold text-white mb-2">Kontak</h3>' + row('location_on', s.alamat) + row('call', s.telepon) + row('chat', s.whatsapp) + row('mail', s.email_kontak) + row('schedule', s.jam_layanan) + '</div>' +
    '<div><h3 class="font-headline font-semibold text-white mb-2">Pintasan</h3><ul class="space-y-1.5 text-sm text-[#c3c6ce]">' +
    [['regulasi', 'Regulasi'], ['sidikapet', 'SIDIKAPET'], ['tk-pesan', 'Pesan Tiket Kapal'], ['pengaduan', 'Pengaduan'], ['survei', 'Survei Layanan'], ['berita', 'Berita & Pengumuman'], ['agenda', 'Agenda'], ['login', 'Login Admin']]
      .map(x => '<li><a href="javascript:void(0)" data-nav="' + x[0] + '" class="hover:text-white">' + x[1] + '</a></li>').join('') + '</ul></div></div>' +
    '<div class="border-t border-white/10 text-center text-xs text-[#c3c6ce] py-4 px-4">&copy; ' + new Date().getFullYear() + ' ' + esc(s.nama_dinas || '') + '. Seluruh hak dilindungi.</div></div>';
}
function updateActiveNav(page) {
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page && !a.dataset.focus));
  $$('[data-group]').forEach(b => b.classList.toggle('active', PAGE_GROUP[page] === b.dataset.group));
  $$('.bn-item[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === page));
}
function setShell(page) {
  const hide = page.indexOf('admin-') === 0 || page === 'login';
  ['site-header', 'site-footer', 'bottom-nav'].forEach(id => $('#' + id).classList.toggle('hidden', hide));
  $('#app-container').classList.toggle('pb-20', !hide);
}

/* ---------- Router SPA ---------- */
function showLoading() {
  $('#app-container').innerHTML = '<div class="max-w-7xl mx-auto px-4 md:px-6 py-14 space-y-4"><div class="skeleton h-10 w-2/3"></div><div class="skeleton h-40"></div><div class="grid md:grid-cols-3 gap-4"><div class="skeleton h-40"></div><div class="skeleton h-40"></div><div class="skeleton h-40"></div></div></div>';
}
async function navigateTo(page, opts) {
  opts = opts || {}; const params = opts.params || {};
  if (page.indexOf('admin-') === 0 && !AppState.token) page = 'login';
  if (AppState.page && !opts.noHistory) AppState.history.push({ page: AppState.page, params: AppState.params });
  const seq = ++AppState.navSeq;
  showLoading();
  try {
    const fn = ROUTES[page];
    if (!fn) throw new Error('Halaman tidak ditemukan.');
    const out = await fn(params);
    if (seq !== AppState.navSeq) return;
    setShell(page);
    $('#app-container').innerHTML = out.html;
    AppState.page = page; AppState.params = params;
    updateActiveNav(page);
    if (out.init) out.init();
    window.scrollTo(0, 0);
    if (params.focus) { const t = document.getElementById('sec-' + params.focus); if (t) t.scrollIntoView(); }
  } catch (e) {
    if (e.message === 'SESI' || seq !== AppState.navSeq) return;
    setShell('home');
    $('#app-container').innerHTML = wrap('<div class="' + CARD + ' p-8 text-center"><div class="text-error">' + ic('error', '!text-[40px]') + '</div><h2 class="font-headline text-xl font-bold mt-2">Halaman tidak dapat dimuat</h2><p class="text-on-surface-variant mt-1">' + esc(e.message) + '</p><button type="button" class="' + BTN_P + ' mt-5" data-nav="' + esc(page) + '">' + ic('refresh') + ' Coba lagi</button></div>');
  }
}
function goBack() { const h = AppState.history.pop(); if (h) navigateTo(h.page, { params: h.params, noHistory: true }); else navigateTo('home', { noHistory: true }); }
function forceLogout(msg) {
  AppState.token = null; AppState.adminName = ''; AppState.cache = {};
  if (msg) toast(msg, 'warn');
  navigateTo('login', { noHistory: true });
}
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]');
  if (n) { e.preventDefault(); closeMobileMenu(); navigateTo(n.dataset.nav, { params: Object.assign({}, n.dataset.id ? { id: n.dataset.id } : {}, n.dataset.focus ? { focus: n.dataset.focus } : {}, n.dataset.tab ? { tab: n.dataset.tab } : {}) }); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  if (act === 'menu') { renderMobileMenu(); openMobileMenu(); }
  else if (act === 'menu-close') closeMobileMenu();
  else if (act === 'close-modal') closeModal();
  else if (act === 'back') goBack();
  else if (act === 'copy') copyText(a.dataset.v);
  else if (act === 'share') { try { navigator.share({ title: a.dataset.t, url: a.dataset.u }).catch(() => { }); } catch (x) { copyText(a.dataset.u); } }
  else if (act === 'skip') $('#app-container').focus();
  else if (act === 'logout') { adm('adminLogout').catch(() => { }).then(() => { AppState.token = null; AppState.adminName = ''; AppState.cache = {}; toast('Anda telah keluar.'); navigateTo('login', { noHistory: true }); }); }
});

/* =====================================================================
   HALAMAN PUBLIK
   ===================================================================== */
// Beranda tampil seketika (judul & kerangka), lalu data dari server mengisi bagian yang menunggu.
// Data terakhir disimpan di peramban agar kunjungan berikutnya langsung lengkap.
const HOME_DEF = { hero_judul: 'Pelayanan Transportasi Perairan dan Udara Kota Balikpapan', hero_deskripsi: 'Informasi resmi, layanan, pengaduan, dan survei kepuasan masyarakat Bidang Perairan dan Udara.' };
const newsSkeleton = () => '<div class="' + CARD + ' overflow-hidden"><div class="skeleton h-44 !rounded-none"></div><div class="p-5 space-y-2"><div class="skeleton h-4 w-1/3"></div><div class="skeleton h-5 w-5/6"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-2/3"></div></div></div>';
function homeHtml(d, loading) {
  const s = Object.assign({}, HOME_DEF, AppState.settings, d.settings || {});
  const sv = d.survei || {}, ad = d.aduan || {};
  const stat = (i, v, l) => '<div class="' + CARD + ' p-5 flex items-center gap-4"><div class="w-12 h-12 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center shrink-0">' + ic(i) + '</div><div><div class="font-headline text-2xl font-bold text-primary-container">' + v + '</div><div class="text-sm text-on-surface-variant">' + l + '</div></div></div>';
  const html =
    '<section class="bg-primary-container text-white relative overflow-hidden"><div class="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-secondary-container/10 blur-3xl"></div>' +
    '<div class="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-20 relative"><div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] items-center"><div><h1 class="font-headline text-3xl md:text-5xl font-extrabold max-w-3xl leading-tight">' + esc(s.hero_judul) + '</h1>' +
    '<p class="mt-4 text-[#d1e4ff] max-w-2xl text-lg">' + esc(s.hero_deskripsi) + '</p>' +
    '<div class="flex flex-wrap gap-3 mt-8"><button type="button" data-nav="tk-pesan" class="' + BTN_A + '">' + ic('confirmation_number') + ' Pesan Tiket Kapal</button>' +
    '<button type="button" data-nav="pengaduan" class="' + BTN + ' bg-white/10 text-white hover:bg-white/20">' + ic('campaign') + ' Lapor Pengaduan</button>' +
    '<button type="button" data-nav="pengaduan" data-tab="track" class="' + BTN + ' bg-white/10 text-white hover:bg-white/20">' + ic('travel_explore') + ' Lacak Pengaduan</button>' +
    '<button type="button" data-nav="survei" class="' + BTN + ' bg-secondary text-white hover:bg-[#00507b]">' + ic('star_rate') + ' Isi Survei</button></div></div>' + agendaPanel(d.agenda, loading) + '</div></div></section>' +
    wrap(
      '<div class="grid gap-4 md:grid-cols-2 -mt-16 md:-mt-20 mb-12 relative">' +
      stat('sentiment_satisfied', loading ? '&hellip;' : sv.n ? sv.rata.toFixed(2) + ' <span class="text-base font-normal text-outline">/ 5</span>' : '&ndash;', loading ? 'Memuat data...' : sv.n ? 'Indeks kepuasan (' + sv.n + ' responden)' : 'Belum ada survei masuk') +
      stat('task_alt', loading ? '&hellip;' : ad.total ? Math.round(ad.selesai / ad.total * 100) + '%' : '&ndash;', loading ? 'Memuat data...' : ad.total ? 'Pengaduan telah selesai (' + ad.selesai + ' dari ' + ad.total + ')' : 'Belum ada pengaduan') +
      ''+ '</div>' +
      '<div class="' + CARD + ' p-6 md:p-8 mb-14 grid gap-6 md:grid-cols-[1fr_auto] items-center bg-gradient-to-r from-primary-fixed/40 to-white"><div><span class="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-bold uppercase">' + ic('hub', '!text-[16px]') + ' Sistem terintegrasi</span>' +
      '<h2 class="font-headline text-2xl font-bold text-primary-container mt-3">SIDIKAPET</h2><p class="text-on-surface-variant mt-1 max-w-2xl">Sistem Informasi Digital Data Kapal, Penumpang, dan Tiket Terintegrasi. Pesan tiket kapal secara online, cek tiket, serta pendataan kapal dan penumpang.</p></div>' +
      '<div class="flex flex-wrap gap-3"><button type="button" data-nav="tk-pesan" class="' + BTN_P + '">' + ic('confirmation_number', '!text-[18px]') + ' Pesan tiket</button><button type="button" data-nav="tk-cek" class="' + BTN_S + '">' + ic('manage_search', '!text-[18px]') + ' Cek tiket</button></div></div>' +
      '<div class="flex items-end justify-between mb-6"><h2 class="font-headline text-2xl font-bold text-primary-container">Berita & Pengumuman</h2><button type="button" data-nav="berita" class="text-secondary font-semibold text-sm hover:underline">Lihat semua</button></div>' +
      '<div class="grid gap-6 md:grid-cols-3">' + (loading ? newsSkeleton() + newsSkeleton() + newsSkeleton() : (d.berita || []).length ? d.berita.map(newsCard).join('') : emptyBox('newspaper', 'Belum ada berita.')) + '</div>');
  return html;
}
async function renderHome() {
  const hit = AppState.cache['home{}'], segar = hit && Date.now() - hit.t < 120000;
  let awal = hit ? hit.d : null;
  if (!awal) { try { awal = JSON.parse(localStorage.getItem('home_cache') || 'null'); } catch (e) { awal = null; } }
  return { html: homeHtml(awal || {}, !awal), init: () => {
    if (segar) return;
    pub('home', {}, 0).then(d => {
      try { localStorage.setItem('home_cache', JSON.stringify(d)); } catch (e) { /* abaikan */ }
      AppState.settings = Object.assign({}, AppState.settings, d.settings);
      if (AppState.page !== 'home') return;
      $('#app-container').innerHTML = homeHtml(d, false); renderShell();
    }).catch(e => {
      if (AppState.page !== 'home' || awal) return;
      $('#app-container').innerHTML = homeHtml({ berita: [], agenda: [], survei: {}, aduan: {} }, false); toast('Data beranda gagal dimuat. Muat ulang halaman.', 'error');
    });
  } };
}
// Agenda kegiatan: kotak tanggal + rincian. Rentang beberapa hari ditampilkan "12 Okt - 14 Okt 2026".
function agendaRange(a) {
  if (!a.selesai || a.selesai === a.tanggal) return fmtDate(a.tanggal);
  const s = fmtDate(a.tanggal).split(' '), e = fmtDate(a.selesai).split(' ');
  return (s[2] === e[2] && s[1] === e[1]) ? s[0] + ' - ' + e[0] + ' ' + e[1] + ' ' + e[2] : fmtDate(a.tanggal) + ' - ' + fmtDate(a.selesai);
}
function agendaCard(a, lewat) {
  const m = String(a.tanggal).match(/^(\d{4})-(\d{2})-(\d{2})/), bulan = m ? MONTHS[+m[2] - 1].slice(0, 3) : '', hari = m ? +m[3] : '';
  const meta = (i, t) => t ? '<div class="flex items-start gap-1.5 text-sm text-on-surface-variant">' + ic(i, '!text-[18px] text-outline') + '<span>' + esc(t) + '</span></div>' : '';
  return '<article class="' + CARD + ' p-4 md:p-5 flex gap-4' + (lewat ? ' opacity-75' : '') + '"><div class="w-16 shrink-0 rounded-lg ' + (lewat ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary-container text-white') + ' flex flex-col items-center justify-center py-2"><span class="font-headline text-2xl font-extrabold leading-none">' + hari + '</span><span class="text-xs font-semibold uppercase mt-1">' + esc(bulan) + '</span></div>' +
    '<div class="min-w-0 flex-1 space-y-1"><h3 class="font-headline font-semibold text-primary-container">' + esc(a.judul) + '</h3>' +
    meta('event', agendaRange(a)) + meta('schedule', a.waktu) + meta('location_on', a.lokasi) +
    (a.deskripsi ? '<p class="text-sm text-on-surface-variant pt-1 whitespace-pre-line">' + esc(a.deskripsi) + '</p>' : '') + '</div></article>';
}
async function renderAgenda() {
  const d = await pub('agenda'), t = todayStr();
  const akan = d.items.filter(a => a.selesai >= t), lalu = d.items.filter(a => a.selesai < t).reverse();
  const html = wrap(sectionTitle('Kegiatan', 'Agenda', 'Jadwal kegiatan Bidang Perairan dan Udara.') +
    '<h3 class="font-headline text-lg font-bold text-primary-container mb-4">Akan Datang</h3>' +
    '<div class="grid gap-4 md:grid-cols-2 mb-10">' + (akan.length ? akan.map(a => agendaCard(a, false)).join('') : '<div class="md:col-span-2">' + emptyBox('event_busy', 'Belum ada agenda mendatang.') + '</div>') + '</div>' +
    (lalu.length ? '<h3 class="font-headline text-lg font-bold text-on-surface-variant mb-4">Sudah Lewat</h3><div class="grid gap-4 md:grid-cols-2">' + lalu.slice(0, 20).map(a => agendaCard(a, true)).join('') + '</div>' : ''));
  return { html: html };
}
// Panel "Agenda Terdekat" di sisi kanan hero beranda
function agendaPanel(list, loading) {
  list = list || [];
  const item = a => {
    const m = String(a.tanggal).match(/^(\d{4})-(\d{2})-(\d{2})/), bulan = m ? MONTHS[+m[2] - 1].slice(0, 3) : '', hari = m ? +m[3] : '';
    const info = [a.waktu, a.lokasi].filter(Boolean).join(' \u2022 ');
    return '<button type="button" data-nav="agenda" class="w-full flex gap-3 text-left rounded-lg p-2 -mx-2 hover:bg-white/10 transition-colors"><div class="w-12 shrink-0 rounded-lg bg-white/15 flex flex-col items-center justify-center py-1.5"><span class="font-headline text-xl font-extrabold leading-none">' + hari + '</span><span class="text-[11px] font-semibold uppercase mt-0.5">' + esc(bulan) + '</span></div>' +
      '<div class="min-w-0"><div class="font-semibold leading-snug">' + esc(a.judul) + '</div><div class="text-xs text-[#d1e4ff] mt-0.5">' + esc(agendaRange(a)) + (info ? ' &bull; ' + esc(info) : '') + '</div></div></button>';
  };
  return '<aside class="rounded-xl bg-white/10 border border-white/20 p-5 md:p-6 text-white" aria-label="Agenda terdekat"><div class="flex items-center justify-between mb-4"><h2 class="font-headline text-lg font-bold flex items-center gap-2">' + ic('event', '!text-[22px]') + ' Agenda Kegiatan</h2>' +
    '<button type="button" data-nav="agenda" class="text-sm font-semibold text-secondary-container hover:underline">Lihat semua</button></div>' +
    (list.length ? '<div class="space-y-3">' + list.map(item).join('') + '</div>' : '<p class="text-sm text-[#d1e4ff]">' + (loading ? 'Memuat agenda...' : 'Belum ada agenda mendatang.') + '</p>') + '</aside>';
}
function newsCard(b) {
  return '<article class="' + CARD + ' overflow-hidden flex flex-col hover:shadow-md transition-shadow"><div class="h-44 bg-surface-container-high flex items-center justify-center text-outline overflow-hidden">' +
    (b.foto ? '<img src="' + esc(b.foto) + '" alt="" loading="lazy" class="w-full h-full object-cover">' : ic('image', '!text-[40px]')) + '</div>' +
    '<div class="p-5 flex flex-col flex-1"><div class="flex items-center gap-2 text-xs text-on-surface-variant"><span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-semibold">' + esc(b.jenis) + '</span>' + esc(fmtDate(b.tanggal)) + '</div>' +
    '<h3 class="font-headline font-semibold text-primary-container mt-2 line-clamp-2">' + esc(b.judul) + '</h3><p class="text-sm text-on-surface-variant mt-1 line-clamp-3 flex-1">' + esc(b.ringkasan) + '</p>' +
    '<button type="button" data-nav="beritaDetail" data-id="' + esc(b.id) + '" class="text-secondary font-semibold text-sm mt-3 self-start hover:underline">Baca selengkapnya</button></div></article>';
}

async function renderProfil() {
  const d = await pub('profil');
  const sej = d.profil.filter(x => x.jenis === 'Sejarah'), prof = d.profil.filter(x => x.jenis === 'Profil');
  const blk = x => '<div class="prose-id text-on-surface-variant">' + (x.judul ? '<h3 class="font-headline font-semibold text-primary-container text-lg mb-2">' + esc(x.judul) + '</h3>' : '') + paras(x.isi) + '</div>';
  const list = a => a.length ? '<ol class="space-y-3">' + a.map((t, i) => '<li class="flex gap-3"><span class="w-7 h-7 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-bold text-sm flex items-center justify-center shrink-0">' + (i + 1) + '</span><span class="text-on-surface-variant pt-0.5">' + esc(t) + '</span></li>').join('') + '</ol>' : '<p class="text-outline">Belum diisi.</p>';
  const html = wrap(
    sectionTitle('Profil', 'Profil & Sejarah', d.settings.nama_bidang + ' ' + d.settings.nama_dinas) +
    '<div id="sec-sejarah" class="' + CARD + ' p-6 md:p-8 mb-8 space-y-6 scroll-mt-24">' + (prof.concat(sej).map(blk).join('') || '<p class="text-outline">Belum diisi.</p>') + '</div>' +
    '<div id="sec-visimisi" class="scroll-mt-24 mb-8"><div class="bg-primary-container text-white rounded-lg p-6 md:p-8 mb-6"><div class="text-secondary-container text-xs font-bold uppercase tracking-wider mb-2">Visi</div>' +
    (d.visi.length ? d.visi.map(v => '<p class="font-headline text-xl md:text-2xl font-bold leading-snug">' + esc(v) + '</p>').join('') : '<p class="text-[#c3c6ce]">Belum diisi.</p>') + '</div>' +
    '<div class="' + CARD + ' p-6 md:p-8"><h3 class="font-headline text-xl font-bold text-primary-container mb-4">Misi</h3>' + list(d.misi) + '</div></div>' +
    '<div id="sec-tupoksi" class="scroll-mt-24 grid gap-6 md:grid-cols-2"><div class="' + CARD + ' p-6 md:p-8"><h3 class="font-headline text-xl font-bold text-primary-container mb-4">Tugas Pokok</h3>' + list(d.tugas) + '</div>' +
    '<div class="' + CARD + ' p-6 md:p-8"><h3 class="font-headline text-xl font-bold text-primary-container mb-4">Fungsi</h3>' + list(d.fungsi) + '</div></div>');
  return { html: html };
}

const avatar = (p, size) => p.foto ? '<img src="' + esc(p.foto) + '" alt="Foto ' + esc(p.nama) + '" loading="lazy" class="' + size + ' rounded-full object-cover bg-surface-container">' : '<div class="' + size + ' rounded-full bg-surface-container-high text-outline flex items-center justify-center">' + ic('person', '!text-[28px]') + '</div>';
async function renderStruktur() {
  const d = await pub('struktur');
  const box = (p, lead) => '<div class="' + CARD + ' p-3 flex items-center gap-2 ' + (lead ? 'bg-primary-container !border-secondary-container/40 text-white' : '') + ' min-w-[168px] max-w-[200px]">' + avatar(p, 'w-9 h-9 shrink-0') +
    '<div class="min-w-0"><div class="text-[9.5px] uppercase tracking-wide ' + (lead ? 'text-secondary-fixed' : 'text-secondary') + ' font-bold leading-tight">' + esc(p.jabatan) + '</div><div class="font-headline font-semibold text-sm leading-snug">' + esc(p.nama) + '</div></div></div>';
  const by = k => d.pegawai.filter(p => p.kategori === k);
  const line = '<div class="w-0.5 h-6 bg-secondary mx-auto"></div>';
  const row = arr => '<div class="flex flex-wrap justify-center gap-4">' + arr.map(p => box(p)).join('') + '</div>';
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  // Satu baris staf (maks 3 orang) dengan garis penghubung per orang yang benar-benar tersambung
  // ke garis di atasnya: garis tengah turun, lalu bercabang rata ke tiap orang di baris itu.
  const combRow = arr => {
    if (arr.length === 1) return line + box(arr[0]);
    const kids = arr.map((p, i) => {
      const half = '<div class="absolute top-0 h-0.5 bg-secondary" style="' + (i === 0 ? 'left:50%;right:0' : i === arr.length - 1 ? 'left:0;right:50%' : 'left:0;right:0') + '"></div>';
      return '<div class="flex flex-col items-center relative px-2 shrink-0">' + half + '<div class="w-0.5 h-4 bg-secondary mx-auto"></div>' + box(p) + '</div>';
    }).join('');
    return line + '<div class="flex flex-nowrap justify-center">' + kids + '</div>';
  };
  // Staf dipecah jadi baris berisi maks 3 orang; tiap baris tersambung penuh (combRow), dan antar
  // baris disambung garis tengah yang menerus dari atas ke bawah — jadi seluruh staf tetap terhubung
  // ke Kasi meski jumlahnya banyak dan turun ke beberapa baris.
  const staffTree = arr => chunk(arr, 3).map(r => '<div class="flex flex-col items-center pt-4 first:pt-0">' + combRow(r) + '</div>').join('');
  const kabid = by(d.kategori[0]);
  const SEKSI_MAP = [[d.kategori[1], 'Kepelabuhanan dan Kebandarudaraan'], [d.kategori[2], 'ASDP']];
  const staf = by(d.kategori[3]);
  const stafOf = seksi => staf.filter(p => p.seksi === seksi);
  const stafLain = staf.filter(p => !SEKSI_MAP.some(x => x[1] === p.seksi));
  // Cabang (Kasi) disusun berdampingan (shrink-0: tidak boleh diperas jadi sempit) supaya garis
  // horizontal penghubung dari Kabid tetap tersambung, dan tiap cabang punya cukup ruang untuk stafnya.
  const cabangList = SEKSI_MAP.map(([kat, seksi]) => {
    const kasiOrang = by(kat), bawahan = stafOf(seksi);
    return (!kasiOrang.length && !bawahan.length) ? null : { kasiOrang, bawahan };
  }).filter(Boolean);
  const cabang = cabangList.map((c, i) => {
    // Separuh garis horizontal hanya tampil saat cabang berdampingan (layar cukup lebar, md ke atas).
    // Kalau ruang tidak cukup, cabang otomatis turun/susun ke bawah dan garis horizontal ini disembunyikan
    // supaya tidak terlihat terputus — tiap cabang tetap tergantung rapi dari garis tengah di atasnya.
    const half = cabangList.length > 1 ? '<div class="hidden md:block absolute top-0 h-0.5 bg-secondary" style="' + (i === 0 ? 'left:50%;right:0' : i === cabangList.length - 1 ? 'left:0;right:50%' : 'left:0;right:0') + '"></div>' : '';
    return '<div class="flex flex-col items-center relative px-5 shrink-0">' + half + line +
      (c.kasiOrang.length ? row(c.kasiOrang) : emptyBox('person_off', 'Kepala seksi belum diisi.')) +
      (c.bawahan.length ? '<div class="flex flex-col items-center">' + line + '<div class="pt-4">' + staffTree(c.bawahan) + '</div></div>' : '') + '</div>';
  }).join('');
  const html = wrap(sectionTitle('Profil', 'Struktur Organisasi', 'Bagan disusun otomatis dari data Pejabat & Pegawai. Staf dikelompokkan di bawah Kepala Seksi masing-masing.') +
    '<div class="' + CARD + ' p-4 md:p-6 overflow-x-auto"><div class="flex flex-col items-center w-max min-w-full gap-0">' +
    (kabid.length ? '<div class="flex justify-center">' + box(kabid[0], true) + '</div>' : '') +
    (cabangList.length ? line + '<div class="flex flex-col items-center gap-10 md:flex-row md:flex-nowrap md:items-start md:justify-center md:gap-0 pt-6">' + cabang + '</div>' : '') +
    (stafLain.length ? line + '<div class="w-full"><div class="text-center text-xs font-bold uppercase tracking-wider text-outline mb-3">Staf Lainnya</div><div class="flex flex-col items-center">' + staffTree(stafLain) + '</div></div>' : '') +
    (!d.pegawai.length ? '<p class="text-outline">Belum ada data.</p>' : '') + '</div></div>');
  return { html: html };
}
async function renderPegawai() {
  const d = await pub('struktur');
  const draw = () => {
    const q = ($('#pg-q') || {}).value ? $('#pg-q').value.toLowerCase() : '', k = ($('#pg-k') || {}).value || '';
    const rows = d.pegawai.filter(p => (!k || p.kategori === k) && (!q || (p.nama + ' ' + p.jabatan).toLowerCase().indexOf(q) >= 0));
    $('#pg-list').innerHTML = rows.length ? rows.map(p => '<div class="' + CARD + ' p-5 flex flex-col items-center text-center">' + avatar(p, 'w-24 h-24') + '<div class="text-[11px] uppercase font-bold text-secondary mt-3">' + esc(p.jabatan) + '</div><h3 class="font-headline font-semibold text-primary-container leading-snug">' + esc(p.nama) + '</h3></div>').join('') : '<div class="col-span-full">' + emptyBox('person_search', 'Tidak ada data yang cocok.') + '</div>';
  };
  const html = wrap(sectionTitle('Profil', 'Pejabat Struktural & Pegawai', 'Daftar aparatur Bidang Perairan dan Udara.') +
    '<div class="grid gap-3 md:grid-cols-[1fr_280px] mb-6"><input id="pg-q" class="' + INP + '" placeholder="Cari nama atau jabatan..." aria-label="Cari pegawai"><select id="pg-k" class="' + INP + '" aria-label="Filter kategori"><option value="">Semua kategori</option>' + d.kategori.map(k => '<option>' + esc(k) + '</option>').join('') + '</select></div>' +
    '<div id="pg-list" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"></div>');
  return { html: html, init: () => { draw(); $('#pg-q').addEventListener('input', draw); $('#pg-k').addEventListener('change', draw); } };
}

async function renderBerita() {
  const d = await pub('berita');
  const draw = () => {
    const q = $('#bt-q').value.toLowerCase(), j = $('#bt-j').value;
    const rows = d.items.filter(b => (!j || b.jenis === j) && (!q || (b.judul + ' ' + b.ringkasan).toLowerCase().indexOf(q) >= 0));
    $('#bt-list').innerHTML = rows.length ? rows.map(newsCard).join('') : '<div class="col-span-full">' + emptyBox('newspaper', 'Tidak ada berita yang cocok.') + '</div>';
  };
  const html = wrap(sectionTitle('Publikasi', 'Berita & Pengumuman', 'Informasi resmi dari Bidang Perairan dan Udara.') +
    '<div class="grid gap-3 md:grid-cols-[1fr_220px] mb-6"><input id="bt-q" class="' + INP + '" placeholder="Cari judul atau isi..." aria-label="Cari berita"><select id="bt-j" class="' + INP + '" aria-label="Jenis"><option value="">Semua jenis</option><option>Berita</option><option>Pengumuman</option></select></div>' +
    '<div id="bt-list" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3"></div>');
  return { html: html, init: () => { draw(); $('#bt-q').addEventListener('input', draw); $('#bt-j').addEventListener('change', draw); } };
}
async function renderBeritaDetail(p) {
  const r = await api('apiPublic', 'beritaDetail', { id: p.id }); const b = r.data;
  return { html: wrap('<button type="button" data-act="back" class="' + BTN_S + ' mb-6">' + ic('arrow_back', '!text-[18px]') + ' Kembali</button>' +
    '<article class="max-w-3xl mx-auto"><div class="flex items-center gap-2 text-sm text-on-surface-variant"><span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-semibold text-xs">' + esc(b.jenis) + '</span>' + esc(fmtDate(b.tanggal)) + ' &bull; ' + b.dibaca + 'x dibaca</div>' +
    '<h1 class="font-headline text-3xl font-bold text-primary-container mt-3">' + esc(b.judul) + '</h1>' +
    (b.foto ? '<img src="' + esc(b.foto) + '" alt="" class="block max-w-full h-auto mx-auto rounded-lg mt-6">' : '') +
    '<div class="prose-id text-on-surface mt-6">' + paras(b.isi) + '</div>' + shareBar(p.id, b.judul) + '</article>') };
}
// Tombol bagikan: WhatsApp, Facebook, Telegram, X, salin tautan (+ menu bagikan bawaan HP bila tersedia)
function shareUrl(id) { const base = location.origin + location.pathname; return base ? base + '?berita=' + encodeURIComponent(id) : ''; }
function shareBar(id, judul) {
  const u = shareUrl(id); if (!u) return '';
  const q = encodeURIComponent(judul + '\n' + u), eu = encodeURIComponent(u), et = encodeURIComponent(judul);
  const lnk = (href, label, icon) => '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="' + BTN_S + '">' + ic(icon, '!text-[18px]') + ' ' + label + '</a>';
  return '<div class="mt-10 pt-6 border-t border-outline-variant"><p class="font-semibold text-primary-container mb-3">Bagikan berita ini</p><div class="flex flex-wrap gap-2">' +
    (navigator.share ? '<button type="button" data-act="share" data-u="' + esc(u) + '" data-t="' + esc(judul) + '" class="' + BTN_P + '">' + ic('share', '!text-[18px]') + ' Bagikan</button>' : '') +
    lnk('https://wa.me/?text=' + q, 'WhatsApp', 'chat') +
    lnk('https://www.facebook.com/sharer/sharer.php?u=' + eu, 'Facebook', 'thumb_up') +
    lnk('https://t.me/share/url?url=' + eu + '&text=' + et, 'Telegram', 'send') +
    lnk('https://twitter.com/intent/tweet?url=' + eu + '&text=' + et, 'X', 'alternate_email') +
    '<button type="button" data-act="copy" data-v="' + esc(u) + '" class="' + BTN_S + '">' + ic('link', '!text-[18px]') + ' Salin tautan</button></div></div>';
}

async function renderRegulasi() {
  const d = await pub('regulasi');
  const jenis = Array.from(new Set(d.regulasi.map(r => r.jenis).filter(Boolean)));
  const drawReg = () => {
    const q = $('#rg-q').value.toLowerCase(), j = $('#rg-j').value;
    const rows = d.regulasi.filter(r => (!j || r.jenis === j) && (!q || (r.nomor + ' ' + r.tahun + ' ' + r.judul).toLowerCase().indexOf(q) >= 0));
    $('#rg-list').innerHTML = rows.length ? '<div class="' + CARD + ' overflow-hidden"><table class="stack w-full text-sm text-left"><thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant"><tr><th class="p-3">Jenis & Nomor</th><th class="p-3">Tahun</th><th class="p-3">Judul</th><th class="p-3 text-right">Berkas</th></tr></thead><tbody class="divide-y divide-[#F1F5F9]">' +
      rows.map(r => '<tr><td data-l="Jenis & Nomor" class="p-3 font-semibold text-primary-container">' + esc(r.jenis) + ' ' + esc(r.nomor) + '</td><td data-l="Tahun" class="p-3">' + esc(r.tahun) + '</td><td data-l="Judul" class="p-3">' + esc(r.judul) + '</td><td data-l="Berkas" class="p-3 text-right whitespace-nowrap">' +
        (r.unduh ? '<a href="' + esc(r.lihat) + '" target="_blank" rel="noopener noreferrer" class="text-secondary font-semibold hover:underline mr-3">Lihat</a><a href="' + esc(r.unduh) + '" target="_blank" rel="noopener noreferrer" class="' + BTN_P + ' !min-h-[36px] !px-3">' + ic('download', '!text-[16px]') + ' Unduh</a>' : '<span class="text-outline">-</span>') + '</td></tr>').join('') + '</tbody></table></div>' : emptyBox('gavel', 'Belum ada regulasi yang cocok.');
  };
  const html = wrap(sectionTitle('Layanan Publik', 'Regulasi', 'Produk hukum Bidang Perairan dan Udara.') +
    '<div class="grid gap-3 md:grid-cols-[1fr_220px] mb-5"><input id="rg-q" class="' + INP + '" placeholder="Cari nomor, tahun, atau judul..." aria-label="Cari regulasi"><select id="rg-j" class="' + INP + '" aria-label="Jenis regulasi"><option value="">Semua jenis</option>' + jenis.map(j => '<option>' + esc(j) + '</option>').join('') + '</select></div><div id="rg-list"></div>');
  return { html: html, init: () => {
    drawReg(); $('#rg-q').addEventListener('input', drawReg); $('#rg-j').addEventListener('change', drawReg);
  } };
}

/* ---------- Pengaduan ---------- */
async function renderPengaduan(p) {
  const d = await pub('pengaduan'); let tab = p.tab === 'track' ? 'track' : 'form';
  const form = '<form id="aduan-form" class="' + CARD + ' p-6 md:p-8 space-y-5" novalidate>' +
    '<div class="grid gap-5 md:grid-cols-2">' + field('Nama lengkap <span class="text-error">*</span>', '<input name="nama" class="' + INP + '" maxlength="80" required autocomplete="name">') +
    field('No. HP / WhatsApp <span class="text-error">*</span>', '<input name="kontak" type="tel" class="' + INP + '" maxlength="20" required autocomplete="tel" placeholder="08xxxxxxxxxx">') + '</div>' +
    '<div class="grid gap-5 md:grid-cols-2">' + field('Email (opsional)', '<input name="email" type="email" class="' + INP + '" maxlength="100" autocomplete="email">', 'Diisi bila ingin menerima tanda terima dan pembaruan lewat email.') +
    field('Kategori <span class="text-error">*</span>', '<select name="kategori" class="' + INP + '" required><option value="">Pilih kategori</option>' + d.kategori.map(k => '<option>' + esc(k) + '</option>').join('') + '</select>') + '</div>' +
    field('Uraian pengaduan <span class="text-error">*</span>', '<textarea name="isi" rows="6" class="' + INP + '" maxlength="3000" required placeholder="Jelaskan waktu, lokasi, dan kronologi kejadian."></textarea>', 'Minimal 25 karakter. <span id="isi-count">0</span>/3000') +
    field('Lampiran foto / PDF (opsional)', '<input name="file" type="file" accept="image/jpeg,image/png,application/pdf" class="' + INP + ' file:mr-3 file:rounded file:border-0 file:bg-surface-container file:px-3 file:py-1.5">', 'JPG, PNG, atau PDF. Maksimal 5 MB.') +
    '<input name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true">' +
    '<div class="bg-surface-container-low rounded-lg p-4 flex gap-3 text-sm text-on-surface-variant">' + ic('verified_user', 'text-secondary shrink-0') + '<p><b class="text-on-surface">Kerahasiaan identitas.</b> Data kontak hanya dapat dilihat petugas berwenang dan tidak ditampilkan pada pelacakan tiket.</p></div>' +
    '<div id="aduan-err" class="hidden text-sm text-error font-semibold" role="alert"></div>' +
    '<button type="submit" class="' + BTN_P + ' w-full md:w-auto">' + ic('send', '!text-[18px]') + ' Kirim Pengaduan</button></form>';
  const track = '<div class="' + CARD + ' p-6 md:p-8 max-w-3xl"><form id="track-form" class="flex flex-col sm:flex-row gap-3" novalidate><input id="track-q" class="' + INP + ' uppercase tracking-wider" placeholder="ADU-20260928-001-AB12" aria-label="Nomor tiket" maxlength="30"><button type="submit" class="' + BTN_P + ' shrink-0">' + ic('search', '!text-[18px]') + ' Lacak</button></form><div id="track-out" class="mt-6"></div></div>';
  const html = wrap(sectionTitle('Kanal Pengaduan', 'Pengaduan Masyarakat', 'Sampaikan pengaduan tanpa perlu login, lalu pantau tindak lanjutnya dengan nomor tiket.') +
    '<div class="flex gap-2 mb-6" role="tablist"><button type="button" role="tab" data-tabbtn="form" class="' + BTN + '">' + ic('campaign', '!text-[18px]') + ' Kirim Pengaduan</button><button type="button" role="tab" data-tabbtn="track" class="' + BTN + '">' + ic('travel_explore', '!text-[18px]') + ' Lacak Tiket</button></div>' +
    '<div id="tab-form">' + form + '</div><div id="tab-track">' + track + '</div>');
  return { html: html, init: () => {
    const setTab = t => { $('#tab-form').classList.toggle('hidden', t !== 'form'); $('#tab-track').classList.toggle('hidden', t !== 'track'); $$('[data-tabbtn]').forEach(b => { const on = b.dataset.tabbtn === t; b.className = (on ? BTN_P : BTN_S); b.setAttribute('aria-selected', on); }); };
    $$('[data-tabbtn]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tabbtn))); setTab(tab);
    const f = $('#aduan-form');
    f.isi.addEventListener('input', () => { $('#isi-count').textContent = f.isi.value.length; });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('#aduan-err'); err.classList.add('hidden');
      const show = m => { err.textContent = m; err.classList.remove('hidden'); };
      if (!f.nama.value.trim() || !f.kontak.value.trim() || !f.kategori.value) return show('Nama, kontak, dan kategori wajib diisi.');
      if (!/^[0-9+\-\s]{8,20}$/.test(f.kontak.value.trim())) return show('Nomor HP tidak valid.');
      if (f.isi.value.trim().length < 25) return show('Uraian minimal 25 karakter.');
      const btn = f.querySelector('button[type=submit]');
      try {
        await withBusy(btn, async () => {
          const file = await readFile(f.file.files[0], ['image/jpeg', 'image/png', 'application/pdf']);
          const r = await api('submitPengaduan', { nama: f.nama.value, kontak: f.kontak.value, email: f.email.value, kategori: f.kategori.value, isi: f.isi.value, file: file, website: f.website.value, cid: AppState.cid });
          const t = r.data.tiket; f.reset(); $('#isi-count').textContent = '0';
          openModal('<div class="p-8 text-center space-y-4"><div class="w-16 h-16 rounded-full bg-[#ECFDF5] text-[#047857] flex items-center justify-center mx-auto">' + ic('check_circle', '!text-[36px]') + '</div><h3 class="font-headline text-2xl font-bold text-primary-container">Pengaduan terkirim</h3><p class="text-on-surface-variant">Simpan nomor tiket berikut untuk melacak status.</p>' +
            '<div class="bg-surface-container-low rounded-lg p-4 flex items-center justify-center gap-3"><span class="font-headline text-xl font-bold text-primary-container tracking-wide break-all">' + esc(t) + '</span><button type="button" data-act="copy" data-v="' + esc(t) + '" class="p-2 rounded hover:bg-surface-container" aria-label="Salin nomor tiket">' + ic('content_copy') + '</button></div>' +
            '<div class="flex gap-3 justify-center flex-wrap"><button type="button" class="' + BTN_P + '" data-act="close-modal" data-nav="pengaduan" data-tab="track">Lacak tiket ini</button><button type="button" class="' + BTN_S + '" data-act="close-modal">Tutup</button></div></div>');
          $('#track-q').value = t;
        });
      } catch (x) { show(x.message); }
    });
    $('#track-form').addEventListener('submit', async e => {
      e.preventDefault(); const out = $('#track-out'), q = $('#track-q').value.trim();
      if (!q) return; const btn = e.target.querySelector('button');
      try {
        await withBusy(btn, async () => {
          const r = await api('apiPublic', 'cekTiket', { tiket: q, cid: AppState.cid }); const t = r.data;
          const step = (on, label, sub) => '<div class="flex items-start gap-3"><span class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 ' + (on ? 'bg-secondary text-white' : 'bg-surface-container-high text-outline') + '">' + ic(on ? 'check' : 'more_horiz', '!text-[16px]') + '</span><div><div class="font-semibold text-sm">' + label + '</div><div class="text-xs text-on-surface-variant">' + sub + '</div></div></div>';
          const idx = ['Diterima', 'Diproses', 'Selesai'].indexOf(t.status);
          out.innerHTML = '<div class="border border-[#E2E8F0] rounded-lg overflow-hidden"><div class="p-4 bg-surface-container-low flex flex-wrap items-center justify-between gap-3"><div><div class="font-headline font-bold text-primary-container break-all">' + esc(t.tiket) + '</div><div class="text-xs text-on-surface-variant">' + esc(t.kategori) + ' &bull; diajukan ' + esc(fmtDateTime(t.tanggal)) + '</div></div>' + statusBadge(t.status) + '</div>' +
            '<div class="p-5 space-y-4">' + step(idx >= 0, 'Tiket diterima', 'Pengaduan tercatat di sistem') + step(idx >= 1, 'Sedang diproses', 'Ditindaklanjuti petugas') + step(idx >= 2, 'Selesai', 'Penanganan tuntas') +
            (t.balasan ? '<div class="bg-secondary-fixed/40 rounded-lg p-4 text-sm"><div class="font-semibold text-primary-container mb-1">Tanggapan petugas' + (t.tanggal_balasan ? ' <span class="font-normal text-on-surface-variant">(' + esc(fmtDateTime(t.tanggal_balasan)) + ')</span>' : '') + '</div>' + paras(t.balasan) + '</div>' : '') + '</div></div>';
        });
      } catch (x) { out.innerHTML = '<div class="rounded-lg bg-error-container text-on-error-container p-4 text-sm" role="alert">' + esc(x.message) + '</div>'; }
    });
  } };
}

/* ---------- Survei ---------- */
const RATE_LABEL = ['', 'Sangat kurang', 'Kurang', 'Cukup', 'Baik', 'Sangat baik'];
const ASPEK = [['respon', 'bolt', 'Kecepatan respon pelayanan'], ['prosedur', 'fact_check', 'Kemudahan prosedur & persyaratan'], ['sikap', 'sentiment_satisfied', 'Kesopanan & keramahan petugas'], ['transparansi', 'visibility', 'Transparansi & bebas pungutan liar']];
const starRow = (k, icon, label) => '<div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-container-low/60 rounded-lg p-4"><div class="flex items-center gap-2 font-semibold text-sm">' + ic(icon, 'text-secondary !text-[20px]') + label + '</div>' +
  '<div class="flex items-center gap-1" data-star="' + k + '" data-val="0" role="radiogroup" aria-label="' + esc(label) + '">' + [1, 2, 3, 4, 5].map(i => '<button type="button" class="star-btn" data-v="' + i + '" role="radio" aria-checked="false" aria-label="' + i + ' dari 5">' + ic('star') + '</button>').join('') + '<span class="text-xs font-semibold text-on-surface-variant w-24 pl-2" data-lbl>Belum dinilai</span></div></div>';
async function renderSurvei() {
  const d = await pub('survei', {}, 30000), r = d.rekap;
  const dist = r.dist.map((c, i) => '<div class="flex items-center gap-3 text-sm"><span class="w-16 shrink-0">' + (i + 1) + ' bintang</span><div class="flex-1 h-3 rounded-full bg-surface-container-high overflow-hidden"><div class="h-full bg-secondary" style="width:' + (r.n ? c / r.n * 100 : 0) + '%"></div></div><span class="w-10 text-right font-semibold">' + c + '</span></div>').reverse().join('');
  const html = wrap(sectionTitle('Akuntabilitas Layanan', 'Survei Kepuasan Layanan', 'Tanpa login, kurang dari 2 menit. Penilaian Anda bersifat anonim.') +
    '<div class="grid gap-6 lg:grid-cols-[1.4fr_1fr] items-start"><form id="svy-form" class="' + CARD + ' p-6 md:p-8 space-y-6" novalidate>' +
    field('1. Layanan yang dinilai <span class="text-error">*</span>', '<select name="layanan" class="' + INP + '">' + d.layanan.map(l => '<option>' + esc(l) + '</option>').join('') + '</select>') +
    '<div class="space-y-3"><div class="text-sm font-semibold">2. Penilaian (1 = sangat kurang, 5 = sangat baik) <span class="text-error">*</span></div>' + ASPEK.map(a => starRow(a[0], a[1], a[2])).join('') + '</div>' +
    field('3. Saran & masukan (opsional)', '<textarea name="komentar" rows="4" maxlength="500" class="' + INP + '" placeholder="Tulis pengalaman atau saran perbaikan Anda."></textarea>') +
    '<input name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true"><div id="svy-err" class="hidden text-sm text-error font-semibold" role="alert"></div>' +
    '<button type="submit" class="' + BTN_P + '">' + ic('send', '!text-[18px]') + ' Kirim Survei</button></form>' +
    '<div class="' + CARD + ' p-6 md:p-8"><h3 class="font-headline font-bold text-primary-container mb-4 flex items-center gap-2">' + ic('analytics', 'text-secondary') + 'Rekap Kepuasan</h3>' +
    (r.n ? '<div class="flex items-end gap-3 mb-4"><span class="font-headline text-5xl font-extrabold text-primary-container">' + r.rata.toFixed(2) + '</span><span class="text-on-surface-variant pb-1">/ 5 &bull; ' + r.n + ' responden &bull; ' + r.puas + '% puas</span></div><div class="space-y-2">' + dist + '</div>' : '<p class="text-on-surface-variant">Belum ada penilaian. Jadilah yang pertama.</p>') + '</div></div>');
  return { html: html, init: () => {
    $$('[data-star]').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('.star-btn'); if (!b) return; const v = +b.dataset.v; g.dataset.val = v;
      $$('.star-btn', g).forEach(x => { const on = +x.dataset.v <= v; x.classList.toggle('on', on); x.setAttribute('aria-checked', +x.dataset.v === v); });
      $('[data-lbl]', g).textContent = RATE_LABEL[v];
    }));
    const f = $('#svy-form');
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('#svy-err'); err.classList.add('hidden');
      const val = {}; let miss = false; $$('[data-star]', f).forEach(g => { val[g.dataset.star] = +g.dataset.val; if (!+g.dataset.val) miss = true; });
      if (miss) { err.textContent = 'Beri penilaian pada keempat indikator.'; err.classList.remove('hidden'); return; }
      try {
        await withBusy(f.querySelector('button[type=submit]'), async () => {
          await api('submitSurvei', Object.assign({ layanan: f.layanan.value, komentar: f.komentar.value, website: f.website.value, cid: AppState.cid }, val));
          AppState.cache = {}; toast('Terima kasih! Survei Anda terkirim.'); navigateTo('survei', { noHistory: true });
        });
      } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
    });
  } };
}

async function renderKontak() {
  const s = (await pub('kontak')).settings; const peta = safeUrl(s.peta_url);
  const item = (i, t, v) => v ? '<div class="' + CARD + ' p-5 flex gap-4"><div class="w-11 h-11 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0">' + ic(i) + '</div><div><div class="text-xs uppercase font-bold text-outline">' + t + '</div><div class="font-medium mt-0.5">' + esc(v) + '</div></div></div>' : '';
  return { html: wrap(sectionTitle('Hubungi Kami', 'Kontak', s.nama_bidang + ' ' + s.nama_dinas) +
    '<div class="grid gap-4 md:grid-cols-2">' + item('location_on', 'Alamat', s.alamat) + item('call', 'Telepon', s.telepon) + item('chat', 'WhatsApp', s.whatsapp) + item('mail', 'Email', s.email_kontak) + item('schedule', 'Jam layanan', s.jam_layanan) + '</div>' +
    (peta ? '<a href="' + esc(peta) + '" target="_blank" rel="noopener noreferrer" class="' + BTN_P + ' mt-6">' + ic('map', '!text-[18px]') + ' Buka petunjuk arah</a>' : '')) };
}

/* =====================================================================
   LOGIN & ADMIN
   ===================================================================== */
async function renderLogin() {
  const html = '<div class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-surface-container-high/50 to-background"><div class="' + CARD + ' w-full max-w-md p-8 shadow-xl">' +
    '<div class="flex items-center gap-3 mb-6"><span class="w-11 h-11 rounded bg-primary-container text-white flex items-center justify-center">' + ic('admin_panel_settings') + '</span><div><div class="text-xs font-bold uppercase text-secondary tracking-wider">Akses khusus admin</div><h1 class="font-headline text-xl font-bold text-primary-container">Portal Masuk Administrator</h1></div></div>' +
    '<form id="login-form" class="space-y-4" novalidate>' + field('Nama pengguna', '<input name="u" class="' + INP + '" autocomplete="username" required>') +
    field('Kata sandi', '<div class="relative"><input name="p" type="password" class="' + INP + ' pr-11" autocomplete="current-password" required><button type="button" id="pw-toggle" class="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-outline hover:text-primary-container" aria-label="Tampilkan kata sandi">' + ic('visibility') + '</button></div>') +
    '<div id="login-err" class="hidden text-sm text-error font-semibold" role="alert"></div><button type="submit" class="' + BTN_P + ' w-full">' + ic('login', '!text-[18px]') + ' Masuk</button></form>' +
    '<button type="button" data-nav="home" class="mt-5 text-sm text-secondary font-semibold hover:underline inline-flex items-center gap-1">' + ic('arrow_back', '!text-[16px]') + ' Kembali ke portal publik</button></div></div>';
  return { html: html, init: () => {
    const f = $('#login-form');
    $('#pw-toggle').addEventListener('click', () => { f.p.type = f.p.type === 'password' ? 'text' : 'password'; });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('#login-err'); err.classList.add('hidden');
      if (!f.u.value.trim() || !f.p.value) { err.textContent = 'Isi nama pengguna dan kata sandi.'; err.classList.remove('hidden'); return; }
      try {
        await withBusy(f.querySelector('button[type=submit]'), async () => {
          const r = await api('adminLogin', f.u.value, f.p.value);
          AppState.token = r.data.token; AppState.adminName = r.data.nama; AppState.cache = {};
          toast('Selamat datang, ' + r.data.nama + '.'); navigateTo('admin-dashboard', { noHistory: true });
        });
      } catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
    });
  } };
}

const ADMIN_NAV = [['admin-dashboard', 'dashboard', 'Dashboard'], ['admin-pengaduan', 'mark_email_unread', 'Pengaduan'], ['admin-survei', 'star', 'Hasil Survei'], ['admin-konten', 'newspaper', 'Kelola Konten'], ['admin-pengaturan', 'admin_panel_settings', 'Pengaturan & Log'],
  ['', '', 'SIDIKAPET \u2014 Tiket Kapal'], ['admin-tk-dash', 'sailing', 'Dasbor Tiket'], ['admin-tk-pesan', 'point_of_sale', 'Pesan Tiket (Loket)'], ['admin-tk-tiket', 'receipt_long', 'Tiket & Penumpang'], ['admin-tk-kapal', 'directions_boat', 'Data Kapal'], ['admin-tk-jadwal', 'calendar_month', 'Rute & Jadwal'], ['admin-tk-laporan', 'analytics', 'Laporan Tiket']];
function adminLayout(active, title, inner, actions) {
  return '<div class="min-h-screen bg-surface md:flex"><aside class="md:w-64 md:fixed md:inset-y-0 bg-white border-b md:border-b-0 md:border-r border-[#E2E8F0] flex md:flex-col z-30">' +
    '<div class="hidden md:flex items-center gap-3 px-5 h-16 border-b border-[#E2E8F0]"><span class="w-9 h-9 rounded bg-primary-container text-white flex items-center justify-center">' + ic('anchor') + '</span><div class="leading-tight"><div class="font-headline font-bold text-primary-container">PANEL ADMIN</div><div class="text-[11px] text-on-surface-variant uppercase">Perairan & Udara</div></div></div>' +
    '<nav class="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto md:flex-1" aria-label="Menu admin">' + ADMIN_NAV.map(n => !n[0] ? '<div class="hidden md:block px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-outline">' + n[2] + '</div>' : '<a href="javascript:void(0)" data-nav="' + n[0] + '" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap ' + (n[0] === active ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-surface-container-high') + '">' + ic(n[1], '!text-[20px]') + n[2] + '</a>').join('') + '</nav>' +
    '<div class="hidden md:block p-3 border-t border-[#E2E8F0] space-y-2"><button type="button" data-nav="home" class="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-surface-container-low text-primary-container text-sm font-semibold hover:bg-surface-container-high">' + ic('arrow_back', '!text-[18px]') + 'Portal publik</button><button type="button" data-act="logout" class="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-error text-sm font-semibold hover:bg-error-container">' + ic('logout', '!text-[18px]') + 'Keluar</button></div></aside>' +
    '<div class="md:ml-64 flex-1 min-w-0"><header class="bg-white border-b border-[#E2E8F0] px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-3"><h1 class="font-headline text-xl md:text-2xl font-bold text-primary-container">' + esc(title) + '</h1><div class="flex items-center gap-2">' + (actions || '') + '<button type="button" data-act="logout" class="md:hidden ' + BTN_S + ' !min-h-[40px]">Keluar</button></div></header><div class="p-4 md:p-8">' + inner + '</div></div></div>';
}

async function renderAdminDashboard() {
  const d = (await adm('adminDashboard')).data;
  const kpi = (i, l, v, sub) => '<div class="' + CARD + ' p-5"><div class="flex items-start justify-between"><div><div class="text-xs uppercase font-bold text-on-surface-variant tracking-wide">' + l + '</div><div class="font-headline text-3xl font-bold text-primary-container mt-1">' + v + '</div></div><div class="w-11 h-11 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center">' + ic(i) + '</div></div><div class="text-xs text-on-surface-variant mt-3">' + sub + '</div></div>';
  const st = d.status;
  const inner = '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">' +
    kpi('inbox', 'Total pengaduan', d.total, statusBadge('Diterima') + ' ' + st.Diterima + ' &nbsp;' + statusBadge('Diproses') + ' ' + st.Diproses + ' &nbsp;' + statusBadge('Selesai') + ' ' + st.Selesai) +
    kpi('star', 'Indeks kepuasan', d.rekap.n ? d.rekap.rata.toFixed(2) + ' <span class="text-base font-normal text-outline">/ 5</span>' : '&ndash;', d.rekap.n + ' responden &bull; ' + d.rekap.puas + '% puas') +
    kpi('newspaper', 'Konten', d.konten.terbit + ' <span class="text-base font-normal text-outline">terbit</span>', d.konten.draf + ' draf &bull; ' + d.konten.regulasi + ' regulasi') +
    kpi('mail', 'Kuota email hari ini', d.kuotaEmail == null ? '&ndash;' : d.kuotaEmail, 'Sisa kirim email harian akun pemilik skrip') + '</div>' +
    '<div class="grid gap-6 lg:grid-cols-2 mb-6"><div class="' + CARD + ' p-5"><h2 class="font-headline font-bold text-primary-container mb-3">Pengaduan per bulan</h2><div class="h-64"><canvas id="ch-adu" aria-label="Grafik pengaduan per bulan" role="img"></canvas></div></div>' +
    '<div class="' + CARD + ' p-5"><h2 class="font-headline font-bold text-primary-container mb-3">Rata-rata rating per bulan</h2><div class="h-64"><canvas id="ch-rate" aria-label="Grafik rata-rata rating per bulan" role="img"></canvas></div></div></div>' +
    '<div class="' + CARD + ' p-5"><h2 class="font-headline font-bold text-primary-container mb-3">Rata-rata rating per layanan</h2>' +
    (d.perLayanan.length ? '<div class="space-y-3">' + d.perLayanan.map(l => '<div><div class="flex justify-between text-sm mb-1"><span>' + esc(l.layanan) + ' <span class="text-outline">(' + l.n + ')</span></span><b>' + l.rata.toFixed(2) + ' / 5</b></div><div class="h-2.5 rounded-full bg-surface-container-high overflow-hidden"><div class="h-full bg-secondary" style="width:' + l.rata / 5 * 100 + '%"></div></div></div>').join('') + '</div>' : '<p class="text-on-surface-variant text-sm">Belum ada data survei.</p>') + '</div>';
  const actions = '<button type="button" id="btn-pdf" class="' + BTN_P + ' !min-h-[40px]">' + ic('picture_as_pdf', '!text-[18px]') + ' Cetak laporan PDF</button>';
  return { html: adminLayout('admin-dashboard', 'Dashboard Ringkasan', inner, actions), init: () => {
    if (window.Chart) {
      new Chart($('#ch-adu'), { type: 'bar', data: { labels: d.months, datasets: [{ label: 'Pengaduan', data: d.pengaduanPerBulan, backgroundColor: '#0f2942', borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
      new Chart($('#ch-rate'), { type: 'line', data: { labels: d.months, datasets: [{ label: 'Rating', data: d.ratingPerBulan, borderColor: '#006398', backgroundColor: 'rgba(0,99,152,.12)', fill: true, tension: .3 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 5 } } } });
    }
    $('#btn-pdf').addEventListener('click', openReportModal);
  } };
}
function openReportModal() {
  const m = openModal(modalHead('Cetak laporan PDF') + '<form id="rpt-form" class="p-6 space-y-4">' +
    field('Jenis laporan', '<select name="j" class="' + INP + '"><option value="pengaduan">Pengaduan masyarakat</option><option value="survei">Survei kepuasan layanan</option></select>') +
    '<div class="grid grid-cols-2 gap-3">' + field('Dari tanggal', '<input name="d" type="date" class="' + INP + '">') + field('Sampai tanggal', '<input name="s" type="date" class="' + INP + '" value="' + todayStr() + '">') + '</div>' +
    '<p class="text-xs text-on-surface-variant">Berkas PDF juga disimpan otomatis di folder Google Drive pemilik skrip.</p><div id="rpt-out"></div>' +
    '<div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" class="' + BTN_P + '">' + ic('picture_as_pdf', '!text-[18px]') + ' Buat PDF</button></div></form>');
  const f = $('#rpt-form', m);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await withBusy(f.querySelector('button[type=submit]'), async () => {
        const r = (await adm('adminExportPdf', f.j.value, f.d.value, f.s.value)).data;
        downloadB64(r.name, r.b64, 'application/pdf');
        $('#rpt-out', m).innerHTML = '<div class="rounded-lg bg-[#ECFDF5] text-[#047857] p-3 text-sm">' + r.jumlah + ' baris dicetak. <a class="underline font-semibold" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">Buka di Drive</a></div>';
      });
    } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
  });
}

async function renderAdminPengaduan() {
  let rows = (await adm('adminList', 'Pengaduan')).data;
  const draw = () => {
    const q = $('#ap-q').value.toLowerCase(), s = $('#ap-s').value;
    const list = rows.filter(r => (!s || r.status === s) && (!q || (r.tiket + ' ' + r.nama + ' ' + r.kategori + ' ' + r.isi).toLowerCase().indexOf(q) >= 0));
    $('#ap-count').textContent = list.length + ' dari ' + rows.length;
    $('#ap-body').innerHTML = list.length ? list.map(r => '<tr><td data-l="Tiket" class="p-3 font-mono text-xs font-semibold text-primary-container">' + esc(r.tiket) + '</td><td data-l="Tanggal" class="p-3 whitespace-nowrap">' + esc(fmtDateTime(r.tanggal)) + '</td><td data-l="Pelapor" class="p-3">' + esc(r.nama) + '</td><td data-l="Kategori" class="p-3">' + esc(r.kategori) + '</td><td data-l="Uraian" class="p-3 max-w-xs truncate">' + esc(r.isi) + '</td><td data-l="Status" class="p-3">' + statusBadge(r.status) + '</td><td data-l="Aksi" class="p-3 text-right"><button type="button" data-t="' + esc(r.tiket) + '" class="' + BTN_P + ' !min-h-[36px] !px-3">' + ic('edit_note', '!text-[16px]') + ' Tindak lanjut</button></td></tr>').join('') : '<tr><td colspan="7" class="p-8 text-center text-outline">Tidak ada pengaduan.</td></tr>';
  };
  const inner = '<div class="grid gap-3 md:grid-cols-[1fr_200px_auto] mb-4 items-center"><input id="ap-q" class="' + INP + '" placeholder="Cari tiket, nama, kategori, uraian..." aria-label="Cari"><select id="ap-s" class="' + INP + '" aria-label="Status"><option value="">Semua status</option><option>Diterima</option><option>Diproses</option><option>Selesai</option></select><span id="ap-count" class="text-sm text-on-surface-variant"></span></div>' +
    '<div class="' + CARD + ' overflow-hidden"><table class="stack w-full text-sm text-left"><thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant"><tr><th class="p-3">Tiket</th><th class="p-3">Tanggal</th><th class="p-3">Pelapor</th><th class="p-3">Kategori</th><th class="p-3">Uraian</th><th class="p-3">Status</th><th class="p-3 text-right">Aksi</th></tr></thead><tbody id="ap-body" class="divide-y divide-[#F1F5F9]"></tbody></table></div>';
  return { html: adminLayout('admin-pengaduan', 'Kelola Pengaduan', inner), init: () => {
    draw(); $('#ap-q').addEventListener('input', draw); $('#ap-s').addEventListener('change', draw);
    $('#ap-body').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return; const r = rows.find(x => x.tiket === b.dataset.t); if (!r) return;
      const m = openModal(modalHead('Tindak lanjut ' + r.tiket) + '<form id="ap-form" class="p-6 space-y-4">' +
        '<div class="grid gap-3 sm:grid-cols-2 text-sm"><div><div class="text-xs font-bold text-outline uppercase">Pelapor</div>' + esc(r.nama) + '</div><div><div class="text-xs font-bold text-outline uppercase">Kontak</div>' + esc(r.kontak) + (r.email ? '<br>' + esc(r.email) : '') + '</div></div>' +
        '<div><div class="text-xs font-bold text-outline uppercase mb-1">Uraian (' + esc(r.kategori) + ')</div><div class="bg-surface-container-low rounded-lg p-3 text-sm prose-id">' + paras(r.isi) + '</div></div>' +
        (r.lampiran_url ? '<a class="text-secondary font-semibold text-sm hover:underline inline-flex items-center gap-1" href="' + esc(r.lampiran_url) + '" target="_blank" rel="noopener noreferrer">' + ic('attach_file', '!text-[16px]') + 'Buka lampiran di Drive</a>' : '') +
        field('Status', '<select name="s" class="' + INP + '">' + ['Diterima', 'Diproses', 'Selesai'].map(s => '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>') +
        field('Tanggapan resmi', '<textarea name="b" rows="5" maxlength="3000" class="' + INP + '">' + esc(r.balasan) + '</textarea>', r.email ? 'Pelapor akan menerima email pembaruan.' : 'Pelapor tidak mengisi email; tanggapan hanya tampil di pelacakan tiket.') +
        '<div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan</button></div></form>', true);
      $('#ap-form', m).addEventListener('submit', async ev => {
        ev.preventDefault(); const f = ev.target;
        try { await withBusy(f.querySelector('button[type=submit]'), async () => { await adm('adminPengaduanUpdate', r.tiket, f.s.value, f.b.value); r.status = f.s.value; r.balasan = f.b.value; closeModal(); draw(); toast('Pengaduan diperbarui.'); }); }
        catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
      });
    });
  } };
}

async function renderAdminSurvei() {
  const rows = (await adm('adminList', 'Survei')).data;
  const rk = { n: rows.length, avg: k => rows.length ? (rows.reduce((a, r) => a + num(r[k]), 0) / rows.length).toFixed(2) : '-' };
  const draw = () => {
    const d1 = $('#sv-d').value, d2 = $('#sv-s').value, q = $('#sv-q').value.toLowerCase();
    const list = rows.filter(r => { const t = String(r.tanggal).slice(0, 10); return (!d1 || t >= d1) && (!d2 || t <= d2) && (!q || (r.layanan + ' ' + r.komentar).toLowerCase().indexOf(q) >= 0); });
    $('#sv-count').textContent = list.length + ' dari ' + rows.length;
    $('#sv-body').innerHTML = list.length ? list.map(r => '<tr><td data-l="Tanggal" class="p-3 whitespace-nowrap">' + esc(fmtDateTime(r.tanggal)) + '</td><td data-l="Layanan" class="p-3">' + esc(r.layanan) + '</td><td data-l="Respon" class="p-3 text-center">' + esc(r.r_respon) + '</td><td data-l="Prosedur" class="p-3 text-center">' + esc(r.r_prosedur) + '</td><td data-l="Sikap" class="p-3 text-center">' + esc(r.r_sikap) + '</td><td data-l="Transparansi" class="p-3 text-center">' + esc(r.r_transparansi) + '</td><td data-l="Rata-rata" class="p-3 text-center font-bold">' + esc(r.rata2) + '</td><td data-l="Komentar" class="p-3 max-w-xs">' + esc(r.komentar) + '</td></tr>').join('') : '<tr><td colspan="8" class="p-8 text-center text-outline">Belum ada data.</td></tr>';
  };
  const inner = '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6">' + [['Responden', rk.n], ['Rata-rata', rk.avg('rata2')], ['Respon', rk.avg('r_respon')], ['Prosedur', rk.avg('r_prosedur')], ['Sikap / Transparansi', rk.avg('r_sikap') + ' / ' + rk.avg('r_transparansi')]].map(x => '<div class="' + CARD + ' p-4"><div class="text-xs uppercase font-bold text-on-surface-variant">' + x[0] + '</div><div class="font-headline text-2xl font-bold text-primary-container mt-1">' + x[1] + '</div></div>').join('') + '</div>' +
    '<div class="grid gap-3 md:grid-cols-[1fr_170px_170px_auto] mb-4 items-center"><input id="sv-q" class="' + INP + '" placeholder="Cari layanan / komentar..." aria-label="Cari"><input id="sv-d" type="date" class="' + INP + '" aria-label="Dari tanggal"><input id="sv-s" type="date" class="' + INP + '" aria-label="Sampai tanggal"><span id="sv-count" class="text-sm text-on-surface-variant"></span></div>' +
    '<div class="' + CARD + ' overflow-hidden"><table class="stack w-full text-sm text-left"><thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant"><tr><th class="p-3">Tanggal</th><th class="p-3">Layanan</th><th class="p-3 text-center">Respon</th><th class="p-3 text-center">Prosedur</th><th class="p-3 text-center">Sikap</th><th class="p-3 text-center">Transp.</th><th class="p-3 text-center">Rata2</th><th class="p-3">Komentar</th></tr></thead><tbody id="sv-body" class="divide-y divide-[#F1F5F9]"></tbody></table></div>';
  return { html: adminLayout('admin-survei', 'Hasil Survei Kepuasan', inner, '<button type="button" id="btn-pdf" class="' + BTN_P + ' !min-h-[40px]">' + ic('picture_as_pdf', '!text-[18px]') + ' Cetak PDF</button>'), init: () => {
    draw(); ['#sv-q', '#sv-d', '#sv-s'].forEach(s => $(s).addEventListener('input', draw)); $('#btn-pdf').addEventListener('click', openReportModal);
  } };
}

/* ---------- Kelola konten (CRUD berbasis skema) ---------- */
const SCHEMA = {
  Berita: { label: 'Berita & Pengumuman', show: [['tanggal', 'Tanggal'], ['jenis', 'Jenis'], ['judul', 'Judul'], ['status', 'Status']], fields: [
    { k: 'jenis', l: 'Jenis', t: 'select', o: ['Berita', 'Pengumuman'] }, { k: 'status', l: 'Status', t: 'select', o: ['Terbit', 'Draf'] },
    { k: 'judul', l: 'Judul', t: 'text', r: 1 }, { k: 'tanggal', l: 'Tanggal', t: 'date', r: 1 }, { k: 'ringkasan', l: 'Ringkasan', t: 'textarea', rows: 2 },
    { k: 'isi', l: 'Isi naskah', t: 'textarea', rows: 8, h: 'Pisahkan paragraf dengan satu baris kosong.' }, { k: 'foto_id', l: 'Foto sampul', t: 'file', a: 'image/jpeg,image/png', types: ['image/jpeg', 'image/png'] }] },
  Agenda: { label: 'Agenda', show: [['tanggal', 'Tanggal'], ['judul', 'Kegiatan'], ['lokasi', 'Lokasi'], ['status', 'Status']], fields: [
    { k: 'judul', l: 'Nama kegiatan', t: 'text', r: 1 }, { k: 'status', l: 'Status', t: 'select', o: ['Tampil', 'Sembunyi'] },
    { k: 'tanggal', l: 'Tanggal mulai', t: 'date', r: 1 }, { k: 'tanggal_selesai', l: 'Tanggal selesai', t: 'date', h: 'Kosongkan jika kegiatan hanya satu hari.' },
    { k: 'waktu', l: 'Waktu', t: 'text', h: 'Contoh: 09.00 - 12.00 WITA' }, { k: 'lokasi', l: 'Lokasi', t: 'text' }, { k: 'deskripsi', l: 'Keterangan', t: 'textarea', rows: 3 }] },
  Regulasi: { label: 'Regulasi', show: [['tahun', 'Tahun'], ['jenis', 'Jenis'], ['nomor', 'Nomor'], ['judul', 'Judul']], fields: [
    { k: 'jenis', l: 'Jenis (mis. Perwali, SK, SOP)', t: 'text', r: 1 }, { k: 'nomor', l: 'Nomor', t: 'text' }, { k: 'tahun', l: 'Tahun', t: 'text', r: 1 },
    { k: 'judul', l: 'Judul lengkap', t: 'textarea', rows: 2, r: 1 }, { k: 'tanggal', l: 'Tanggal ditetapkan', t: 'date' }, { k: 'file_id', l: 'Berkas PDF', t: 'file', a: 'application/pdf', types: ['application/pdf'] }] },
  Layanan: { label: 'Layanan', show: [['urutan', 'No'], ['nama', 'Nama layanan']], fields: [
    { k: 'nama', l: 'Nama layanan', t: 'text', r: 1 }, { k: 'urutan', l: 'Urutan tampil', t: 'text' }, { k: 'deskripsi', l: 'Deskripsi', t: 'textarea', rows: 3 },
    { k: 'persyaratan', l: 'Persyaratan', t: 'textarea', rows: 4 }, { k: 'alur', l: 'Alur pelayanan', t: 'textarea', rows: 4 }] },
  Pegawai: { label: 'Pejabat & Pegawai', show: [['urutan', 'No'], ['nama', 'Nama'], ['jabatan', 'Jabatan'], ['kategori', 'Kategori'], ['status_aktif', 'Aktif']], fields: [
    { k: 'nama', l: 'Nama lengkap & gelar', t: 'text', r: 1 }, { k: 'nip', l: 'NIP', t: 'text' }, { k: 'jabatan', l: 'Jabatan', t: 'text', r: 1 },
    { k: 'kategori', l: 'Kategori (menentukan posisi di bagan)', t: 'select', o: ['Kepala Bidang', 'Kepala Seksi Kepelabuhanan dan Kebandarudaraan', 'Kepala ASDP', 'Staf'] },
    { k: 'seksi', l: 'Staf di bawah seksi', t: 'select', o: ['-', 'Kepelabuhanan dan Kebandarudaraan', 'ASDP'], h: 'Khusus kategori Staf: menentukan staf ditampilkan di bawah Kepala Seksi yang mana pada bagan.' },
    { k: 'urutan', l: 'Urutan tampil', t: 'text' }, { k: 'status_aktif', l: 'Tampilkan di website?', t: 'select', o: ['Ya', 'Tidak'] }, { k: 'foto_id', l: 'Foto', t: 'file', a: 'image/jpeg,image/png', types: ['image/jpeg', 'image/png'] }] },
  Profil: { label: 'Profil & Sejarah', show: [['jenis', 'Jenis'], ['judul', 'Judul']], fields: [
    { k: 'jenis', l: 'Jenis', t: 'select', o: ['Profil', 'Sejarah'] }, { k: 'judul', l: 'Judul', t: 'text' }, { k: 'isi', l: 'Isi', t: 'textarea', rows: 10, h: 'Pisahkan paragraf dengan satu baris kosong.' }] },
  VisiMisi: { label: 'Visi & Misi', show: [['jenis', 'Jenis'], ['urutan', 'No'], ['teks', 'Isi']], fields: [
    { k: 'jenis', l: 'Jenis', t: 'select', o: ['Visi', 'Misi'] }, { k: 'urutan', l: 'Urutan', t: 'text' }, { k: 'teks', l: 'Isi', t: 'textarea', rows: 3, r: 1 }] },
  TugasFungsi: { label: 'Tugas & Fungsi', show: [['jenis', 'Jenis'], ['urutan', 'No'], ['teks', 'Isi']], fields: [
    { k: 'jenis', l: 'Jenis', t: 'select', o: ['Tugas', 'Fungsi'] }, { k: 'urutan', l: 'Urutan', t: 'text' }, { k: 'teks', l: 'Isi', t: 'textarea', rows: 3, r: 1 }] }
};
async function renderAdminKonten(p) {
  const tab = SCHEMA[p.tab] ? p.tab : 'Berita', sc = SCHEMA[tab];
  let rows = (await adm('adminList', tab)).data;
  const tabs = '<div class="flex gap-2 overflow-x-auto pb-2 mb-4">' + Object.keys(SCHEMA).map(k => '<button type="button" data-nav="admin-konten" data-tab="' + k + '" class="' + (k === tab ? BTN_P : BTN_S) + ' !min-h-[38px] whitespace-nowrap">' + esc(SCHEMA[k].label) + '</button>').join('') + '</div>';
  const table = '<div class="' + CARD + ' overflow-hidden"><table class="stack w-full text-sm text-left"><thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant"><tr>' + sc.show.map(c => '<th class="p-3">' + c[1] + '</th>').join('') + '<th class="p-3 text-right">Aksi</th></tr></thead><tbody id="kt-body" class="divide-y divide-[#F1F5F9]"></tbody></table></div>';
  const draw = () => {
    $('#kt-body').innerHTML = rows.length ? rows.map(r => '<tr>' + sc.show.map(c => '<td data-l="' + c[1] + '" class="p-3 ' + (c[0] === 'judul' || c[0] === 'teks' ? 'max-w-md' : '') + '">' + (c[0] === 'status' ? statusBadge(r[c[0]] === 'Terbit' || r[c[0]] === 'Tampil' ? 'Selesai' : 'Diproses').replace(/>[^<]*</, '>' + esc(r[c[0]]) + '<') : esc(String(r[c[0]]).length > 120 ? String(r[c[0]]).slice(0, 120) + '...' : r[c[0]])) + '</td>').join('') +
      '<td data-l="Aksi" class="p-3 text-right whitespace-nowrap"><button type="button" data-e="' + esc(r.id) + '" class="p-2 rounded hover:bg-surface-container text-secondary" aria-label="Ubah">' + ic('edit') + '</button><button type="button" data-d="' + esc(r.id) + '" class="p-2 rounded hover:bg-error-container text-error" aria-label="Hapus">' + ic('delete') + '</button></td></tr>').join('') : '<tr><td colspan="' + (sc.show.length + 1) + '" class="p-8 text-center text-outline">Belum ada data.</td></tr>';
  };
  const openForm = r => {
    const isNew = !r; r = r || {};
    const body = sc.fields.map(f => {
      const v = r[f.k] != null ? r[f.k] : (f.k === 'tanggal' && isNew ? todayStr() : '');
      let inp;
      if (f.t === 'select') inp = '<select name="' + f.k + '" class="' + INP + '">' + f.o.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
      else if (f.t === 'textarea') inp = '<textarea name="' + f.k + '" rows="' + (f.rows || 3) + '" class="' + INP + '"' + (f.r ? ' required' : '') + '>' + esc(v) + '</textarea>';
      else if (f.t === 'file') inp = '<input name="' + f.k + '" type="file" accept="' + f.a + '" class="' + INP + ' file:mr-3 file:rounded file:border-0 file:bg-surface-container file:px-3 file:py-1.5">' + (v ? '<span class="text-xs text-secondary block mt-1">Berkas sudah ada. Pilih berkas baru untuk menggantinya.</span>' : '');
      else inp = '<input name="' + f.k + '" type="' + (f.t === 'date' ? 'date' : 'text') + '" class="' + INP + '" value="' + esc(String(v).slice(0, f.t === 'date' ? 10 : 500)) + '"' + (f.r ? ' required' : '') + '>';
      return field(esc(f.l) + (f.r ? ' <span class="text-error">*</span>' : ''), inp, f.h);
    }).join('');
    const m = openModal(modalHead((isNew ? 'Tambah ' : 'Ubah ') + sc.label) + '<form id="kt-form" class="p-6 space-y-4">' + body + '<div class="flex justify-end gap-3 pt-2"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan</button></div></form>', true);
    $('#kt-form', m).addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      try {
        await withBusy(f.querySelector('button[type=submit]'), async () => {
          const obj = Object.assign({}, r);
          for (const fd of sc.fields) {
            if (fd.t === 'file') { const file = await readFile(f[fd.k].files[0], fd.types); if (file) obj._file = file; }
            else obj[fd.k] = f[fd.k].value;
          }
          await adm('adminSave', tab, obj); closeModal(); toast('Tersimpan.'); AppState.cache = {}; navigateTo('admin-konten', { params: { tab: tab }, noHistory: true });
        });
      } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
    });
  };
  return { html: adminLayout('admin-konten', 'Kelola Konten', tabs + '<div class="flex justify-between items-center mb-4"><h2 class="font-headline text-lg font-bold text-primary-container">' + esc(sc.label) + '</h2><button type="button" id="kt-add" class="' + BTN_P + ' !min-h-[40px]">' + ic('add', '!text-[18px]') + ' Tambah</button></div>' + table), init: () => {
    draw(); $('#kt-add').addEventListener('click', () => openForm(null));
    $('#kt-body').addEventListener('click', e => {
      const be = e.target.closest('[data-e]'), bd = e.target.closest('[data-d]');
      if (be) openForm(rows.find(x => String(x.id) === be.dataset.e));
      if (bd) {
        const id = bd.dataset.d;
        const m = openModal(modalHead('Hapus data?') + '<div class="p-6 space-y-5"><p class="text-on-surface-variant">Data yang dihapus tidak dapat dikembalikan dari website ini. Berkas di Google Drive tidak ikut terhapus.</p><div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="button" id="del-ok" class="' + BTN + ' bg-error text-white hover:bg-[#93000a]">' + ic('delete', '!text-[18px]') + ' Hapus</button></div></div>');
        $('#del-ok', m).addEventListener('click', async ev => {
          try { await withBusy(ev.currentTarget, async () => { await adm('adminDelete', tab, id); closeModal(); toast('Data dihapus.'); AppState.cache = {}; navigateTo('admin-konten', { params: { tab: tab }, noHistory: true }); }); }
          catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
        });
      }
    });
  } };
}

/* ---------- Pengaturan & Log ---------- */
const SET_LABEL = { nama_bidang: 'Nama bidang', nama_dinas: 'Nama dinas', hero_judul: 'Judul beranda', hero_deskripsi: 'Deskripsi beranda', email_admin: 'Email penerima notifikasi pengaduan', alamat: 'Alamat kantor', telepon: 'Telepon', whatsapp: 'WhatsApp', email_kontak: 'Email kontak publik', jam_layanan: 'Jam layanan', peta_url: 'Tautan peta (Google Maps)' };
async function renderAdminPengaturan() {
  const set = {}; (await adm('adminList', 'Pengaturan')).data.forEach(r => { set[r.kunci] = r.nilai; });
  const logs = (await adm('adminList', 'LogAdmin')).data;
  let tkS = null; try { tkS = await tkAdm('setBaca'); } catch (x) { if (x.message === 'SESI') throw x; }
  const inner = '<div class="grid gap-6 xl:grid-cols-[1.3fr_1fr] items-start"><div class="space-y-6"><form id="set-form" class="' + CARD + ' p-6 space-y-4"><h2 class="font-headline font-bold text-primary-container">Pengaturan situs</h2>' +
    Object.keys(SET_LABEL).map(k => field(SET_LABEL[k], '<input name="' + k + '" class="' + INP + '" maxlength="500" value="' + esc(set[k] || '') + '">')).join('') +
    '<button type="submit" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan pengaturan</button></form>' + (tkS ? tkSetKartu(tkS) : '') + '</div>' +
    '<div class="space-y-6"><form id="pw-form" class="' + CARD + ' p-6 space-y-4"><h2 class="font-headline font-bold text-primary-container">Ganti kata sandi</h2>' +
    field('Kata sandi lama', '<input name="o" type="password" class="' + INP + '" autocomplete="current-password" required>') + field('Kata sandi baru (min. 8 karakter)', '<input name="n" type="password" class="' + INP + '" autocomplete="new-password" minlength="8" required>') +
    '<button type="submit" class="' + BTN_P + '">' + ic('key', '!text-[18px]') + ' Ganti kata sandi</button></form>' +
    '<div class="' + CARD + ' p-6 space-y-3"><h2 class="font-headline font-bold text-primary-container">Cadangan data</h2><p class="text-sm text-on-surface-variant">Cadangan otomatis setiap Minggu pukul 02.00 (12 salinan terakhir disimpan di Drive).</p><button type="button" id="bk-now" class="' + BTN_S + '">' + ic('cloud_sync', '!text-[18px]') + ' Cadangkan sekarang</button></div></div></div>' +
    '<div class="' + CARD + ' mt-6 overflow-hidden"><div class="p-5 border-b border-[#F1F5F9]"><h2 class="font-headline font-bold text-primary-container">Log audit aktivitas admin</h2><p class="text-sm text-on-surface-variant">100 aktivitas terbaru (sheet LogAdmin).</p></div><div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-surface-container text-xs uppercase text-on-surface-variant"><tr><th class="p-3">Waktu (WITA)</th><th class="p-3">Aksi</th><th class="p-3">Keterangan</th></tr></thead><tbody class="divide-y divide-[#F1F5F9]">' +
    (logs.length ? logs.map(l => '<tr><td class="p-3 font-mono text-xs whitespace-nowrap">' + esc(String(l.waktu).slice(0, 19)) + '</td><td class="p-3"><span class="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-mono font-semibold">' + esc(l.aksi) + '</span></td><td class="p-3">' + esc(l.keterangan) + '</td></tr>').join('') : '<tr><td colspan="3" class="p-8 text-center text-outline">Belum ada log.</td></tr>') + '</tbody></table></div></div>';
  return { html: adminLayout('admin-pengaturan', 'Pengaturan & Log Audit', inner), init: () => {
    $('#set-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, o = {}; Object.keys(SET_LABEL).forEach(k => { o[k] = f[k].value; });
      try { await withBusy(f.querySelector('button[type=submit]'), async () => { await adm('adminSaveSettings', o); AppState.cache = {}; Object.assign(AppState.settings, o); toast('Pengaturan tersimpan.'); }); } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
    });
    if (tkS) tkSetInit();
    $('#pw-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      try { await withBusy(f.querySelector('button[type=submit]'), async () => { await adm('adminChangePassword', f.o.value, f.n.value); f.reset(); toast('Kata sandi diganti.'); }); } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
    });
    $('#bk-now').addEventListener('click', async e => {
      try { await withBusy(e.currentTarget, async () => { const r = await adm('adminBackupNow'); toast('Cadangan dibuat: ' + r.data.name); }); } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
    });
  } };
}

/* =====================================================================
   SIDIKAPET — pemesanan tiket kapal (digabung ke website)
   Halaman publik : sidikapet, tk-jadwal, tk-pesan, tk-cek
   Halaman admin  : admin-tk-dash, admin-tk-pesan, admin-tk-tiket, admin-tk-kapal, admin-tk-jadwal, admin-tk-laporan (pengaturan tiket ada di halaman Pengaturan & Log)
   ===================================================================== */
const TK = { pub: null, at: 0, book: null, cek: [], mode: 'kode' };
const tkRp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tkTglPendek = s => { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? m[2] + '/' + m[1] : String(s || ''); };
const tkApi = (name, params) => api('apiPublic', name, Object.assign({ cid: AppState.cid }, params || {})).then(r => r.data);
function tkAdm(op, a, b) {
  const args = ['adminTiket', op];
  if (a !== undefined) args.push(a);
  if (b !== undefined) args.push(b);
  return adm.apply(null, args).then(r => r.data);
}
async function tkData(force) {
  if (force || !TK.pub || Date.now() - TK.at > 45000) { TK.pub = await tkApi('tkData'); TK.at = Date.now(); }
  return TK.pub;
}
// Jalankan aksi dengan tombol sibuk; galat ditampilkan sebagai toast.
async function tkRun(btn, fn) {
  try { return await (btn ? withBusy(btn, fn) : fn()); }
  catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
}
function tkConfirm(judul, pesan, okLabel) {
  return new Promise(res => {
    const m = openModal(modalHead(judul) + '<div class="p-6 space-y-5"><p class="text-sm">' + esc(pesan) + '</p><div class="flex justify-end gap-3"><button type="button" id="tk-no" class="' + BTN_S + '">Batal</button><button type="button" id="tk-yes" class="' + BTN_P + '">' + esc(okLabel || 'Ya, lanjutkan') + '</button></div></div>');
    $('#tk-no', m).onclick = () => { closeModal(); res(false); };
    $('#tk-yes', m).onclick = () => { closeModal(); res(true); };
  });
}
const TK_BADGE = {
  'Lunas': 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]', 'Aktif': 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]',
  'Belum Bayar': 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]', 'Kritis': 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]', 'Ditutup': 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]',
  'Batal': 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]', 'Kedaluwarsa': 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]', 'Penuh': 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]',
  'Info': 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
};
const tkBadge = (key, label) => '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold border whitespace-nowrap ' + (TK_BADGE[key] || 'bg-slate-100 border-slate-200 text-slate-700') + '">' + esc(label == null ? key : label) + '</span>';
const tkStatusTiket = t => t.status === 'Batal' ? 'Batal' : t.bayar;
const TK_TH = 'bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant';
const tkTabel = (heads, rows) => '<div class="overflow-x-auto"><table class="stack w-full text-sm text-left"><thead class="' + TK_TH + '"><tr>' + heads.map(h => '<th class="p-3">' + h + '</th>').join('') + '</tr></thead><tbody class="divide-y divide-[#F1F5F9]">' + rows + '</tbody></table></div>';
const tkKpi = (i, l, v, sub) => '<div class="' + CARD + ' p-5"><div class="flex items-start justify-between"><div><div class="text-xs uppercase font-bold text-on-surface-variant tracking-wide">' + l + '</div><div class="font-headline text-2xl md:text-3xl font-bold text-primary-container mt-1">' + v + '</div></div><div class="w-11 h-11 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center shrink-0">' + ic(i) + '</div></div><div class="text-xs text-on-surface-variant mt-3">' + sub + '</div></div>';
function tkQr(root) {
  if (!window.QRCode || !root) return;
  $$('.tk-qr[data-qr]', root).forEach(el => { if (!el.firstChild) { try { new QRCode(el, { text: el.dataset.qr, width: 108, height: 108, colorDark: '#0f2942' }); } catch (e) { /* abaikan */ } } });
}
function tkGrafik(id, tipe, labels, data, label, warna) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  new Chart(el, { type: tipe, data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: warna, borderColor: warna, borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}
const tkGeser = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const tkHari = () => (TK.pub && TK.pub.hari) || todayStr();
const tkSel = (id, opts, v) => '<select id="' + id + '" class="' + INP + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v == null ? '' : v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
const tkIn = (id, v, type, extra) => '<input id="' + id + '" type="' + (type || 'text') + '" class="' + INP + '" value="' + esc(v == null ? '' : v) + '" ' + (extra || '') + '>';
const tkHead = (kicker, judul, sub) => sectionTitle(kicker, judul, sub);

/* ---------- Komponen tiket ---------- */
function tkKartu(v) {
  const st = v.status === 'Batal' ? ['Batal', 'Batal'] : v.sah ? ['Lunas', 'Lunas · Sah'] : ['Belum Bayar', 'Menunggu pembayaran'];
  const cat = (TK.pub && TK.pub.cfg && TK.pub.cfg.catatan) || '';
  const rows = v.rinci.map(r => '<tr><td class="py-1">' + esc(r.label) + ' &times; ' + r.jml + '</td><td class="py-1 text-right font-mono">' + (r.sub == null ? '' : tkRp(r.sub)) + '</td></tr>').join('');
  const dd = (l, t) => '<div><dt class="text-xs text-on-surface-variant">' + l + '</dt><dd class="font-semibold">' + t + '</dd></div>';
  return '<article class="' + CARD + ' overflow-hidden"><div class="h-1.5 bg-gradient-to-r from-secondary via-secondary-container to-secondary"></div>' +
    '<div class="bg-primary-container text-white p-4 md:p-5 flex flex-wrap justify-between gap-3"><div class="min-w-0"><p class="text-[11px] uppercase tracking-widest text-secondary-container font-bold">' + (v.sah ? 'E-Tiket penyeberangan' : 'Bukti pemesanan') + '</p><p class="font-mono font-bold text-xl md:text-2xl break-all">' + esc(v.kode) + '</p></div><div class="self-start">' + tkBadge(st[0], st[1]) + '</div></div>' +
    '<div class="p-4 md:p-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-5"><div class="space-y-4 min-w-0">' +
    '<div class="flex items-center gap-3 bg-surface-container-low rounded-lg p-3"><div><p class="text-[11px] text-on-surface-variant uppercase font-bold">Asal</p><p class="font-headline font-bold text-primary-container">' + esc(v.asal) + '</p></div>' + ic('arrow_right_alt', 'text-secondary') + '<div><p class="text-[11px] text-on-surface-variant uppercase font-bold">Tujuan</p><p class="font-headline font-bold text-primary-container">' + esc(v.tujuan) + '</p></div></div>' +
    '<dl class="grid grid-cols-2 gap-3 text-sm">' + dd('Tanggal', esc(fmtDate(v.tanggal))) + dd('Jam berangkat', esc(v.jam) + ' WITA') + dd('Kapal', esc(v.kapal) + (v.tipe ? ' <span class="text-on-surface-variant font-normal">(' + esc(v.tipe) + ')</span>' : '')) + dd('Pemesan', esc(v.nama)) + '</dl>' +
    '<table class="w-full text-sm"><tbody>' + rows + '<tr class="border-t-2 border-primary-container"><td class="pt-2 font-bold">Total</td><td class="pt-2 text-right font-bold font-mono">' + tkRp(v.total) + '</td></tr></tbody></table></div>' +
    '<div class="flex flex-col items-center gap-2"><div class="tk-qr bg-white p-2 border border-[#E2E8F0] rounded" data-qr="' + esc(v.kode) + '"></div><p class="text-[11px] text-on-surface-variant text-center max-w-[130px]">Tunjukkan kode / QR kepada petugas</p></div></div>' +
    (cat ? '<p class="px-5 pb-4 text-xs text-on-surface-variant">' + esc(cat) + '</p>' : '') + '</article>';
}
const tkAksiKartu = v => '<div class="flex flex-wrap gap-3"><button type="button" data-tk="pdf" data-k="' + esc(v.kode) + '" class="' + BTN_P + '">' + ic('picture_as_pdf', '!text-[18px]') + ' Unduh PDF</button><button type="button" data-act="copy" data-v="' + esc(v.kode) + '" class="' + BTN_S + '">' + ic('content_copy', '!text-[18px]') + ' Salin kode</button></div>';
function tkJadwalTabel(list) {
  if (!list.length) return emptyBox('event_busy', 'Belum ada jadwal yang tersedia.');
  const rows = list.map(j => {
    const penuh = j.sisaP === 0;
    const ketersediaan = penuh ? tkBadge('Penuh') : j.sisaP == null ? tkBadge('Aktif', 'Tersedia') : tkBadge(j.sisaP < 6 ? 'Kritis' : 'Aktif', j.sisaP + ' kursi');
    const r2 = (j.hRB == null && j.hRK == null) ? 'tidak melayani' : [j.hRB == null ? '' : 'besar ' + tkRp(j.hRB), j.hRK == null ? '' : 'kecil ' + tkRp(j.hRK)].filter(Boolean).join(', ');
    return '<tr><td data-l="Kapal" class="p-3"><div class="font-semibold text-primary-container">' + esc(j.kapal) + '</div><div class="text-xs text-on-surface-variant">' + esc(j.tipe) + '</div></td>' +
      '<td data-l="Rute" class="p-3">' + esc(j.asal) + ' &rarr; ' + esc(j.tujuan) + '</td>' +
      '<td data-l="Berangkat" class="p-3 whitespace-nowrap"><div class="font-semibold">' + esc(fmtDate(j.tanggal)) + '</div><div class="font-mono text-xs">' + esc(j.jam) + ' WITA</div></td>' +
      '<td data-l="Tarif" class="p-3 text-xs md:whitespace-nowrap">Dewasa <b>' + tkRp(j.hD) + '</b><br>Anak <b>' + tkRp(j.hA) + '</b><br>R2: ' + esc(r2) + '</td>' +
      '<td data-l="Ketersediaan" class="p-3">' + ketersediaan + '</td>' +
      '<td class="p-3 text-right"><button type="button" data-nav="tk-pesan" data-id="' + esc(j.id) + '" class="' + BTN_P + ' !min-h-[36px] !px-4"' + (penuh ? ' disabled' : '') + '>Pesan</button></td></tr>';
  }).join('');
  return '<div class="' + CARD + ' overflow-hidden">' + tkTabel(['Kapal', 'Rute', 'Berangkat', 'Tarif', 'Ketersediaan', ''], rows) + '</div>';
}

/* =====================================================================
   HALAMAN PUBLIK
   ===================================================================== */
async function renderSidikapet() {
  const d = await tkData();
  const langkah = [['event_available', 'Pilih jadwal', 'Tentukan tanggal, rute, dan kapal.'], ['badge', 'Isi data pemesan', 'Cukup nama, nomor HP, dan alamat.'], ['payments', 'Bayar & verifikasi', 'Petugas menandai tiket LUNAS setelah pembayaran diterima.'], ['picture_as_pdf', 'Unduh e-tiket', 'Tunjukkan kode / QR di dermaga.']];
  const html = wrap(
    '<div class="' + CARD + ' p-6 md:p-10 mb-12 bg-gradient-to-r from-primary-fixed/40 to-white grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] items-center"><div>' +
    '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-bold uppercase">' + ic('hub', '!text-[16px]') + ' Sistem terintegrasi</span>' +
    '<h1 class="font-headline text-3xl md:text-4xl font-extrabold text-primary-container mt-3">SIDIKAPET</h1>' +
    '<p class="text-on-surface-variant mt-2 max-w-2xl">Sistem Informasi Digital Data Kapal, Penumpang, dan Tiket Terintegrasi. Pesan tiket kapal tanpa membuat akun, pantau status pembayaran, dan unduh e-tiket PDF.</p>' +
    '<div class="flex flex-wrap gap-3 mt-6"><button type="button" data-nav="tk-pesan" class="' + BTN_A + '">' + ic('confirmation_number', '!text-[20px]') + ' Pesan Tiket</button><button type="button" data-nav="tk-cek" class="' + BTN_S + '">' + ic('manage_search', '!text-[20px]') + ' Cek Status Tiket</button></div></div>' +
    '<form id="tk-cepat" class="' + CARD + ' p-5 space-y-3"><h2 class="font-headline font-bold text-primary-container">Cek cepat tiket</h2>' +
    field('Kode tiket', '<input id="tk-q0" class="' + INP + ' font-mono uppercase" placeholder="SDK-261015-AB12CD" required>') +
    '<button type="submit" class="' + BTN_P + ' w-full">' + ic('search', '!text-[18px]') + ' Periksa</button></form></div>' +
    sectionTitle('Alur pemesanan', 'Empat langkah mudah') +
    '<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-14">' + langkah.map((l, i) => '<div class="' + CARD + ' p-5"><div class="flex justify-between items-start"><span class="font-headline text-3xl font-bold text-primary-container/15">0' + (i + 1) + '</span><span class="w-10 h-10 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center">' + ic(l[0]) + '</span></div><h3 class="font-headline font-semibold text-primary-container mt-2">' + l[1] + '</h3><p class="text-sm text-on-surface-variant mt-1">' + l[2] + '</p></div>').join('') + '</div>' +
    '<div class="flex flex-wrap justify-between items-end gap-2 mb-6"><div><div class="text-secondary text-xs font-bold uppercase tracking-wider mb-2">Jadwal</div><h2 class="font-headline text-2xl font-bold text-primary-container">Keberangkatan terdekat</h2></div><button type="button" data-nav="tk-jadwal" class="text-secondary font-semibold text-sm hover:underline">Lihat semua jadwal</button></div>' +
    tkJadwalTabel(d.jadwal.slice(0, 6)));
  return { html: html, init: () => { $('#tk-cepat').addEventListener('submit', e => { e.preventDefault(); navigateTo('tk-cek', { params: { q: $('#tk-q0').value } }); }); } };
}

async function renderTkJadwal() {
  const d = await tkData(true);
  const html = wrap(sectionTitle('Jadwal & Tarif', 'Jadwal keberangkatan 30 hari ke depan') +
    '<div class="' + CARD + ' p-4 mb-5 flex flex-wrap items-end gap-3"><div>' + field('Tanggal', '<input id="tk-ftgl" type="date" class="' + INP + '" min="' + esc(d.hari) + '">') + '</div><button type="button" id="tk-fsemua" class="' + BTN_S + '">Tampilkan semua</button></div><div id="tk-jdtab"></div>');
  return { html: html, init: () => {
    const gambar = () => { const t = $('#tk-ftgl').value; $('#tk-jdtab').innerHTML = tkJadwalTabel(t ? d.jadwal.filter(j => j.tanggal === t) : d.jadwal); };
    $('#tk-ftgl').addEventListener('change', gambar); $('#tk-fsemua').addEventListener('click', () => { $('#tk-ftgl').value = ''; gambar(); }); gambar();
  } };
}

/* ---- Pemesanan (dipakai publik dan loket admin) ---- */
async function tkPesanPage(p, admin) {
  const d = await tkData(true), st = TK.book = { tgl: d.hari, jid: (p && p.id) || null, q: { d: 1, a: 0, rb: 0, rk: 0 } };
  if (st.jid) { const j0 = d.jadwal.find(x => x.id === st.jid); if (j0) st.tgl = j0.tanggal; else st.jid = null; }
  if (!st.jid && d.jadwal.length && !d.jadwal.some(j => j.tanggal === st.tgl)) st.tgl = d.jadwal[0].tanggal;   // tanggal awal = keberangkatan terdekat
  const card = (judul, isi) => '<div class="' + CARD + ' p-5 md:p-6"><h2 class="font-headline font-bold text-primary-container mb-4">' + judul + '</h2>' + isi + '</div>';
  const form = '<form id="tk-form" class="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start"><div class="space-y-6 min-w-0">' +
    card('1. Pilih jadwal', '<div class="max-w-xs mb-4">' + field('Tanggal keberangkatan', '<input id="pTgl" type="date" class="' + INP + '" min="' + esc(d.hari) + '" value="' + esc(st.tgl) + '" required>') + '</div><div id="tk-jdlist" class="space-y-3"></div>') +
    card('2. Data pemesan', '<div class="grid gap-4 sm:grid-cols-2">' +
      field('Nama lengkap <span class="text-error">*</span>', '<input id="pNama" class="' + INP + '" required maxlength="100" autocomplete="name">') +
      field('NIK (opsional)', '<input id="pNik" class="' + INP + '" inputmode="numeric" pattern="\\d{16}" maxlength="16" title="16 digit angka" placeholder="16 digit">') +
      field('No. HP / WhatsApp <span class="text-error">*</span>', '<input id="pHp" type="tel" class="' + INP + '" required inputmode="tel" placeholder="081234567890" autocomplete="tel">') +
      field('Email (opsional)', '<input id="pEmail" type="email" class="' + INP + '" autocomplete="email">') +
      '<div class="sm:col-span-2">' + field('Alamat <span class="text-error">*</span>', '<input id="pAlamat" class="' + INP + '" required maxlength="200" autocomplete="street-address">') + '</div></div>' +
      '<p class="text-xs text-on-surface-variant mt-3">Email diisi bila ingin menerima tiket PDF lewat email. Nama dan nomor HP tampil tersamarkan pada pencarian lewat nomor HP.</p>') +
    card('3. Jumlah penumpang & kendaraan', '<div id="tk-qty" class="grid gap-3 sm:grid-cols-2"></div>') + '</div>' +
    '<aside class="lg:sticky lg:top-32"><div class="' + CARD + ' overflow-hidden"><div class="h-1.5 bg-gradient-to-r from-secondary via-secondary-container to-secondary"></div><div class="p-5 space-y-4"><h2 class="font-headline font-bold text-primary-container">Rincian biaya</h2><div id="tk-sum" class="text-sm"></div>' +
    (admin ? '<label class="flex items-center gap-2 text-sm bg-[#FFFBEB] rounded-lg p-3"><input type="checkbox" id="tk-lunas" class="w-4 h-4"> <span>Pembayaran sudah diterima di loket &mdash; tandai <b>LUNAS</b></span></label>' : '<div class="absolute -left-[9999px]" aria-hidden="true"><input id="tk-hp" tabindex="-1" autocomplete="off"></div>') +
    '<button type="submit" id="tk-submit" class="' + BTN_A + ' w-full">' + ic('confirmation_number', '!text-[20px]') + ' ' + (admin ? 'Terbitkan tiket' : 'Konfirmasi pemesanan') + '</button>' +
    '<p class="text-xs text-on-surface-variant">' + (admin ? 'Pemesanan tercatat sebagai input petugas.' : 'Tiket berlaku setelah pembayaran diverifikasi petugas.') + '</p></div></div></aside></form>';
  const body = '<div id="tk-body">' + (admin ? '' : '') + form + '</div>';
  const html = admin ? adminLayout('admin-tk-pesan', 'Pesan Tiket (Loket)', body) : wrap(sectionTitle(admin ? 'Loket' : 'Pemesanan mandiri', 'Formulir Pemesanan Tiket') + body);
  return { html: html, init: () => {
    const cur = () => d.jadwal.find(j => j.id === st.jid), hm = { d: 'hD', a: 'hA', rb: 'hRB', rk: 'hRK' };
    const drawJadwal = () => {
      const l = d.jadwal.filter(j => j.tanggal === st.tgl);
      if (st.jid && !l.some(j => j.id === st.jid)) st.jid = null;
      $('#tk-jdlist').innerHTML = l.length ? l.map(j => {
        const on = j.id === st.jid, penuh = j.sisaP === 0;
        return '<button type="button" data-pick="' + esc(j.id) + '"' + (penuh ? ' disabled' : '') + ' aria-pressed="' + on + '" class="w-full text-left rounded-lg border-2 p-4 transition ' + (on ? 'border-primary-container bg-surface-container-low' : 'border-[#E2E8F0] hover:border-secondary') + (penuh ? ' opacity-50' : '') + '"><div class="flex flex-wrap justify-between gap-2"><div><div class="font-semibold text-primary-container">' + esc(j.kapal) + ' <span class="text-xs font-normal text-on-surface-variant">' + esc(j.tipe) + '</span></div><div class="text-sm">' + esc(j.asal) + ' &rarr; ' + esc(j.tujuan) + ' &bull; <b class="font-mono">' + esc(j.jam) + '</b> WITA</div></div><div class="text-right text-xs"><div>Dewasa <b>' + tkRp(j.hD) + '</b> &bull; Anak <b>' + tkRp(j.hA) + '</b></div><div class="mt-1">' + (penuh ? tkBadge('Penuh') : j.sisaP == null ? tkBadge('Aktif', 'Tersedia') : tkBadge('Info', 'Sisa ' + j.sisaP + ' kursi')) + '</div></div></div></button>';
      }).join('') : '<p class="text-sm text-on-surface-variant">Tidak ada jadwal pada tanggal ini. Coba tanggal lain.</p>';
    };
    const drawQty = () => {
      const j = cur();
      $('#tk-qty').innerHTML = [['d', 'Dewasa'], ['a', 'Anak'], ['rb', 'Kendaraan R2 besar'], ['rk', 'Kendaraan R2 kecil']].map(b => {
        const h = j ? j[hm[b[0]]] : null, off = !j || h == null;
        return '<div class="flex items-center justify-between gap-3 bg-surface-container-low rounded-lg p-3' + (off && j ? ' opacity-60' : '') + '"><div><div class="font-semibold text-primary-container text-sm">' + b[1] + '</div><div class="text-xs text-on-surface-variant">' + (!j ? 'Pilih jadwal dahulu' : h == null ? 'Tidak dilayani kapal ini' : tkRp(h) + ' / ' + (b[0][0] === 'r' ? 'unit' : 'orang')) + '</div></div>' +
          '<div class="flex items-center gap-2"><button type="button" aria-label="Kurangi ' + b[1] + '" data-q="' + b[0] + '" data-d="-1" class="w-9 h-9 rounded border border-[#CBD5E1] bg-white font-bold disabled:opacity-40"' + (off ? ' disabled' : '') + '>&minus;</button><span class="w-6 text-center font-bold font-mono" aria-live="polite">' + st.q[b[0]] + '</span><button type="button" aria-label="Tambah ' + b[1] + '" data-q="' + b[0] + '" data-d="1" class="w-9 h-9 rounded bg-primary-container text-white font-bold disabled:opacity-40"' + (off ? ' disabled' : '') + '>+</button></div></div>';
      }).join('');
    };
    const drawSum = () => {
      const j = cur(); let tot = 0, h = '';
      if (!j) h = '<p class="text-on-surface-variant">Pilih jadwal untuk melihat rincian.</p>';
      else {
        h = '<div class="bg-surface-container-low rounded-lg p-3 mb-3 text-xs space-y-1"><div><b>' + esc(j.kapal) + '</b></div><div>' + esc(j.asal) + ' &rarr; ' + esc(j.tujuan) + '</div><div>' + esc(fmtDate(j.tanggal)) + ' &bull; ' + esc(j.jam) + ' WITA</div></div>';
        [['d', 'Dewasa'], ['a', 'Anak'], ['rb', 'R2 besar'], ['rk', 'R2 kecil']].forEach(b => { const q = st.q[b[0]], hg = j[hm[b[0]]] || 0; if (q > 0) { tot += q * hg; h += '<div class="flex justify-between py-1"><span>' + b[1] + ' &times; ' + q + '</span><span class="font-mono">' + tkRp(q * hg) + '</span></div>'; } });
      }
      h += '<div class="flex justify-between items-baseline border-t-2 border-primary-container mt-2 pt-3"><span class="font-bold">Total</span><span class="font-headline text-2xl font-bold text-primary-container font-mono">' + tkRp(tot) + '</span></div>';
      $('#tk-sum').innerHTML = h;
      $('#tk-submit').disabled = !j || (st.q.d + st.q.a < 1);
    };
    const semua = () => { drawJadwal(); drawQty(); drawSum(); }; semua();
    $('#tk-body').addEventListener('click', e => {
      const b = e.target.closest('[data-pick],[data-q]'); if (!b) return;
      if (b.dataset.pick) { st.jid = b.dataset.pick; const j = cur(); ['rb', 'rk'].forEach(k => { if (j && j[hm[k]] == null) st.q[k] = 0; }); semua(); }
      else { const k = b.dataset.q; st.q[k] = Math.max(0, Math.min(25, st.q[k] + Number(b.dataset.d))); drawQty(); drawSum(); }
    });
    $('#pTgl').addEventListener('change', e => { st.tgl = e.target.value; st.jid = null; semua(); });
    $('#tk-form').addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!st.jid) return toast('Pilih jadwal terlebih dahulu.', 'warn');
      const data = { jadwalId: st.jid, nama: $('#pNama').value, nik: $('#pNik').value, hp: $('#pHp').value, email: $('#pEmail').value, alamat: $('#pAlamat').value, dewasa: st.q.d, anak: st.q.a, r2Besar: st.q.rb, r2Kecil: st.q.rk };
      await tkRun($('#tk-submit'), async () => {
        const v = admin ? await tkAdm('buat', data, !!($('#tk-lunas') && $('#tk-lunas').checked)) : await tkApi('tkPesan', Object.assign(data, { website: $('#tk-hp').value }));
        TK.at = 0; tkSukses($('#tk-body'), v, admin);
      });
    });
  } };
}
function tkSukses(el, v, admin) {
  const info = (TK.pub && TK.pub.cfg && TK.pub.cfg.infoPembayaran) || '';
  el.innerHTML = '<div class="max-w-3xl space-y-5' + (admin ? '' : ' mx-auto') + '"><div class="' + CARD + ' p-5 flex gap-3 items-start"><span class="text-[#047857]">' + ic('check_circle', '!text-[32px]') + '</span><div><h2 class="font-headline text-xl font-bold text-primary-container">Pemesanan berhasil dibuat</h2><p class="text-sm text-on-surface-variant">Simpan kode tiket di bawah ini. ' + (v.sah ? 'Tiket sudah LUNAS.' : 'Selesaikan pembayaran agar tiket berlaku.') + '</p></div></div>' +
    tkKartu(v) +
    (v.sah ? '' : '<div class="' + CARD + ' p-5"><h3 class="font-headline font-bold text-primary-container mb-1">Langkah pembayaran</h3><p class="text-sm whitespace-pre-line">' + esc(info) + '</p></div>') +
    tkAksiKartu(v).replace(/<\/div>$/, '<button type="button" data-nav="' + (admin ? 'admin-tk-tiket' : 'sidikapet') + '" class="' + BTN_S + '">Selesai</button></div>') + '</div>';
  tkQr(el); window.scrollTo(0, 0);
}

async function renderTkCek(p) {
  await tkData();
  const html = wrap(sectionTitle('Layanan mandiri', 'Cek Status Tiket') + '<div class="max-w-3xl">' +
    '<form id="tk-fcek" class="' + CARD + ' p-5 md:p-6 space-y-4"><div class="grid grid-cols-2 gap-1 p-1 bg-surface-container rounded-lg" role="tablist"><button type="button" role="tab" data-mode="kode" class="min-h-[40px] rounded font-semibold text-sm"></button><button type="button" role="tab" data-mode="hp" class="min-h-[40px] rounded font-semibold text-sm"></button></div>' +
    '<label class="block"><span id="tk-lblcek" class="block text-sm font-semibold mb-1.5"></span><input id="tk-qcek" class="' + INP + ' font-mono" required></label>' +
    '<button type="submit" id="tk-btncek" class="' + BTN_P + ' w-full">' + ic('search', '!text-[18px]') + ' Periksa tiket</button><p class="text-xs text-on-surface-variant">Pencarian dengan nomor HP menampilkan tiket terbaru dengan nama disamarkan.</p></form>' +
    '<div id="tk-hasil" class="mt-6 space-y-4"></div></div>');
  return { html: html, init: () => {
    const tab = () => {
      $$('[data-mode]').forEach(b => { const on = b.dataset.mode === TK.mode; b.className = 'min-h-[40px] rounded font-semibold text-sm inline-flex items-center justify-center gap-2 ' + (on ? 'bg-white text-primary-container shadow' : 'text-on-surface-variant'); b.setAttribute('aria-selected', on); b.innerHTML = b.dataset.mode === 'kode' ? ic('qr_code_scanner', '!text-[18px]') + ' Kode tiket' : ic('call', '!text-[18px]') + ' Nomor HP'; });
      $('#tk-lblcek').textContent = TK.mode === 'kode' ? 'Kode tiket' : 'Nomor HP / WhatsApp';
      $('#tk-qcek').placeholder = TK.mode === 'kode' ? 'SDK-261015-AB12CD' : '081234567890';
    };
    const tunjuk = v => { $('#tk-hasil').innerHTML = tkKartu(v) + tkAksiKartu(v); tkQr($('#tk-hasil')); };
    const cari = async () => {
      await tkRun($('#tk-btncek'), async () => {
        let r;
        try { r = await tkApi('tkCek', { mode: TK.mode, q: $('#tk-qcek').value }); } catch (x) { $('#tk-hasil').innerHTML = ''; throw x; }
        TK.cek = r;
        if (r.length === 1) tunjuk(r[0]);
        else $('#tk-hasil').innerHTML = '<div class="' + CARD + ' overflow-hidden">' + tkTabel(['Kode', 'Berangkat', 'Rute', 'Status', ''], r.map((v, i) => '<tr><td data-l="Kode" class="p-3 font-mono text-xs">' + esc(v.kode) + '</td><td data-l="Berangkat" class="p-3">' + esc(fmtDate(v.tanggal)) + '</td><td data-l="Rute" class="p-3">' + esc(v.asal) + ' &rarr; ' + esc(v.tujuan) + '</td><td data-l="Status" class="p-3">' + tkBadge(tkStatusTiket(v)) + '</td><td class="p-3 text-right"><button type="button" data-lihat="' + i + '" class="' + BTN_S + ' !min-h-[36px] !px-3">Lihat</button></td></tr>').join('')) + '</div>';
      });
    };
    $('#tk-fcek').addEventListener('click', e => { const m = e.target.closest('[data-mode]'); if (m) { TK.mode = m.dataset.mode; tab(); } });
    $('#tk-hasil').addEventListener('click', e => { const l = e.target.closest('[data-lihat]'); if (l) tunjuk(TK.cek[+l.dataset.lihat]); });
    $('#tk-fcek').addEventListener('submit', e => { e.preventDefault(); cari(); });
    tab(); if (p && p.q) { $('#tk-qcek').value = p.q; cari(); }
  } };
}

/* =====================================================================
   HALAMAN ADMIN SIDIKAPET
   ===================================================================== */
function tkBaris(t) {
  const aksi = '<div class="flex flex-wrap gap-1.5 md:justify-end">' +
    '<button type="button" data-tk="detail" data-k="' + esc(t.kode) + '" aria-label="Detail ' + esc(t.kode) + '" class="' + BTN_S + ' !min-h-[34px] !px-2.5">' + ic('visibility', '!text-[18px]') + '</button>' +
    (t.bayar === 'Belum Bayar' && t.status !== 'Batal' ? '<button type="button" data-tk="lunas" data-k="' + esc(t.kode) + '" class="' + BTN + ' !min-h-[34px] !px-3 bg-[#047857] text-white hover:bg-[#065f46]">Lunas</button>' : '') +
    (t.status !== 'Batal' ? '<button type="button" data-tk="batal" data-k="' + esc(t.kode) + '" class="' + BTN + ' !min-h-[34px] !px-3 bg-error text-white hover:opacity-90">Batal</button>' : '') +
    '<button type="button" data-tk="pdf" data-k="' + esc(t.kode) + '" aria-label="PDF ' + esc(t.kode) + '" class="' + BTN_S + ' !min-h-[34px] !px-2.5">' + ic('picture_as_pdf', '!text-[18px]') + '</button></div>';
  return '<tr><td data-l="Kode" class="p-3 font-mono text-xs">' + esc(t.kode) + '<div class="text-on-surface-variant font-sans">' + esc(fmtDateTime(t.waktu)) + '</div></td>' +
    '<td data-l="Pemesan" class="p-3"><div class="font-semibold">' + esc(t.nama) + '</div><div class="text-xs text-on-surface-variant">' + esc(t.hp) + '</div></td>' +
    '<td data-l="Jadwal" class="p-3">' + esc(t.rute) + '<div class="text-xs text-on-surface-variant">' + esc(t.kapal) + ' &bull; ' + esc(fmtDate(t.tgl)) + ' ' + esc(t.jam) + '</div></td>' +
    '<td data-l="Muatan" class="p-3 text-xs">' + t.pax + ' org' + (t.r2 ? ' &bull; ' + t.r2 + ' R2' : '') + '</td>' +
    '<td data-l="Total" class="p-3 font-mono">' + tkRp(t.total) + '</td>' +
    '<td data-l="Status" class="p-3">' + tkBadge(tkStatusTiket(t)) + '</td>' +
    '<td class="p-3">' + aksi + '</td></tr>';
}
const tkTabelTiket = rows => tkTabel(['Kode', 'Pemesan', 'Jadwal', 'Muatan', 'Total', 'Status', ''], rows.map(tkBaris).join(''));
const tkLoketBtn = '<button type="button" data-nav="admin-tk-pesan" class="' + BTN_A + ' !min-h-[40px]">' + ic('add_circle', '!text-[18px]') + ' Pesan tiket loket</button>';
const tkLoading = '<div class="py-10 text-center text-on-surface-variant"><span class="spin spin-lg"></span></div>';
const tkKosong = (pesan, icon) => '<div class="p-10 text-center text-on-surface-variant">' + ic(icon || 'inbox', '!text-[40px] text-outline') + '<p class="mt-2">' + esc(pesan) + '</p></div>';

async function renderAdminTkDash() {
  const d = await tkAdm('dasbor');
  const k = d.kapal, sub4 = (k.Kritis + k.Kedaluwarsa) ? k.Kritis + ' kapal masa kritis &bull; ' + k.Kedaluwarsa + ' kedaluwarsa' : k.Aktif + ' kapal aktif';
  const inner = '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">' +
    tkKpi('confirmation_number', 'Pemesanan hari ini', d.pesanHariIni, 'Tiket dibuat hari ini') +
    tkKpi('groups', 'Penumpang berangkat hari ini', d.pnpHariIni, 'Tidak termasuk tiket batal') +
    tkKpi('payments', 'Pendapatan bulan ini', tkRp(d.pendBulan), 'Tiket LUNAS, tanggal berangkat bulan ini') +
    tkKpi('pending_actions', 'Menunggu verifikasi', d.jmlMenunggu, sub4) + '</div>' +
    '<div class="' + CARD + ' p-5 mb-6"><h2 class="font-headline font-bold text-primary-container mb-3">Penumpang 7 hari terakhir</h2><div class="h-56"><canvas id="tk-gdash" role="img" aria-label="Grafik penumpang 7 hari terakhir"></canvas></div></div>' +
    '<div class="' + CARD + ' overflow-hidden"><div class="p-5 border-b border-[#F1F5F9] flex items-center gap-2">' + ic('pending_actions', 'text-[#B45309]') + '<h2 class="font-headline font-bold text-primary-container">Menunggu verifikasi pembayaran</h2></div>' +
    (d.menunggu.length ? tkTabelTiket(d.menunggu) : tkKosong('Tidak ada tiket menunggu verifikasi.', 'task_alt')) + '</div>' +
    '<p class="text-xs text-on-surface-variant mt-4">Kuota email hari ini: <b>' + (d.kuotaEmail == null ? '-' : d.kuotaEmail) + '</b> (akun Gmail biasa &plusmn;100/hari, dipakai bersama notifikasi pengaduan).</p>';
  return { html: adminLayout('admin-tk-dash', 'SIDIKAPET — Dasbor Operasional', inner, tkLoketBtn), init: () => { tkGrafik('tk-gdash', 'bar', d.grafik.map(x => tkTglPendek(x.tgl)), d.grafik.map(x => x.penumpang), 'Penumpang', '#0f2942'); } };
}

async function renderAdminTkPesan() { return tkPesanPage({}, true); }

async function renderAdminTkTiket() {
  const inner = '<form id="tk-ft" class="' + CARD + ' p-4 grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end mb-6"><div class="lg:col-span-2">' + field('Cari kode / nama / HP', '<input id="tQ" class="' + INP + '">') + '</div>' +
    field('Berangkat dari', '<input id="tDari" type="date" class="' + INP + '">') + field('Sampai', '<input id="tSampai" type="date" class="' + INP + '">') +
    field('Status', tkSel('tBayar', [['', 'Semua'], ['Belum Bayar', 'Belum bayar'], ['Lunas', 'Lunas'], ['Batal', 'Batal']], '')) +
    '<button type="submit" class="' + BTN_P + '">' + ic('search', '!text-[18px]') + ' Cari</button>' +
    '<label class="text-xs flex items-center gap-2 lg:col-span-6"><input type="checkbox" id="tSemua"> Cari di seluruh arsip (lebih lambat)</label></form><div class="' + CARD + ' overflow-hidden" id="tHasil"></div>';
  return { html: adminLayout('admin-tk-tiket', 'Tiket & Penumpang', inner, tkLoketBtn), init: () => {
    const muat = async () => {
      const box = $('#tHasil'); if (!box) return; box.innerHTML = tkLoading;
      try {
        const r = await tkAdm('tiketList', { q: $('#tQ').value, dari: $('#tDari').value, sampai: $('#tSampai').value, bayar: $('#tBayar').value, semua: $('#tSemua').checked });
        const b2 = $('#tHasil'); if (!b2) return;
        b2.innerHTML = r.length ? '<div class="px-4 py-2 text-xs text-on-surface-variant border-b border-[#F1F5F9]">' + r.length + ' tiket (maks. 300 terbaru)</div>' + tkTabelTiket(r) : tkKosong('Tidak ada tiket yang cocok.');
      } catch (x) { if ($('#tHasil')) $('#tHasil').innerHTML = ''; if (x.message !== 'SESI') toast(x.message, 'error'); }
    };
    $('#tk-ft').addEventListener('submit', e => { e.preventDefault(); muat(); }); muat();
  } };
}

async function renderAdminTkKapal() {
  let ks = await tkAdm('kapalList');
  const inner = '<div class="' + CARD + ' p-4 mb-6">' + field('Cari kapal / owner / nomor izin', '<input id="kQ" class="' + INP + ' max-w-md">') + '</div><div class="' + CARD + ' overflow-hidden" id="kTab"></div>';
  const aksi = '<button type="button" id="k-baru" class="' + BTN_A + ' !min-h-[40px]">' + ic('add_circle', '!text-[18px]') + ' Tambah kapal</button>';
  return { html: adminLayout('admin-tk-kapal', 'Data Kapal & Sertifikat', inner, aksi), init: () => {
    const gambar = () => {
      const q = $('#kQ').value.toLowerCase(), l = ks.filter(k => (k.nama + ' ' + k.owner + ' ' + k.izin).toLowerCase().indexOf(q) >= 0);
      $('#kTab').innerHTML = l.length ? tkTabel(['ID', 'Kapal', 'Owner', 'Masa berlaku', 'Tarif', 'Sertifikat', ''], l.map(k =>
        '<tr><td data-l="ID" class="p-3 font-mono text-xs">' + esc(k.id) + '</td><td data-l="Kapal" class="p-3"><div class="font-semibold text-primary-container">' + esc(k.nama) + '</div><div class="text-xs text-on-surface-variant">' + esc(k.tipe) + ' &bull; ' + esc(k.izin) + '</div></td>' +
        '<td data-l="Owner" class="p-3">' + esc(k.owner) + '<div class="text-xs text-on-surface-variant">' + esc(k.hpOwner) + '</div></td>' +
        '<td data-l="Masa berlaku" class="p-3">' + tkBadge(k.status) + '<div class="text-xs text-on-surface-variant mt-1">' + esc(fmtDate(k.berlaku)) + '</div></td>' +
        '<td data-l="Tarif" class="p-3 text-xs md:whitespace-nowrap">Dewasa ' + tkRp(k.hD) + '<br>Anak ' + tkRp(k.hA) + '<br>R2 ' + (k.hRB == null ? '-' : tkRp(k.hRB)) + ' / ' + (k.hRK == null ? '-' : tkRp(k.hRK)) + '</td>' +
        '<td data-l="Sertifikat" class="p-3">' + (k.sertifikat ? '<button type="button" data-sert="' + esc(k.id) + '" class="' + BTN_S + ' !min-h-[34px] !px-3">' + ic('description', '!text-[18px]') + ' Unduh</button>' : tkBadge('Nonaktif', 'Belum ada')) + '</td>' +
        '<td class="p-3 md:text-right"><button type="button" data-kapal="' + esc(k.id) + '" aria-label="Ubah ' + esc(k.nama) + '" class="' + BTN_S + ' !min-h-[34px] !px-2.5">' + ic('edit', '!text-[18px]') + '</button></td></tr>').join('')) : tkKosong('Belum ada kapal.', 'sailing');
    };
    gambar(); $('#kQ').addEventListener('input', gambar);
    const muatUlang = async () => { ks = await tkAdm('kapalList'); gambar(); };
    $('#k-baru').addEventListener('click', () => tkFormKapal({}, muatUlang));
    $('#kTab').addEventListener('click', e => {
      const s = e.target.closest('[data-sert]'), b = e.target.closest('[data-kapal]');
      if (s) tkRun(s, async () => { const f = await tkAdm('sertUnduh', s.dataset.sert); downloadB64(f.name, f.b64, f.mime); });
      if (b) tkFormKapal(ks.find(k => k.id === b.dataset.kapal) || {}, muatUlang);
    });
  } };
}
function tkFormKapal(k, sesudah) {
  const baru = !k.id;
  const m = openModal(modalHead(baru ? 'Tambah kapal' : 'Ubah kapal ' + k.nama) + '<form id="fK" class="p-6 space-y-4"><div class="grid gap-4 sm:grid-cols-2">' +
    field('Nama kapal *', tkIn('kNama', k.nama, 'text', 'required maxlength="100"')) + field('Nama owner *', tkIn('kOwner', k.owner, 'text', 'required')) +
    field('No. HP owner *', tkIn('kHp', k.hpOwner, 'tel', 'required')) + field('Nomor izin *', tkIn('kIzin', k.izin, 'text', 'required')) +
    field('Tipe kapal *', tkSel('kTipe', [['Kapal Motor', 'Kapal Motor'], ['Speed Boat', 'Speed Boat']], k.tipe)) + field('Masa berlaku *', tkIn('kBerlaku', k.berlaku, 'date', 'required')) +
    field('Harga dewasa (Rp) *', tkIn('kHD', k.hD, 'number', 'required min="0"')) + field('Harga anak (Rp) *', tkIn('kHA', k.hA, 'number', 'required min="0"')) +
    field('Harga R2 besar (Rp)', tkIn('kHRB', k.hRB, 'number', 'min="0" placeholder="kosongkan = tidak melayani"')) + field('Harga R2 kecil (Rp)', tkIn('kHRK', k.hRK, 'number', 'min="0" placeholder="kosongkan = tidak melayani"')) + '</div>' +
    field('Sertifikat kapal (PDF/JPG/PNG, maks. 5 MB)', '<input id="kFile" type="file" accept=".pdf,.jpg,.jpeg,.png" class="' + INP + '">', 'Berkas disimpan di Google Drive dan hanya bisa diunduh petugas.') +
    '<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="kAktif" class="w-4 h-4"' + (baru || k.aktif ? ' checked' : '') + '> Kapal aktif (dapat dijadwalkan)</label>' +
    '<div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" id="btnK" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan</button></div></form>', true);
  $('#fK', m).addEventListener('submit', async e => {
    e.preventDefault();
    await tkRun($('#btnK', m), async () => {
      const file = await readFile($('#kFile', m).files[0], ['application/pdf', 'image/jpeg', 'image/png']);
      const id = await tkAdm('kapalSimpan', { id: k.id, nama: $('#kNama', m).value, owner: $('#kOwner', m).value, hpOwner: $('#kHp', m).value, izin: $('#kIzin', m).value, tipe: $('#kTipe', m).value, berlaku: $('#kBerlaku', m).value, hD: $('#kHD', m).value, hA: $('#kHA', m).value, hRB: $('#kHRB', m).value, hRK: $('#kHRK', m).value, aktif: $('#kAktif', m).checked });
      if (file) await tkAdm('sertUnggah', id, file);
      TK.at = 0; closeModal(); toast('Data kapal tersimpan.'); if (sesudah) await sesudah();
    });
  });
}

async function renderAdminTkJadwal() {
  const h = todayStr();
  const inner = '<form id="fJ" class="' + CARD + ' p-4 flex flex-wrap gap-3 items-end mb-6">' + field('Dari tanggal', tkIn('jDari', h, 'date')) + field('Sampai', tkIn('jSampai', tkGeser(h, 14), 'date')) +
    '<button type="submit" class="' + BTN_P + '">' + ic('filter_alt', '!text-[18px]') + ' Terapkan</button></form><div class="' + CARD + ' overflow-hidden" id="jTab"></div>';
  const aksi = '<button type="button" id="j-salin" class="' + BTN_S + ' !min-h-[40px]">' + ic('content_copy', '!text-[18px]') + ' Salin jadwal</button><button type="button" id="j-baru" class="' + BTN_A + ' !min-h-[40px]">' + ic('add_circle', '!text-[18px]') + ' Tambah jadwal</button>';
  return { html: adminLayout('admin-tk-jadwal', 'Rute & Jadwal', inner, aksi), init: () => {
    let data = [];
    const muat = async () => {
      if (!$('#jTab')) return;
      try {
        data = await tkAdm('jadwalList', { dari: $('#jDari').value, sampai: $('#jSampai').value });
        if (!$('#jTab')) return;
        $('#jTab').innerHTML = data.length ? tkTabel(['Tanggal & jam', 'Rute', 'Kapal', 'Terisi / kuota', 'Status', ''], data.map(j =>
          '<tr><td data-l="Tanggal & jam" class="p-3 whitespace-nowrap"><b>' + esc(fmtDate(j.tanggal)) + '</b><div class="font-mono text-xs">' + esc(j.jam) + ' WITA</div></td><td data-l="Rute" class="p-3">' + esc(j.asal) + ' &rarr; ' + esc(j.tujuan) + '</td><td data-l="Kapal" class="p-3">' + esc(j.kapal) + '</td>' +
          '<td data-l="Terisi / kuota" class="p-3 text-xs">Penumpang ' + j.terisiP + ' / ' + (j.kuotaP || '&infin;') + '<br>R2 ' + j.terisiR + ' / ' + (j.kuotaR || '&infin;') + '</td><td data-l="Status" class="p-3">' + tkBadge(j.status) + '</td>' +
          '<td class="p-3"><div class="flex flex-wrap gap-1.5 md:justify-end"><button type="button" data-jd="' + esc(j.id) + '" aria-label="Ubah jadwal" class="' + BTN_S + ' !min-h-[34px] !px-2.5">' + ic('edit', '!text-[18px]') + '</button>' +
          (j.status === 'Aktif' ? '<button type="button" data-js="' + esc(j.id) + '|Ditutup" class="' + BTN_S + ' !min-h-[34px] !px-3">Tutup</button>' : '<button type="button" data-js="' + esc(j.id) + '|Aktif" class="' + BTN_S + ' !min-h-[34px] !px-3">Aktifkan</button>') +
          (j.status !== 'Batal' ? '<button type="button" data-js="' + esc(j.id) + '|Batal" class="' + BTN + ' !min-h-[34px] !px-3 bg-error text-white hover:opacity-90">Batal</button>' : '') + '</div></td></tr>').join('')) : tkKosong('Tidak ada jadwal pada rentang ini.', 'event_busy');
      } catch (x) { if (x.message !== 'SESI') toast(x.message, 'error'); }
    };
    $('#fJ').addEventListener('submit', e => { e.preventDefault(); muat(); }); muat();
    $('#j-baru').addEventListener('click', () => tkFormJadwal({}, muat));
    $('#j-salin').addEventListener('click', () => {
      const m = openModal(modalHead('Salin jadwal') + '<form id="fS" class="p-6 space-y-4"><p class="text-sm text-on-surface-variant">Menyalin semua jadwal pada tanggal asal ke tanggal tujuan. Kapal dengan masa berlaku habis dan jadwal duplikat dilewati.</p><div class="grid grid-cols-2 gap-4">' +
        field('Dari tanggal', tkIn('zDari', h, 'date', 'required')) + field('Ke tanggal', tkIn('zKe', tkGeser(h, 1), 'date', 'required')) + '</div><div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" id="btnZ" class="' + BTN_P + '">Salin</button></div></form>');
      $('#fS', m).addEventListener('submit', async ev => { ev.preventDefault(); await tkRun($('#btnZ', m), async () => { const r = await tkAdm('jadwalSalin', $('#zDari', m).value, $('#zKe', m).value); TK.at = 0; closeModal(); toast(r.disalin + ' jadwal disalin, ' + r.dilewati + ' dilewati.'); muat(); }); });
    });
    $('#jTab').addEventListener('click', async e => {
      const j = e.target.closest('[data-jd]'), s = e.target.closest('[data-js]');
      if (j) tkFormJadwal(data.find(x => x.id === j.dataset.jd) || {}, muat);
      if (s) {
        const p = s.dataset.js.split('|');
        if (await tkConfirm('Ubah status jadwal', 'Ubah status jadwal menjadi "' + p[1] + '"? Tiket yang sudah dipesan tidak dibatalkan otomatis.')) {
          await tkRun(null, async () => { await tkAdm('jadwalStatus', p[0], p[1]); TK.at = 0; toast('Status jadwal diperbarui.'); await muat(); });
        }
      }
    });
  } };
}
async function tkFormJadwal(j, sesudah) {
  const baru = !j.id;
  await tkRun(null, async () => {
    const ks = (await tkAdm('kapalList')).filter(k => k.aktif);
    if (!ks.length) throw new Error('Belum ada kapal aktif. Tambahkan data kapal terlebih dahulu.');
    const m = openModal(modalHead(baru ? 'Tambah jadwal' : 'Ubah jadwal') + '<form id="fJd" class="p-6 space-y-4"><div class="grid gap-4 sm:grid-cols-2">' +
      field('Kapal *', tkSel('jdKapal', ks.map(k => [k.id, k.nama + ' (' + k.tipe + ')']), j.idKapal)) + field('Tanggal *', tkIn('jdTgl', j.tanggal || todayStr(), 'date', 'required')) +
      field('Asal *', tkIn('jdAsal', j.asal, 'text', 'required maxlength="80"')) + field('Tujuan *', tkIn('jdTuj', j.tujuan, 'text', 'required maxlength="80"')) +
      field('Jam berangkat (WITA) *', tkIn('jdJam', j.jam, 'time', 'required')) + field('Status', tkSel('jdStatus', [['Aktif', 'Aktif'], ['Ditutup', 'Ditutup'], ['Batal', 'Batal']], j.status || 'Aktif')) +
      field('Kuota penumpang (0 = tanpa batas)', tkIn('jdKP', j.kuotaP || 0, 'number', 'min="0"')) + field('Kuota kendaraan R2 (0 = tanpa batas)', tkIn('jdKR', j.kuotaR || 0, 'number', 'min="0"')) + '</div>' +
      '<div class="flex justify-end gap-3"><button type="button" data-act="close-modal" class="' + BTN_S + '">Batal</button><button type="submit" id="btnJd" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan</button></div></form>', true);
    $('#fJd', m).addEventListener('submit', async e => {
      e.preventDefault();
      await tkRun($('#btnJd', m), async () => {
        await tkAdm('jadwalSimpan', { id: j.id, idKapal: $('#jdKapal', m).value, tanggal: $('#jdTgl', m).value, asal: $('#jdAsal', m).value, tujuan: $('#jdTuj', m).value, jam: $('#jdJam', m).value, status: $('#jdStatus', m).value, kuotaP: $('#jdKP', m).value, kuotaR: $('#jdKR', m).value });
        TK.at = 0; closeModal(); toast('Jadwal tersimpan.'); if (sesudah) await sesudah();
      });
    });
  });
}

async function renderAdminTkLaporan() {
  const h = todayStr(), ks = await tkAdm('kapalList');
  const inner = '<form id="fL" class="' + CARD + ' p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end mb-6">' + field('Berangkat dari', tkIn('lDari', h.slice(0, 8) + '01', 'date')) + field('Sampai', tkIn('lSampai', h, 'date')) +
    field('Kapal', tkSel('lKapal', [['', 'Semua kapal']].concat(ks.map(k => [k.id, k.nama])), '')) + '<button type="submit" class="' + BTN_P + '">' + ic('analytics', '!text-[18px]') + ' Tampilkan</button></form><div id="lHasil"></div>';
  const aksi = '<button type="button" data-eks="pdf" class="' + BTN_S + ' !min-h-[40px]">' + ic('picture_as_pdf', '!text-[18px]') + ' Unduh PDF</button><button type="button" data-eks="xlsx" class="' + BTN_P + ' !min-h-[40px]">' + ic('table_view', '!text-[18px]') + ' Unduh Excel</button>';
  return { html: adminLayout('admin-tk-laporan', 'Laporan & Rekapitulasi', inner, aksi), init: () => {
    let f = {}; const charts = [];
    const filter = () => ({ dari: $('#lDari').value, sampai: $('#lSampai').value, kapal: $('#lKapal').value });
    const muat = async () => {
      if (!$('#lHasil')) return;
      f = filter(); $('#lHasil').innerHTML = tkLoading;
      try {
        const r = await tkAdm('laporan', f), R = r.ringkas;
        if (!$('#lHasil')) return;
        if (!r.total) { $('#lHasil').innerHTML = '<div class="' + CARD + '">' + tkKosong('Tidak ada data pada rentang ini.') + '</div>'; return; }
        $('#lHasil').innerHTML = '<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">' + tkKpi('confirmation_number', 'Tiket', R.tiket, 'Tidak termasuk batal') + tkKpi('groups', 'Penumpang', R.penumpang, R.dewasa + ' dewasa &bull; ' + R.anak + ' anak &bull; ' + R.r2 + ' R2') + tkKpi('payments', 'Pendapatan lunas', tkRp(R.lunas), 'Tiket berstatus LUNAS') + tkKpi('hourglass_top', 'Belum lunas', tkRp(R.belum), 'Menunggu verifikasi') + '</div>' +
          '<div class="grid gap-4 lg:grid-cols-3 mb-6">' + [['gHari', 'Penumpang per hari'], ['gKapal', 'Tiket per kapal'], ['gBulan', 'Pendapatan per bulan (Rp)']].map(g => '<div class="' + CARD + ' p-4"><h2 class="font-headline font-bold text-primary-container text-sm">' + g[1] + '</h2><div class="h-52 mt-2"><canvas id="' + g[0] + '" role="img" aria-label="' + g[1] + '"></canvas></div></div>').join('') + '</div>' +
          '<div class="' + CARD + ' overflow-hidden mb-6"><div class="p-4 border-b border-[#F1F5F9] font-headline font-bold text-primary-container">Ringkasan per kapal</div>' + tkTabel(['Kapal', 'Tiket', 'Penumpang', 'Pendapatan lunas'], r.perKapal.map(k => '<tr><td data-l="Kapal" class="p-3 font-semibold">' + esc(k.nama) + '</td><td data-l="Tiket" class="p-3">' + k.tiket + '</td><td data-l="Penumpang" class="p-3">' + k.penumpang + '</td><td data-l="Pendapatan lunas" class="p-3 font-mono">' + tkRp(k.pendapatan) + '</td></tr>').join('')) + '</div>' +
          '<div class="' + CARD + ' overflow-hidden"><div class="p-4 border-b border-[#F1F5F9] font-headline font-bold text-primary-container">Rincian tiket <span class="text-xs font-normal text-on-surface-variant">(200 terbaru dari ' + r.total + '; ekspor memuat semuanya)</span></div>' +
          tkTabel(['Kode', 'Pemesan', 'Jadwal', 'Muatan', 'Total', 'Status'], r.baris.map(t => '<tr><td data-l="Kode" class="p-3 font-mono text-xs">' + esc(t.kode) + '</td><td data-l="Pemesan" class="p-3">' + esc(t.nama) + '</td><td data-l="Jadwal" class="p-3">' + esc(t.rute) + '<div class="text-xs text-on-surface-variant">' + esc(t.kapal) + ' &bull; ' + esc(fmtDate(t.tgl)) + '</div></td><td data-l="Muatan" class="p-3 text-xs">' + t.pax + ' org' + (t.r2 ? ' &bull; ' + t.r2 + ' R2' : '') + '</td><td data-l="Total" class="p-3 font-mono">' + tkRp(t.total) + '</td><td data-l="Status" class="p-3">' + tkBadge(t.bayar) + '</td></tr>').join('')) + '</div>';
        tkGrafik('gHari', 'bar', r.perHari.map(x => tkTglPendek(x.tgl)), r.perHari.map(x => x.penumpang), 'Penumpang', '#0f2942');
        tkGrafik('gKapal', 'bar', r.perKapal.map(x => x.nama), r.perKapal.map(x => x.tiket), 'Tiket', '#006398');
        tkGrafik('gBulan', 'bar', r.perBulan.map(x => x.bulan), r.perBulan.map(x => x.pendapatan), 'Pendapatan', '#F59E0B');
      } catch (x) { if ($('#lHasil')) $('#lHasil').innerHTML = ''; if (x.message !== 'SESI') toast(x.message, 'error'); }
    };
    $('#fL').addEventListener('submit', e => { e.preventDefault(); muat(); }); muat();
    $$('[data-eks]').forEach(b => b.addEventListener('click', () => tkRun(b, async () => { const r = await tkAdm('ekspor', b.dataset.eks, filter()); downloadB64(r.name, r.b64, r.mime); })));
  } };
}

function tkSetKartu(s) {
  return '<form id="fSet" class="' + CARD + ' p-6 space-y-4"><h2 class="font-headline font-bold text-primary-container">Pengaturan SIDIKAPET (tiket kapal)</h2>' +
    field('Petunjuk pembayaran (tampil setelah pemesanan)', '<textarea id="sBayar" rows="4" class="' + INP + '" maxlength="1000">' + esc(s.infoPembayaran) + '</textarea>', 'Cantumkan cara bayar yang berlaku, mis. nomor rekening resmi atau lokasi loket.') +
    field('Catatan pada tiket', '<textarea id="sCat" rows="3" class="' + INP + '" maxlength="1000">' + esc(s.catatan) + '</textarea>') +
    field('Pengiriman email tiket', tkSel('sEmail', [['LUNAS', 'Saat tiket LUNAS (hemat kuota, disarankan)'], ['PESAN', 'Saat pemesanan dibuat'], ['MATI', 'Tidak mengirim email']], s.emailMode), 'Akun Gmail biasa dibatasi ±100 email/hari; akun Google Workspace ±1.500/hari. Kuota ini dipakai bersama notifikasi pengaduan.') +
    '<p class="text-xs text-on-surface-variant">Nama instansi, alamat, telepon, dan WhatsApp pada tiket mengikuti isian di kartu <b>Pengaturan situs</b> di atas.</p>' +
    '<button type="submit" id="btnSet" class="' + BTN_P + '">' + ic('save', '!text-[18px]') + ' Simpan pengaturan tiket</button></form>';
}
function tkSetInit() {
  $('#fSet').addEventListener('submit', async e => { e.preventDefault(); await tkRun($('#btnSet'), async () => { await tkAdm('setSimpan', { infoPembayaran: $('#sBayar').value, catatan: $('#sCat').value, emailMode: $('#sEmail').value }); TK.at = 0; AppState.cache = {}; toast('Pengaturan tiket tersimpan.'); }); });
}

/* ---------- Aksi tiket bersama (publik & admin) ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tk]'); if (!b) return;
  const a = b.dataset.tk, k = b.dataset.k;
  if (a === 'pdf') await tkRun(b, async () => { const r = await tkApi('tkPdf', { kode: k }); downloadB64(r.name, r.b64, r.mime); });
  else if (a === 'detail') await tkRun(b, async () => {
    const v = await tkAdm('detail', k);
    const dd = (l, t, full) => '<div' + (full ? ' class="sm:col-span-2"' : '') + '><dt class="text-xs text-on-surface-variant">' + l + '</dt><dd class="font-semibold">' + t + '</dd></div>';
    const m = openModal(modalHead('Detail tiket') + '<div class="p-6">' + tkKartu(v) + '<dl class="grid sm:grid-cols-2 gap-3 text-sm mt-5">' + dd('NIK', '<span class="font-mono">' + esc(v.nik || '-') + '</span>') + dd('No. HP', esc(v.hp)) + dd('Email', esc(v.email || '-')) + dd('Sumber input', esc(v.sumber)) + dd('Alamat', esc(v.alamat), true) + dd('Diverifikasi', v.diverifikasi ? esc(v.diverifikasi) + ' • ' + esc(fmtDateTime(v.waktuVerif)) : '-', true) + '</dl></div>', true);
    tkQr(m);
  });
  else if (a === 'lunas' || a === 'batal') {
    const lunas = a === 'lunas';
    const ya = await tkConfirm(lunas ? 'Tandai lunas' : 'Batalkan tiket', lunas ? 'Pembayaran tiket ' + k + ' sudah diterima? E-tiket PDF akan dibuat dan dikirim bila email tersedia.' : 'Batalkan tiket ' + k + '? Kuota jadwal akan dikembalikan.', lunas ? 'Ya, tandai lunas' : 'Ya, batalkan');
    if (!ya) return;
    await tkRun(null, async () => {
      const r = await tkAdm('verifikasi', k, lunas ? 'Lunas' : 'Batal'); TK.at = 0;
      toast(lunas ? 'Tiket LUNAS' + (r.email === 'terkirim' ? ', email terkirim.' : '.') : 'Tiket dibatalkan.');
      navigateTo(AppState.page, { params: AppState.params, noHistory: true });
    });
  }
});

/* ---------- Tabel rute & boot ---------- */
const ROUTES = {
  home: renderHome, profil: renderProfil, struktur: renderStruktur, pegawai: renderPegawai, berita: renderBerita, beritaDetail: renderBeritaDetail, agenda: renderAgenda,
  regulasi: renderRegulasi, sidikapet: renderSidikapet, 'tk-pesan': p => tkPesanPage(p, false), 'tk-cek': renderTkCek, 'tk-jadwal': renderTkJadwal, pengaduan: renderPengaduan, survei: renderSurvei, kontak: renderKontak, login: renderLogin,
  'admin-dashboard': renderAdminDashboard, 'admin-pengaduan': renderAdminPengaduan, 'admin-survei': renderAdminSurvei, 'admin-konten': renderAdminKonten, 'admin-pengaturan': renderAdminPengaturan,
  'admin-tk-dash': renderAdminTkDash, 'admin-tk-pesan': renderAdminTkPesan, 'admin-tk-tiket': renderAdminTkTiket, 'admin-tk-kapal': renderAdminTkKapal, 'admin-tk-jadwal': renderAdminTkJadwal, 'admin-tk-laporan': renderAdminTkLaporan, 'admin-tk-set': renderAdminPengaturan
};
// Cangkang situs (header, footer, menu) tampil seketika memakai pengaturan tersimpan di peramban;
// data terbaru diambil bersamaan dengan memuat halaman, lalu cangkang disegarkan.
function renderShell() { renderHeader(); renderFooter(); renderBottomNav(); renderMobileMenu(); if (AppState.page) updateActiveNav(AppState.page); }
async function boot() {
  try { const c = localStorage.getItem('set_cache'); if (c) AppState.settings = JSON.parse(c) || {}; } catch (e) { /* abaikan */ }
  renderShell();
  const b = $('#boot'); if (b) b.remove();
  const bid = (new URLSearchParams(location.search).get('berita') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const nav = navigateTo(bid ? 'beritaDetail' : 'home', bid ? { params: { id: bid }, noHistory: true } : { noHistory: true });
  try {
    const st = (await pub('kontak')).settings || {};
    AppState.settings = st;
    try { localStorage.setItem('set_cache', JSON.stringify(st)); } catch (e) { /* abaikan */ }
    renderShell();
  } catch (e) { /* tetap lanjut */ }
  await nav;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
