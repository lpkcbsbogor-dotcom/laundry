const express = require('express');
const admin = require('firebase-admin');
require('dotenv').config();

// Inisialisasi Firebase Admin SDK menggunakan Environment Variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Menanganibackslash padaprivate key dienv
      privateKey: process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined,
    }),
  });
}

const db = admin.firestore();
const app = express();

app.use(express.json());

// Endpoint Root
app.get('/', (req, res) => {
  res.json({ message: 'Selamat datang di API Laundry Backend!' });
});

// 1. Endpoint untuk Menambah Pesanan Laundry
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, serviceType, weightKg, totalHarga } = req.body;
    
    const newOrder = {
      customerName,
      serviceType, // contoh: "Cuci Kering", "Setrika Saja"
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