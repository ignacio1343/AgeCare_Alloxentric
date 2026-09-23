const express = require('express');
const path = require('path');

require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const billingRoutes =
    require('./src/routes/billingRoutes');

const app = express();


// ============================================
// MIDDLEWARE
// ============================================

// Permitir JSON enviado desde el frontend
app.use(express.json());


// ============================================
// API
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/billing',billingRoutes);


// ============================================
// ARCHIVOS PÚBLICOS
// ============================================

const publicPath = path.join(__dirname, 'public');

app.use(express.static(publicPath));


// ============================================
// LOGIN
// ============================================

app.get('/', (req, res) => {

    res.sendFile(
        path.join(publicPath, 'index.html')
    );

});


// ============================================
// SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log('=====================================');
    console.log('AgeCare Administration');
    console.log(`Servidor: http://localhost:${PORT}`);
    console.log(`Login:    http://localhost:${PORT}/`);
    console.log('=====================================');

});