const express = require('express');
const path = require('path');
require('dotenv').config();
const familyGroupRoutes = require('./src/routes/familyGroupRoutes');
const authRoutes = require('./src/routes/authRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const residentRoutes = require('./src/routes/residentRoutes');
const representativeRoutes = require('./src/routes/representativeRoutes');
const caregiverRoutes = require('./src/routes/caregiverRoutes');
const caregiverPortalRoutes = require('./src/routes/caregiverPortalRoutes');
const monitoringRoutes = require('./src/routes/monitoringRoutes');
const app = express();
app.use(express.json());

app.use('/api/auth',authRoutes);
app.use('/api/billing',billingRoutes);
app.use('/api/admin',auditRoutes);
app.use('/api/family-groups',familyGroupRoutes);
app.use('/api/residents',residentRoutes);
app.use('/api/representatives',representativeRoutes);
app.use('/api/caregivers',caregiverRoutes);
app.use('/api/caregiver',caregiverPortalRoutes);
app.use('/api/admin',monitoringRoutes);



const publicPath =path.join(__dirname, 'public');

app.use(express.static(publicPath));
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