const express = require('express');
const admin = require('firebase-admin');
const path = require('path'); // Tambahkan modul path
require('dotenv').config();

// ... (kode inisialisasi Firebase admin tetap sama) ...

const db = admin.firestore();
const app = express();

app.use(express.json());

// PENTING: Menyediakan file statis (HTML, CSS, JS frontend) dari folder public
app.use(express.static(path.join(__dirname, '../public')));

// 1. Endpoint untuk Menambah Pesanan Laundry
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, serviceType, weightKg, totalHarga } = req.body;
    
    const newOrder = {
      customerName,
      serviceType,
      weightKg,
      totalHarga,
      status: 'Proses',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('orders').add(newOrder);
    res.status(201).json({ success: true, id: docRef.id, message: 'Pesanan berhasil dibuat' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Endpoint untuk Mendapatkan Daftar Pesanan Laundry
app.get('/api/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Jalankan server secara lokal jika tidak di Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;