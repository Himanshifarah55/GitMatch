// ============================================================
//  config.js - Backend API base URL.
//
//  On Vercel, frontend and backend live on the same domain, so API_BASE
//  should be empty and requests go to /api/... directly.
//
//  For local static testing on ports like 8080/5500, keep using the
//  local Express backend at http://localhost:3000.
// ============================================================

const isLocalStaticFrontend =
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '3000';

const API_BASE = isLocalStaticFrontend ? 'http://localhost:3000' : '';
