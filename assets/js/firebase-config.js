// Config dari Firebase Console punya lo (Project settings > Your apps > SDK setup)
const firebaseConfig = {
  apiKey: "AIzaSyA4Fs8JExd949EeIo6OMGPLScLpCbJqVHc",
  authDomain: "batch-tracker-produksi-contoh.firebaseapp.com",
  projectId: "batch-tracker-produksi-contoh",
  storageBucket: "batch-tracker-produksi-contoh.firebasestorage.app",
  messagingSenderId: "202011102433",
  appId: "1:202011102433:web:e0ebbe9341d325883fbba0",
  measurementId: "G-72FJN5LJHQ"
};

firebase.initializeApp(firebaseConfig);

// `db` ini dipake di app.js buat baca/tulis data — soalnya semua file JS
// di-load lewat <script> biasa (bukan module), variabel ini otomatis
// "keliatan" juga sama app.js yang di-load setelah file ini.
const db = firebase.firestore();

// Offline persistence: data ke-cache lokal, otomatis sync begitu online lagi.
// `synchronizeTabs: true` bikin persistence tetap aktif walau ada >1 tab
// dari app yang sama kebuka bareng (default-nya cuma 1 tab).
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Biasanya gara-gara ada tab lain dari app yang sama lagi kebuka bareng,
    // dan browser gak support multi-tab sync.
    console.warn('Offline persistence gagal aktif:', err.code);
  } else if (err.code === 'unimplemented') {
    console.warn('Browser ini gak support offline persistence.');
  } else {
    console.error('Persistence error:', err);
  }
});