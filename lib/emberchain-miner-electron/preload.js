'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miner', {
  // Window controls
  minimize: ()       => ipcRenderer.send('win:minimize'),
  close:    ()       => ipcRenderer.send('win:close'),

  // Mining control
  start: (settings) => ipcRenderer.send('mining:start', settings),
  stop:  ()         => ipcRenderer.send('mining:stop'),

  // Receive events from the mining worker
  on: (channel, fn) => {
    if (channel === 'mining:event') {
      ipcRenderer.on(channel, (_e, data) => fn(data));
    }
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});
