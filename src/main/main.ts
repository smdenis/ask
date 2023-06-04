/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  globalShortcut,
  screen,
  Menu,
  Tray,
  nativeImage,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { Configuration, OpenAIApi } from 'openai';
import log from 'electron-log';

import type { AxiosRequestConfig } from 'axios';

import { Msg, Settings } from 'main/types';

import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { getSettings, updateSettings } from './settings';

function createOpenAIConfig(apiKey: string): Configuration {
  return new Configuration({
    apiKey,
  });
}

const DEFAULT_WIDTH = 500;
const DEFAULT_OPEN_HEIGHT = 600;
const CLOSED_HEIGHT = 60;

let openai: OpenAIApi | undefined = getSettings().token
  ? new OpenAIApi(createOpenAIConfig(getSettings().token!))
  : undefined;

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event) => {
  event.reply('ipc-settings', getSettings());
});

let isProgramResize = false;
let isWindowOpened = false;

ipcMain.on('ipc-resize', async (_, arg, animate = true) => {
  console.log('Event: ipc-resize');

  const { height } = screen.getPrimaryDisplay().workAreaSize;

  const newHeight = Number(arg);

  const pos = mainWindow?.getPosition();

  isProgramResize = true;

  mainWindow?.setBounds(
    {
      x: pos![0],
      y: Math.floor(height / 3),
      width: Math.floor(getSettings().width || DEFAULT_WIDTH),
      height: Math.floor(newHeight),
    },
    animate
  );
});

ipcMain.on('ipc-close-window', async (_, animate = true) => {
  console.log('Event: ipc-close-window');

  const { height } = screen.getPrimaryDisplay().workAreaSize;

  const newHeight = CLOSED_HEIGHT;

  const pos = mainWindow?.getPosition();

  const settings = getSettings();

  isWindowOpened = false;

  mainWindow?.setBounds(
    {
      x: pos![0],
      y: Math.floor(height / 3),
      width: Math.floor(settings.width || DEFAULT_WIDTH),
      height: Math.floor(newHeight),
    },
    animate
  );
});

ipcMain.on('ipc-open-window', async (_, reposition = true, animate = true) => {
  console.log('Event: ipc-open-window');

  const { height } = screen.getPrimaryDisplay().workAreaSize;

  const pos = mainWindow?.getPosition();

  const settings = getSettings();
  const newHeight = settings.height || DEFAULT_OPEN_HEIGHT;

  isWindowOpened = true;

  mainWindow?.setBounds(
    {
      x: pos![0],
      y: Math.floor(
        !reposition && pos?.[1]
          ? pos[1]
          : Math.floor(height / 2 - newHeight / 2)
      ),
      width: Math.floor(settings.width || DEFAULT_WIDTH),
      height: Math.floor(newHeight),
    },
    animate
  );
});

ipcMain.on('ipc-openai-update-token', async (event, token) => {
  console.log('Event: ipc-openai-update-token');
  updateSettings({ token });
  openai = new OpenAIApi(createOpenAIConfig(token));
});

let controller: AbortController;
let currentStreamId: string;
let canceledStreamId: string;

const cancelCurrentRequest = () => {
  canceledStreamId = currentStreamId;

  console.log(`OpenAI canceling current request ${canceledStreamId}`);

  if (controller) {
    controller.abort();
  }
};

ipcMain.on('ipc-openai-cancel', async () => {
  console.log('Event: ipc-openai-cancel');
  cancelCurrentRequest();
});

ipcMain.on('ipc-openai-call-title', async (event, messages, model, id) => {
  console.log('Event: ipc-openai-call-title');

  try {
    if (!openai) {
      throw new Error('OpenAI not initialized');
    }

    const query = {
      model,
      messages,
      temperature: 0,
      stream: false,
      n: 1,
    };

    console.log(
      `OpenAI asking for title id ${id} with: ${JSON.stringify(query)}`
    );

    const res = await openai.createChatCompletion(query);

    console.log('OpenAI title response:', res.data.choices[0].message);

    event.reply('ipc-openai-response-title', {
      id,
      title: res.data.choices[0].message?.content,
    });
  } catch (err) {
    console.log(err);
  }
});

