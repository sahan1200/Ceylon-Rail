const http = require('http');
const { URL } = require('url');

/**
 * Express HTTP application & router helper.
 */
function createHttpApp() {
  try {
    const express = require('express');
    const cors = require('cors');
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));
    return { app, createRouter: () => express.Router(), isNativeFallback: false };
  } catch (_err) {
    // Fallback Express-compatible implementation using Node built-in `http`
    const middlewares = [];
    const errorHandlers = [];

    function compilePath(pattern) {
      const paramNames = [];
      const clean = pattern === '/' ? '' : pattern.replace(/\/$/, '');
      const regexStr =
        '^' +
        clean.replace(/:([A-Za-z0-9_]+)/g, (_m, name) => {
          paramNames.push(name);
          return '([^/]+)';
        }) +
        '/?$';
      return { regex: new RegExp(regexStr || '^/?$'), paramNames };
    }

    function createRouter() {
      const routes = [];
      const routerMiddlewares = [];

      const router = {
        _isRouter: true,
        routes,
        routerMiddlewares,
        use(arg1, arg2) {
          if (typeof arg1 === 'function') {
            routerMiddlewares.push({ prefix: '', fn: arg1 });
          } else if (typeof arg1 === 'string' && arg2) {
            routerMiddlewares.push({ prefix: arg1, fn: arg2 });
          }
        },
        register(method, pathPattern, ...handlers) {
          routes.push({ method: method.toUpperCase(), pathPattern, handlers });
        },
        get(p, ...h) { this.register('GET', p, ...h); },
        post(p, ...h) { this.register('POST', p, ...h); },
        put(p, ...h) { this.register('PUT', p, ...h); },
        patch(p, ...h) { this.register('PATCH', p, ...h); },
        delete(p, ...h) { this.register('DELETE', p, ...h); }
      };
      return router;
    }

    const rootRouter = createRouter();

    const app = {
      use(arg1, arg2) {
        if (typeof arg1 === 'function') {
          if (arg1.length === 4) {
            errorHandlers.push(arg1);
          } else {
            middlewares.push({ prefix: '', handler: arg1 });
          }
        } else if (typeof arg1 === 'string' && arg2) {
          middlewares.push({ prefix: arg1 === '/' ? '' : arg1.replace(/\/$/, ''), handler: arg2 });
        }
      },
      get(p, ...h) { rootRouter.get(p, ...h); },
      post(p, ...h) { rootRouter.post(p, ...h); },
      put(p, ...h) { rootRouter.put(p, ...h); },
      patch(p, ...h) { rootRouter.patch(p, ...h); },
      delete(p, ...h) { rootRouter.delete(p, ...h); },
      listen(port, cb) {
        const server = http.createServer((req, res) => {
          // CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Signature');
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
          }

          // Express-compatible response helpers
          res.status = function (code) {
            res.statusCode = code;
            return res;
          };
          res.set = function (k, v) {
            res.setHeader(k, v);
            return res;
          };
          res.json = function (obj) {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify(obj));
            return res;
          };
          res.send = function (body) {
            if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
              return res.json(body);
            }
            res.end(body);
            return res;
          };

          const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          req.path = parsedUrl.pathname;
          req.query = Object.fromEntries(parsedUrl.searchParams.entries());
          req.params = {};
          req.ip = req.socket?.remoteAddress || '127.0.0.1';

          // Parse JSON body
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', async () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            req.rawBody = raw;
            if (raw) {
              try {
                req.body = JSON.parse(raw);
              } catch (_e) {
                req.body = {};
              }
            } else {
              req.body = {};
            }

            // Collect flattened routes & middlewares
            const pipeline = [];
            for (const mw of middlewares) {
              if (typeof mw.handler === 'function') {
                pipeline.push({ type: 'mw', fn: mw.handler });
              } else if (mw.handler && mw.handler._isRouter) {
                for (const rmw of mw.handler.routerMiddlewares) {
                  pipeline.push({ type: 'mw', fn: rmw.fn });
                }
                for (const r of mw.handler.routes) {
                  const fullPattern = (mw.prefix + (r.pathPattern === '/' ? '' : r.pathPattern)) || '/';
                  pipeline.push({
                    type: 'route',
                    method: r.method,
                    compiled: compilePath(fullPattern),
                    handlers: r.handlers
                  });
                }
              }
            }
            for (const r of rootRouter.routes) {
              pipeline.push({
                type: 'route',
                method: r.method,
                compiled: compilePath(r.pathPattern),
                handlers: r.handlers
              });
            }

            // Execute pipeline
            const chain = [];
            let routeMatched = false;
            for (const item of pipeline) {
              if (item.type === 'mw') {
                chain.push(item.fn);
              } else if (item.type === 'route' && !routeMatched) {
                if (item.method === req.method) {
                  const match = item.compiled.regex.exec(req.path);
                  if (match) {
                    routeMatched = true;
                    const params = {};
                    item.compiled.paramNames.forEach((name, idx) => {
                      params[name] = decodeURIComponent(match[idx + 1]);
                    });
                    chain.push((rq, _rs, nxt) => {
                      rq.params = params;
                      nxt();
                    });
                    chain.push(...item.handlers);
                  }
                }
              }
            }

            if (!routeMatched) {
              // Run global middlewares then 404
              chain.push((rq, rs) => {
                rs.status(404).json({
                  success: false,
                  error: `Route not found: ${rq.method} ${rq.path}`
                });
              });
            }

            let idx = 0;
            const next = (err) => {
              if (err) {
                if (errorHandlers.length > 0) {
                  return errorHandlers[0](err, req, res, () => {});
                }
                res.status(err.statusCode || 500).json({
                  success: false,
                  error: err.message || 'Internal Server Error'
                });
                return;
              }
              if (res.writableEnded) return;
              const fn = chain[idx++];
              if (!fn) return;
              try {
                const maybePromise = fn(req, res, next);
                if (maybePromise && typeof maybePromise.catch === 'function') {
                  maybePromise.catch(next);
                }
              } catch (syncErr) {
                next(syncErr);
              }
            };

            next();
          });
        });

        server.listen(port, cb);
        return server;
      }
    };

    return { app, createRouter, isNativeFallback: true };
  }
}

module.exports = { createHttpApp };
