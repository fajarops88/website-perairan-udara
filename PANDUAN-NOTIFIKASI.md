# Pembaruan: WhatsApp (Fonnte) + Email + CRM Kontak

Yang baru: notifikasi WhatsApp otomatis untuk pengaduan dan tiket kapal, blast WhatsApp per batch, antrean pengiriman, dan CRM Kontak (nama, email, WhatsApp) beserta impor CSV. Data lama tidak diubah. Hanya ada 4 sheet baru.

## Yang TIDAK berubah
- Semua halaman publik, tiket, pengaduan, dan login admin.
- Email bawaan (tanda terima pengaduan, e-tiket PDF) tetap terkirim seperti biasa.
- `js/config.js` Anda. **Jangan ditimpa.**

## Langkah 1 — Backend (Apps Script), urutan penting
1. Buka proyek Apps Script, salin isi `Kode.gs` lama ke tempat aman sebagai cadangan.
2. Hapus isi `Kode.gs`, tempel isi `Kode.gs` baru, klik **Simpan**.
3. Pilih fungsi `setupAwal`, klik **Jalankan** satu kali. Setup ini aman diulang. Ia membuat 4 sheet baru: AntrianNotif, BlastWA, CRM_Kontak, CRM_Interaksi. Kata sandi admin tidak berubah.
4. **Deploy → Kelola deployment → ikon pensil → Versi baru → Deploy.** Jangan pilih "Deployment baru", supaya alamat /exec tetap sama.

## Langkah 2 — Frontend (GitHub)
Salin 2 file dari zip ke folder `repo-baru`, timpa yang lama: `css/tailwind.css` dan `js/app.js`. Lalu di PowerShell dalam folder `repo-baru`:
```
git status
git add .
git commit -m "Tambah WhatsApp, notifikasi, CRM"
git push
```
Tunggu titik hijau di GitHub, lalu tekan Ctrl+Shift+R di situs.

## Langkah 3 — Hubungkan Fonnte
1. Daftar di fonnte.com, tambah perangkat, pindai QR dengan nomor WhatsApp dinas, lalu salin **token**.
2. Masuk admin, buka **WhatsApp & Notifikasi → Konfigurasi**.
3. Tempel token, klik **Simpan token**. Token disimpan di Script Properties di server. Ia tidak masuk Sheets, log, atau browser. Layar hanya menampilkan versi tersamar.
4. Klik **Cek perangkat**. Harus muncul "Terhubung".
5. Isi nomor WA admin (untuk kabar pengaduan baru), isi alamat situs GitHub Pages Anda, nyalakan **Notifikasi WhatsApp aktif**, lalu **Simpan konfigurasi**.
6. Kirim **tes WA** ke nomor Anda sendiri.

Setelah aktif, pesan otomatis dikirim saat: pengaduan masuk (ke pelapor dan admin), status pengaduan berubah, tiket dipesan, tiket LUNAS, dan tiket dibatalkan. Isi pesan dan kanal tiap peristiwa dapat diubah di tabel **Matriks notifikasi**.

Pesan tidak dikirim langsung. Pesan masuk antrean dan dikirim oleh pengirim otomatis tiap 1 menit, jadi pemesanan tiket tetap cepat. Tombol **Proses sekarang** di tab Antrean mengirim seketika.

## Langkah 4 — CRM dan Blast
- **CRM Kontak → Sinkron sekarang** mengumpulkan kontak dari penumpang, pelapor, dan pemilik kapal. Menekan sinkron berulang tidak membuat data ganda. Tag, catatan, dan opt-out tidak tertimpa.
- **Impor CSV**: header `nama,email,wa` (opsional `segmen,tag`). Tekan **Pindai** dulu untuk melihat hasil tanpa menulis apa pun, baru **Jalankan impor**. Mengimpor berkas yang sama lagi tidak menggandakan kontak.
- **Blast**: pilih segmen, Muat penerima, (opsional) Cek nomor WA, tulis pesan, pilih batch 10/20/50 dan jeda, lalu Mulai blast. Kontak opt-out, nomor tidak valid, dan nomor ganda dibuang otomatis. Maksimal 2.000 penerima per blast.
- Tips agar nomor tidak diblokir WhatsApp: mulai batch 10, jeda acak (mis. `5-10`), jangan kirim pesan yang sama persis ke ratusan orang dalam satu jam.

## Batasan yang jujur
- Semua diuji di simulator dan Chromium (hasil tes: 115 + 96 server, 67 + 40 tampilan lolos). **Belum diuji dengan akun Fonnte dan Apps Script asli.** Uji lewat "Kirim tes WA" dulu. Jika Fonnte menolak format kirim massal, sistem otomatis memakai kirim satu per satu.
- Balasan WhatsApp dari warga tidak tercatat (perlu webhook Fonnte, bisa ditambah nanti).
- Opt-out hanya berlaku untuk blast. Notifikasi tiket dan pengaduan tetap dikirim.
- Pengirim otomatis memakai kuota trigger Apps Script (sekitar 1 detik per menit, jauh di bawah batas harian). Ia hanya dipasang saat WhatsApp atau email dinyalakan.
- Email tambahan di matriks mati secara bawaan, supaya tidak dobel dengan email bawaan. Kuota Gmail sekitar 100 email per hari, dipakai bersama.
- Tidak diterapkan karena tidak perlu untuk 1 admin: token sesi HMAC dan cache menu admin. Yang diterapkan: antrean di luar jalur permintaan, kunci singkat, tulis blok, cache statistik berversi, pemanasan server (`?w=1`), dan pengukur waktu server pada tiap respons.
- Impor dari spreadsheet lain tersedia di server (`crmImpor` dengan `sumber`), tetapi belum ada tombolnya di layar.

## Rollback
Tempel kembali `Kode.gs` cadangan dan buat versi deployment baru. Di GitHub, kembalikan `app.js` dan `tailwind.css` lama. 4 sheet baru boleh dibiarkan.
