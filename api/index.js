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
const ORDER_STATUSES = ['Menunggu', 'Cuci', 'Setrika', 'Siap Diambil', 'Selesai'];
const SERVICE_RATES = {
  'Kiloan Cuci Kering': 7000,
  'Kiloan Cuci Setrika': 10000,
  'Setrika Saja': 6000,
  'Laundry Satuan': 5000,
  'Dry Cleaning': 25000,
  'Cuci Sepatu': 35000,
};
const LEGACY_STATUSES = {
  'Proses': 'Cuci',
  'Belum Diambil': 'Siap Diambil',
  'Sudah Diambil': 'Selesai',
};

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/orders', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    }

    const {
      customerName, phone = '', address = '', preferences = '', serviceType,
      quantity = 1, weightKg = 0, unitPrice, totalHarga, receivedAt, dueAt,
      outletId = 'utama', paymentMethod = 'Tunai', notes = '',
    } = req.body;
    const normalizedServiceType = String(serviceType || '').trim();
    const unitRate = SERVICE_RATES[normalizedServiceType];
    const measuredQuantity = normalizedServiceType.startsWith('Kiloan') || normalizedServiceType === 'Setrika Saja'
      ? Number(weightKg)
      : Number(quantity);
    if (!String(customerName || '').trim() || !normalizedServiceType) {
      return res.status(400).json({ success: false, error: 'Nama pelanggan dan layanan wajib diisi.' });
    }
    if (unitRate && (!Number.isFinite(measuredQuantity) || measuredQuantity <= 0)) {
      return res.status(400).json({ success: false, error: 'Berat atau jumlah layanan tidak valid.' });
    }
    const finalTotal = unitRate ? Math.round(measuredQuantity * unitRate) : Number(totalHarga);
    if (!Number.isFinite(finalTotal) || finalTotal < 0) {
      return res.status(400).json({ success: false, error: 'Total harga tidak valid.' });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const newOrder = {
      customerName: String(customerName).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      preferences: String(preferences).trim(),
      serviceType: normalizedServiceType,
      quantity: Number(quantity) || 1,
      weightKg: Number(weightKg) || 0,
      unitPrice: unitRate || Number(unitPrice) || 0,
      totalHarga: finalTotal,
      receivedAt: receivedAt || new Date().toISOString().slice(0, 10),
      dueAt: dueAt || '',
      outletId: String(outletId),
      paymentMethod: String(paymentMethod),
      paymentStatus: 'Lunas',
      notes: String(notes).trim(),
      status: 'Menunggu',
      createdAt: now,
    };

    const docRef = await db.collection('orders').add(newOrder);
    if (newOrder.phone) {
      await db.collection('customers').doc(newOrder.phone.replace(/\D/g, '')).set({
        name: newOrder.customerName,
        phone: newOrder.phone,
        address: newOrder.address,
        preferences: newOrder.preferences,
        updatedAt: now,
      }, { merge: true });
    }
    res.status(201).json({ success: true, id: docRef.id, message: 'Pesanan berhasil dibuat' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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

    await orderRef.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.status(200).json({ success: true, message: 'Status pesanan berhasil diperbarui.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    }

    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      orders.push({ id: doc.id, ...data, status: LEGACY_STATUSES[data.status] || data.status || 'Menunggu' });
    });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const snapshot = await db.collection('customers').orderBy('name').get();
    res.json({ success: true, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/expenses', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const snapshot = await db.collection('expenses').orderBy('date', 'desc').get();
    res.json({ success: true, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const { description, category = 'Operasional', amount, date, outletId = 'utama' } = req.body;
    if (!String(description || '').trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Deskripsi dan nominal pengeluaran wajib valid.' });
    }
    const docRef = await db.collection('expenses').add({
      description: String(description).trim(), category: String(category), amount: Number(amount),
      date: date || new Date().toISOString().slice(0, 10), outletId: String(outletId),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const snapshot = await db.collection('inventory').orderBy('name').get();
    res.json({ success: true, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const { name, quantity, unit = 'pcs', minimum = 0, outletId = 'utama' } = req.body;
    if (!String(name || '').trim() || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ success: false, error: 'Nama dan jumlah stok wajib valid.' });
    }
    const docRef = await db.collection('inventory').add({
      name: String(name).trim(), quantity: Number(quantity), unit: String(unit),
      minimum: Number(minimum) || 0, outletId: String(outletId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/inventory/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return res.status(400).json({ success: false, error: 'Jumlah stok tidak valid.' });
    await db.collection('inventory').doc(req.params.id).update({ quantity, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/outlets', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const snapshot = await db.collection('outlets').orderBy('name').get();
    const outlets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (!outlets.length) outlets.push({ id: 'utama', name: 'Outlet Utama', address: '' });
    res.json({ success: true, data: outlets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/outlets', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ success: false, error: 'Database belum terkoneksi dengan benar.' });
    const { name, address = '' } = req.body;
    if (!String(name || '').trim()) return res.status(400).json({ success: false, error: 'Nama outlet wajib diisi.' });
    const docRef = await db.collection('outlets').add({ name: String(name).trim(), address: String(address).trim(), createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.status(201).json({ success: true, id: docRef.id });
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