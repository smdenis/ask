// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'ipc-new-chat'
  | 'ipc-settings'
  | 'ipc-resize'
  | 'ipc-open-window'
  | 'ipc-open-settings'
  | 'ipc-close-window'
  | 'ipc-hide'
  | 'ipc-openai-call-title'
  | 'ipc-openai-call'
  | 'ipc-openai-response'
  | 'ipc-focus'
  | 'ipc-openai-response-title'
  | 'ipc-openai-update-token'
  | 'ipc-openai-cancel';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
