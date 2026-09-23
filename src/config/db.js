// src/config/db.js

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

pool.connect()
    .then(client => {
        console.log('Conectado exitosamente a la base de datos');
        client.release();
    })
    .catch(err => {
        console.error('Error de conexión a la BD:', err);
    });

module.exports = pool;