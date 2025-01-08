// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Example method to focus an input
  focusInput: (selector) => {
    const inputElement = document.querySelector(selector);
    if (inputElement) {
      inputElement.focus();
    }
  }
});
