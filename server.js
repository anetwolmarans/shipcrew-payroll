#!/usr/bin/env node
/*
 * ShipCrew Payroll — tiny local server (no installation needed beyond Node.js).
 *
 * You normally do NOT run this file yourself: start-windows.bat uses it
 * automatically when Python is not installed on the computer.
 *
 * Manual use:  node server.js 8080
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2]) || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(
        'File not found: ' + urlPath + '\n\n' +
        'Make sure you started the server from inside the shipcrew-payroll folder.'
      );
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('');
    console.log('  Port ' + port + ' is already in use.');
    console.log('  Most likely the app is already running - open http://localhost:' + port + ' in your browser.');
    console.log('  Or close the other black window and start again.');
    console.log('');
  } else {
    console.log('');
    console.log('  The server could not start: ' + err.message);
    console.log('');
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log('');
  console.log('  ShipCrew Payroll server running (Node.js).');
  console.log('  Your browser should open at http://localhost:' + port);
  console.log('  If not, open that address yourself.');
  console.log('  Keep this window OPEN while using the app. Close it to stop.');
  console.log('');
});
