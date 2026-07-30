/**
 * Minimal production health server for mobile-wallet.
 * 
 * The mobile app is distributed via native app stores (iOS/Android).
 * This lightweight server replaces the heavy Expo bundler in production,
 * answering healthchecks instantly with zero resource overhead.
 */
const http = require('http');

const port = parseInt(process.env.PORT || '18705', 10);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'connection': 'close' });
  res.end(JSON.stringify({ ok: true, service: 'mobile-wallet' }));
});

// Close connections immediately — don't hold any file descriptors
server.keepAliveTimeout = 0;
server.headersTimeout = 1000;

server.listen(port, '0.0.0.0', () => {
  console.log(`Mobile-wallet health server running on port ${port}`);
});
