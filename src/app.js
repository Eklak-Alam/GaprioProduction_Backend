const express = require('express');
const cors = require('cors');

// --- FIXED IMPORTS (Removed 'src/' prefix because we are already IN src) ---
const authRoutes = require('./routes/auth.routes');
const platformRoutes = require('./routes/platform.routes');
const integrationRoutes = require('./routes/integration.routes');
const errorHandler = require('./middlewares/error.middleware');

// 👇 FIX: Changed from './src/routes/ai.routes' to './routes/ai.routes'
const aiRoutes = require('./routes/ai.routes');
const monitoringRoutes = require('./routes/monitoring.routes');

const app = express();

// 1. FIXED CORS CONFIGURATION
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// 2. PRE-FLIGHT CHECK
app.options(/(.*)/, cors());

app.use(express.json());

// 3. Routes
app.use('/api/auth', authRoutes);
app.use('/api', platformRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/ai', aiRoutes); // ✅ Uses the correctly imported variable
app.use('/api/monitoring', monitoringRoutes); // ✅ Monitoring & Suggested Actions

// 4. Health Check
app.get('/', (req, res) => {
    res.send('✅ Gaprio Backend is working!');
});

// 5. Error Handler
app.use(errorHandler);

module.exports = app;