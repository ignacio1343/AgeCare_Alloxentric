const express = require('express');
const path = require('path');
require('dotenv').config();

const authRoutes =
    require('./src/routes/authRoutes');

const billingRoutes =
    require('./src/routes/billingRoutes');

const auditRoutes =
    require('./src/routes/auditRoutes');

const app = express();

app.use(express.json());

app.use(
    '/api/auth',
    authRoutes
);

app.use(
    '/api/billing',
    billingRoutes
);

app.use(
    '/api/admin',
    auditRoutes
);

const publicPath =
    path.join(__dirname, 'public');

app.use(
    express.static(publicPath)
);

app.get('/', (req, res) => {
    res.sendFile(
        path.join(publicPath, 'index.html')
    );
});

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `AgeCare ejecutándose en http://localhost:${PORT}`
    );
});