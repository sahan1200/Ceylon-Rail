const env = require('./config/env');
const { initDatabase, closeDatabase } = require('./database');
const { createHttpApp } = require('./utils/httpApp');
const { buildApiRouter } = require('./routes/api');
const { errorHandler } = require('./middleware/errorHandler');
const { purgeExpiredSeatLocks } = require('./services/seatLockService');

let serverInstance = null;
let lockCleanupInterval = null;

async function startServer({ port = env.PORT, dbPath = null } = {}) {
  await initDatabase(dbPath);

  const { app, createRouter } = createHttpApp();
  const apiRouter = buildApiRouter(createRouter);

  app.use('/api', apiRouter);
  app.use(errorHandler);

  // Periodic background seat lock expiration cleanup
  lockCleanupInterval = setInterval(() => {
    try {
      purgeExpiredSeatLocks();
    } catch (_e) {}
  }, 30000);
  if (lockCleanupInterval.unref) lockCleanupInterval.unref();

  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      const address = serverInstance.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[Ceylon Rail Backend] Server listening on http://localhost:${actualPort}`);
      }
      resolve({ app, server: serverInstance, port: actualPort });
    });
  });
}

function stopServer() {
  if (lockCleanupInterval) {
    clearInterval(lockCleanupInterval);
    lockCleanupInterval = null;
  }
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null;
        closeDatabase();
        resolve();
      });
    } else {
      closeDatabase();
      resolve();
    }
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Ceylon Rail Backend] Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  stopServer
};
