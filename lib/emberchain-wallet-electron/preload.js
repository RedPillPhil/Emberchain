'use strict';
// Minimal preload — contextIsolation is on, so the renderer can't access Node.
// Add contextBridge.exposeInMainWorld() here if the renderer ever needs IPC.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('emberchain', {
  platform: process.platform,
  version:  process.versions.electron,
});
