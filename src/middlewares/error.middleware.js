// src/middlewares/error.middleware.js
const errorHandler = (err, req, res, next) => {
    console.error(`❌ Error: ${err.message}`);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

module.exports = errorHandler;