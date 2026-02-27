#!/usr/bin/env node
'use strict';

/**
 * Dashboard Server
 *
 * A Node.js server that:
 * 1. Serves the dashboard.html static page on port 10000
 * 2. Creates proxy servers on ports 10010-10013 that:
 *    - Forward requests to actual services
 *    - Inject authentication headers automatically
 *    - Remove security headers to allow iframe embedding
 *    - Support WebSocket connections
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

// Configuration
const DASHBOARD_PORT = 10000;
const DASHBOARD_HTML = '/opt/dashboard.html';

// Proxy port mapping (listen port -> target port)
const PROXY_CONFIG = [
  { listen: 10010, target: 10001, authType: 'basic' },  // Theia IDE
  { listen: 10011, target: 10002, authType: 'basic' },  // Vibe Kanban
  { listen: 10012, target: 10003, authType: 'bearer' }, // OpenClaw AI
  { listen: 10013, target: 10004, authType: 'basic' },  // noVNC
];

// Get authentication credentials from environment
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'password';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || 'token';

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

  // Handle proxy errors
  proxy.on('error', (err, req, res) => {
    console.error(`Proxy error on port ${listenPort}:`, err.message);
    if (res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Service unavailable — container may still be starting.');
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
  server.listen(listenPort, '127.0.0.1', () => {
    console.log(`Proxy :${listenPort} → :${targetPort} started`);
  });

  httpServers.push(server);
  proxyServers.push(proxy);

  return server;
}

/**
 * Start the dashboard static file server
 */
function startDashboardServer() {
  const server = http.createServer((req, res) => {
    // Serve dashboard.html for root path
    if (req.url === '/' || req.url === '/index.html') {
      fs.readFile(DASHBOARD_HTML, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading dashboard');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
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
