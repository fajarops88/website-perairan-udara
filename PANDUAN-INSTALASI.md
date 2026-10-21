# Panduan Instalasi — Website Bidang Perairan dan Udara (GitHub Pages + Google Apps Script)

Tampilan website (HTML/CSS/JS) dipasang di **GitHub Pages**. Data dan logika tetap di **Google Apps Script + Google Sheets** yang sudah Bapak pakai. Data lama tidak berubah.

## Isi paket
- `Kode.gs` — backend (disalin ke Apps Script, **tidak** di-upload ke GitHub)
- `website-perairan-udara.zip` — frontend (folder ini yang di-upload ke GitHub)

---
## BAGIAN 1 — Backend (Apps Script)

> Versi lama (iframe) **tetap hidup** selama Bapak tidak mengubah deployment lama. Kita membuat deployment BARU dengan alamat /exec baru.

1. Buka proyek Apps Script website yang sekarang.
2. Buka `Kode.gs`, hapus semua isinya, lalu tempel isi `Kode.gs` yang baru. Simpan.
3. **Jangan hapus** `Index.html`, `JavaScript.html`, `Stylesheet.html` dulu (deployment lama masih memakainya).
4. Pilih fungsi `setupAwal` → **Run**. Setujui izin yang muncul (ada izin baru permintaan ke layanan luar). Aman diulang, data tidak terhapus.
5. **Deploy → New deployment** → ikon roda gigi → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy**, lalu **salin URL yang berakhiran `/exec`**.
6. Tes: tempel URL itu di tab browser. Harus muncul teks JSON berisi `"status":"hidup"`.

---
## BAGIAN 2 — Frontend (GitHub Pages)

1. Ekstrak `website-perairan-udara.zip`. Folder hasil ekstraksi **adalah** folder proyek. Di dalamnya langsung ada `index.html`, `css`, `js` (tidak ada folder pembungkus lagi).
2. Buka `js/config.js` dengan Notepad, ganti `https://script.google.com/macros/s/XXXX/exec` dengan URL /exec dari Bagian 1 langkah 5. Simpan.
3. Buat repository baru di github.com (akun `fajarops88`): nama `website-perairan-udara`, **Public**, jangan centang README/.gitignore/license.
4. Buka PowerShell **di folder hasil ekstraksi itu** (di File Explorer klik address bar, ketik `powershell`, Enter). Pastikan `dir` menampilkan `index.html`, `css`, `js`.
5. Jalankan satu per satu:
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/fajarops88/website-perairan-udara.git
git push -u origin main
```
   Saat diminta password, tempel **Personal Access Token** (GitHub → Settings → Developer settings → Tokens (classic) → centang `repo`). Layar tidak menampilkan karakter saat menempel; itu normal.
6. Di repo: **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / `(root)` → Save → centang **Enforce HTTPS**.
7. Tunggu 1–2 menit. Alamat situs: `https://fajarops88.github.io/website-perairan-udara/`

## Uji
1. Beranda tampil dan data muncul (berita, agenda).
2. Kirim satu pengaduan uji, cek sheet Pengaduan.
3. Login admin, lalu buka Pengaturan & Log (ada kartu Pengaturan SIDIKAPET).
4. Pesan satu tiket uji, tandai LUNAS, unduh PDF.
5. Tekan F12 → Console: tidak boleh ada merah bertuliskan CORS.

## Memperbarui di kemudian hari
Frontend: ganti berkas, lalu `git add .`, `git commit -m "keterangan"`, `git push`. Tekan Ctrl+Shift+R.
Backend: ubah `Kode.gs`, lalu Deploy → Manage deployments → pensil → **New version** (alamat /exec tetap sama).

## Masalah umum
| Gejala | Penyebab | Solusi |
|---|---|---|
| "Alamat server belum diisi" | `js/config.js` masih XXXX | Isi URL /exec, push ulang |
| "Koneksi ke server gagal" | Akses deployment bukan *Anyone*, atau URL salah | Cek Bagian 1 langkah 5–6 |
| Situs 404 di GitHub | `git init` di folder yang salah | Pastikan `index.html` ada di root repo |
| Tampilan tanpa gaya | Folder `css`/`js` rata di root | Upload lewat terminal, bukan "Upload files" |
| Perubahan backend tak terlihat | Belum membuat New version | Deploy → Manage deployments → New version |

## Setelah semuanya stabil
Ganti kata sandi admin, lalu matikan deployment lama (iframe) bila sudah tidak dipakai.
