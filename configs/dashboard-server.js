#!/usr/bin/env node
'use strict';

/**
 * Dashboard Server
 *
 * A Node.js server that:
 * 1. Serves the dashboard.html static page on port 20000 with Basic Auth
 * 2. Creates proxy servers on ports 20001-20004 that:
 *    - Forward requests to actual services
 *    - Inject authentication headers automatically
 *    - Remove security headers to allow iframe embedding
 *    - Support WebSocket connections
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const httpProxy = require('http-proxy');

// ── Supervisor helpers ────────────────────────────────────────────────────────
const SUPERVISOR_VALID_STATES = new Set(['RUNNING','STOPPED','STARTING','FATAL','EXITED','UNKNOWN','BACKOFF']);

function parseSupervisorOutput(out) {
  const services = [];
  for (const line of (out || '').trim().split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
    if (m && SUPERVISOR_VALID_STATES.has(m[2].toUpperCase())) {
      services.push({ name: m[1], state: m[2].toUpperCase(), detail: m[3] || '' });
    }
  }
  return services;
}

// Configuration
const DASHBOARD_PORT = 20000;  // External port with Basic Auth
const DASHBOARD_HTML = '/opt/dashboard.html';

// Proxy port mapping (listen port -> target port)
const PROXY_CONFIG = [
  { listen: 20001, target: 10001, authType: 'basic' },  // Theia IDE
  { listen: 20002, target: 10002, authType: 'basic' },  // Vibe Kanban
  { listen: 20003, target: 10003, authType: 'bearer' }, // OpenClaw AI
  { listen: 20004, target: 10004, authType: 'basic' },  // noVNC
];

// Get authentication credentials from environment
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || 'token';
const VNC_PASSWORD = process.env.VNC_PASSWORD || 'changeme';

// Generate auth headers
const BASIC_AUTH = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASSWORD}`).toString('base64');
const BEARER_AUTH = 'Bearer ' + OPENCLAW_TOKEN;

// Track proxy servers for graceful shutdown
const proxyServers = [];
const httpServers = [];

/**
 * Create a proxy server for a specific service
 * @param {number} listenPort - Port to listen on
 * @param {number} targetPort - Port to forward to
 * @param {string} authHeader - Full Authorization header value
 */
function startProxy(listenPort, targetPort, authHeader) {
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true
  });

  // Inject Authorization header on proxy request
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('Authorization', authHeader);
  });

  // Remove security headers to allow iframe embedding
  proxy.on('proxyRes', (proxyRes) => {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['x-content-type-options'];
  });

  // Handle proxy errors (res may be Socket for WS errors, not HTTP response)
  proxy.on('error', (err, req, res) => {
    console.error(`Proxy error on port ${listenPort}:`, err.message);
    if (res && typeof res.writeHead === 'function' && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Service unavailable — container may still be starting.');
    } else if (res && typeof res.end === 'function') {
      res.end();
    }
  });

  // Handle WebSocket upgrade
  proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
    console.log(`Proxying WebSocket on port ${listenPort}: ${req.url}`);
    proxyReq.setHeader('Authorization', authHeader);
    // Rewrite Origin to match the target so servers that validate Origin accept the connection
    proxyReq.setHeader('Origin', `http://localhost:${targetPort}`);
  });

  // Create HTTP server
  const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: `http://localhost:${targetPort}` });
  });

  // Handle WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    console.log(`WebSocket upgrade on port ${listenPort}: ${req.url}`);
    proxy.ws(req, socket, head, { target: `http://localhost:${targetPort}` });
  });

  // Start listening
  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`Proxy :${listenPort} → :${targetPort} started`);
  });

  httpServers.push(server);
  proxyServers.push(proxy);

  return server;
}

/**
 * Start the dashboard static file server with Basic Auth
 */
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // Check Basic Auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Basic realm="WebCode Dashboard"'
      });
      res.end('Authentication required');
      return;
    }

    // Verify credentials
    const expectedAuth = BASIC_AUTH;
    if (authHeader !== expectedAuth) {
      res.writeHead(401, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Invalid credentials');
      return;
    }

    // API: GET /api/status — supervisor process list
    if (req.method === 'GET' && req.url === '/api/status') {
      exec('supervisorctl status all', (_err, stdout) => {
        const services = parseSupervisorOutput(stdout);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(services));
      });
      return;
    }

    // API: POST /api/restart/:name — restart a supervisor process
    const restartMatch = req.method === 'POST' && req.url.match(/^\/api\/restart\/([a-zA-Z0-9_-]+)$/);
    if (restartMatch) {
      const processName = restartMatch[1];
      exec(`supervisorctl restart ${processName}`, (err) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: !err }));
      });
      return;
    }

    // Serve dashboard.html for root path
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(DASHBOARD_HTML, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading dashboard');
          return;
        }
        const html = data
          .replace('__VNC_PASSWORD__', encodeURIComponent(VNC_PASSWORD))
          .replace('__OPENCLAW_TOKEN__', encodeURIComponent(OPENCLAW_TOKEN));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
    } else {
      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(DASHBOARD_PORT, '0.0.0.0', () => {
    console.log(`Dashboard server started on port ${DASHBOARD_PORT}`);
  });

  httpServers.push(server);
  return server;
}

/**
 * Start all services
 */
function start() {
  console.log('Starting Dashboard Server...');

  // Start dashboard static server
  startDashboardServer();

  // Start all proxy servers
  PROXY_CONFIG.forEach(config => {
    const authHeader = config.authType === 'bearer' ? BEARER_AUTH : BASIC_AUTH;
    startProxy(config.listen, config.target, authHeader);
  });

  console.log('Dashboard Server fully started');
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('Shutting down Dashboard Server...');

  // Close all HTTP servers
  httpServers.forEach(server => {
    server.close(() => {
      console.log('HTTP server closed');
    });
  });

  // Close all proxy servers
  proxyServers.forEach(proxy => {
    proxy.close();
  });

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
start();
