# SnapTogether — Web & LDR Duo Photobooth

Aplikasi web photobooth interaktif berbasis **Vue 3 + TypeScript + Vite + Tailwind CSS** yang mendukung **Solo Booth** dan **LDR Duo Booth (WebRTC P2P)** langsung di browser tanpa server media berbayar.

## Fitur Utama

1. **Langkah 1 — Pilih Mode & Desain Bingkai**
   - **Solo Booth** & **LDR Duo Booth** (split-screen kamera lokal & pasangan via PeerJS Room Code / link undangan `?room=SNAP-XXXX`).
   - **6 Preset Bingkai** (*Ocean Breeze*, *Coquette Ribbon*, *Cinema 35mm Film*, *Y2K Cyber Grid*, *Warm Scrapbook*, *Midnight Navy Starlight*) dengan **Live Canvas Preview**.
   - **Upload Bingkai PNG/WebP Custom** dengan deteksi otomatis slot transparan atau tata letak `3 Pose Strip`, `4 Pose Strip`, `4 Pose Grid 2x2`.
2. **Langkah 2 — Sesi Foto, Filter & Retake Per Pose**
   - **Timer Sesi Global 10:00** yang otomatis mulai menghitung mundur saat tombol pengambilan foto pertama ditekan.
   - Switch kamera depan/belakang, *Mirror*, countdown (`3d`, `5d`, `10d`), dan **9 Filter Real-Time** (*Normal, Soft Glow, Cool Blue, B&W Noir, Vintage Sepia, Retro Warm, Film Fade, Cyber Pink, Golden Hour*).
   - Perekaman klip gerak **Live Photo** (~2,5 detik) sebelum shutter snap.
   - **Review & Retake Per Pose** tanpa menghapus pose sebelumnya yang sudah dikunci.
3. **Langkah 3 — Hasil Akhir, Live Photo Video & QR Galeri**
   - Pratinjau **Foto Strip Berbingkai** & **Live Photo Video (Bergerak)**.
   - **4 Paket Aset Lengkap**: Video Live Photo Bergerak, Video Story 9:16, Foto Utama Berbingkai (`.png` HD), dan semua foto polos tanpa bingkai (termasuk unduh ZIP).
   - **QR Barcode & Galeri Digital** (transfer P2P lintas perangkat via PeerJS tanpa server + dukungan opsional upload ke Cloudinary via `.env`).

## Pengembangan Lokal

```bash
npm install
npm run dev
```

## Build & Pengujian

```bash
npm test
npm run build
```

## Konfigurasi Opsional (`.env`)

Salin `.env.example` menjadi `.env` jika ingin menambahkan:
- **TURN Server** (`VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`) untuk koneksi LDR di jaringan seluler dengan NAT ketat.
- **Cloudinary Unsigned Upload** (`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`) untuk menyimpan tautan galeri QR di cloud.
