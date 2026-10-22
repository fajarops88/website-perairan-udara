# Website Bidang Perairan dan Udara — Dishub Kota Balikpapan
Frontend statis (HTML/CSS/JS) untuk GitHub Pages. Backend: Google Apps Script (REST/JSON).
Isi `js/config.js` dengan URL Web App (`/exec`) sebelum di-upload. Lihat `PANDUAN-INSTALASI.md`.

## Catatan pemeliharaan
- `css/tailwind.css` dibangun otomatis dari kelas yang dipakai di `index.html` dan `js/app.js`. Jika menambah kelas Tailwind baru di kode, berkas ini perlu dibangun ulang (minta Claude membangunnya).
- `canonical`, `sitemap.xml`, dan `robots.txt` memakai alamat `https://fajarops88.github.io/website-perairan-udara/`. Ubah jika alamat situs berbeda.
