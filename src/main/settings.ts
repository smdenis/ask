/* eslint-disable import/prefer-default-export */
import fs from 'fs';
import path from 'path';

import { Settings } from 'main/types';

let settings: Settings;

const SETTINGS_FILENAME = 'settings.json';

function getAppDataPath(): string {
  return path.join(process.env.HOME!, 'Library', 'Application Support', 'Ask');
}

function getSettingsFilePath(): string {
  return path.join(getAppDataPath(), SETTINGS_FILENAME);
}

export function readSettings(): Settings {
  let res = {};

  try {
    res = JSON.parse(fs.readFileSync(getSettingsFilePath(), 'utf-8'));
  } catch (e) {
    console.log('System: error reading settings');
  }

  return res;
}

export function getSettings(): Settings {
  if (!settings) settings = readSettings();
  return settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  console.log(`System: update settings ${JSON.stringify(patch)}`);

  const appDatatDirPath = getAppDataPath();

  // Create appDataDir if not exist
  if (!fs.existsSync(appDatatDirPath)) {
    fs.mkdirSync(appDatatDirPath);
  }

  settings = {
    ...getSettings(),
    ...patch,
  };

  fs.writeFileSync(getSettingsFilePath(), JSON.stringify(settings), 'utf-8');

  return settings;
}