ipcMain.on('ipc-openai-call', async (event, messages, model, id) => {
  console.log('Event: ipc-openai-call');

  cancelCurrentRequest();

  controller = new AbortController();

  currentStreamId = id;

  const now = Date.now();

  try {
    if (!openai) {
      throw new Error('OpenAI not initialized');
    }

    const query = {
      model,
      messages,
      temperature: 1,
      stream: true,
      n: 1,
    };

    console.log(`OpenAI asking id ${id} with: ${JSON.stringify(query)}`);

    const axiosOptions: AxiosRequestConfig = {
      timeout: 150_000,
      signal: controller.signal,
      responseType: 'stream',
    };

    const res = await openai.createChatCompletion(query, axiosOptions);

    let incompleteChunk = '';

    let replyMessages: Msg[] = [];

    // eslint-disable-next-line no-undef
    const interval: NodeJS.Timer = setInterval(() => {
      // eslint-disable-next-line no-restricted-syntax
      for (const msg of replyMessages) {
        if (msg.thinking === false) {
          clearInterval(interval);
        }

        event.reply('ipc-openai-response', msg);
      }

      replyMessages = [];
    }, 100);

    // @ts-expect-error untyped conditional streaming
    res.data.on('data', (data) => {
      if (canceledStreamId === id) {
        // @ts-expect-error untyped conditional streaming
        res.data.destroy();

        return;
      }

      if (!data) {
        return;
      }

      console.log('OpenAI stream:', data.toString());

      const lines = data
        .toString()
        .split('\n')
        .filter((line: string) => line.trim() !== '');

      // eslint-disable-next-line no-restricted-syntax
      for (const line of lines) {
        let message = line.replace(/^data: /, '');

        if (!message.endsWith(']}')) {
          incompleteChunk = message;

          // eslint-disable-next-line no-continue
          continue;
        }

        if (incompleteChunk) {
          message = incompleteChunk + message;
          incompleteChunk = '';
        }

        const msg: Msg = {
          role: 'assistant',
          id,
          thinking: true,
        };

        if (message === '[DONE]') {
          msg.thinking = false;
          msg.response_time = Date.now() - now;
        } else {
          const parsed = JSON.parse(message);
          const content = parsed.choices[0].delta.content as string;

          if (parsed.choices[0].finish_reason === 'stop') {
            msg.thinking = false;
            msg.response_time = Date.now() - now;
          }

          msg.content = content || '';
        }

        replyMessages.push(msg);
      }
    });
  } catch (error) {
    console.log(`OpenAI error id ${id}`);
    // I'm Afraid I Can't Do That, Dave.

    // @ts-expect-error fine
    if (error?.message === 'canceled') {
      return;
    }

    console.log(error);

    const msg = {
      role: 'assistant',
      is_error: true,
      content: '',
      thinking: false,
      id,
    };

    // @ts-expect-error fine
    if (error.response) {
      // @ts-expect-error fine
      msg.content = error?.response?.data?.error?.message
        ? // @ts-expect-error fine
          `Error ${error.response.status}\n${error.response.data.error.message}`
        : "I'm sorry, I don't know what went wrong. Please try again.";
    } else {
      // @ts-expect-error fine
      msg.content = `${error.message}`;
    }

    event.reply('ipc-openai-response', {
      ...msg,
      response_time: Date.now() - now,
    });
  }
});

ipcMain.on('ipc-hide', async () => {
  console.log('Event: ipc-hide');
  cancelCurrentRequest();

  // mainWindow?.hide();
  Menu.sendActionToFirstResponder('hide:');
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  console.log('mainWindow: create');

  mainWindow = new BrowserWindow({
    show: false,
    width: getSettings().width,
    height: CLOSED_HEIGHT,
    minimizable: false,
    minWidth: 400,
    hiddenInMissionControl: false,
    transparent: true,

    title: 'Ask',
    frame: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      scrollBounce: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    console.log('mainWindow: ready-to-show');
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    console.log('mainWindow: closed');
    mainWindow = null;
  });

  mainWindow.on('resized', () => {
    console.log('mainWindow: resized');

    if (isProgramResize) {
      isProgramResize = false;

      return;
    }

    const rect = mainWindow?.getBounds();

    if (!rect) {
      return;
    }

    const { width, height } = rect;

    const patch: Partial<Settings> = { width };

    if (isWindowOpened) {
      patch.height = height;
    }

    const updated = updateSettings(patch);

    mainWindow?.webContents.send('ipc-settings', updated);
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  globalShortcut.register('CommandOrControl+J', () => {
    if (!mainWindow) {
      return;
    }

    mainWindow?.restore();

    if (!isWindowOpened) {
      mainWindow?.webContents.send('ipc-new-chat');

      const { height: screenHeight, width: screenWidth } =
        screen.getPrimaryDisplay().workAreaSize;

      const { height: windowHeight } = mainWindow.getBounds();

      let y =
        windowHeight === CLOSED_HEIGHT
          ? Math.floor(screenHeight / 3)
          : Math.floor((screenHeight - windowHeight) / 2) + 30;

      mainWindow.setPosition(
        Math.floor(
          screenWidth / 2 - (getSettings().width || DEFAULT_WIDTH) / 2
        ),
        y
      );
    }

    mainWindow?.show();
    mainWindow?.focus();

    mainWindow?.webContents.send('ipc-focus');
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister a shortcut.
  globalShortcut.unregister('CommandOrControl+J');

  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
});

let tray: Tray | null = null;

app
  .whenReady()
  .then(async () => {
    createWindow();

    tray = new Tray(
      await nativeImage.createThumbnailFromPath(
        getAssetPath('iconTemplate.png'),
        {
          width: 24,
          height: 24,
        }
      )
    );
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Ask',
        type: 'normal',
        accelerator: 'CommandOrControl+J',
        click: () => {
          mainWindow?.show();
        },
      },
      {
        label: 'Settings',
        type: 'normal',
        accelerator: 'CommandOrControl+,',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('ipc-open-settings');
        },
      },
      { label: '', type: 'separator' },
      {
        label: 'Quit',
        type: 'normal',
        role: 'quit',
        accelerator: 'CommandOrControl+Q',
      },
    ]);
    tray.setToolTip('Ask');
    tray.setContextMenu(contextMenu);

    app.on('activate', () => {
      console.log('activate');
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();

      // mainWindow?.show();
    });

    app.on('browser-window-focus', () => {
      console.log('browser-window-focus');
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      // if (mainWindow === null) createWindow();

      // mainWindow?.show();
    });
  })
  .catch(console.log);
