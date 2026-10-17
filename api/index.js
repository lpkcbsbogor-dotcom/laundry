const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

// Inisialisasi Firebase dengan pengecekan aman
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY 
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
          : undefined,
      }),
    });
  }
} catch (error) {
  console.error('Firebase initialization error:', error.stack);
}

const db = admin.apps.length ? admin.firestore() : null;
const app = express();
const ORDER_STATUSES = ['Proses', 'Selesai', 'Belum Diambil', 'Sudah Diambil'];

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 1. Endpoint untuk Menambah Pesanan Laundry
app.post('/api/orders', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    }

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

// 2. Endpoint untuk Memperbarui Status Pesanan
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    }

    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status pesanan tidak valid.' });
    }

    const orderRef = db.collection('orders').doc(req.params.id);
    const order = await orderRef.get();
    if (!order.exists) {
      return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan.' });
    }

    await orderRef.update({ status });
    res.status(200).json({ success: true, message: 'Status pesanan berhasil diperbarui.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Endpoint untuk Mendapatkan Daftar Pesanan Laundry
app.get('/api/orders', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    }

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