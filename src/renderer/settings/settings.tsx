/* eslint-disable import/prefer-default-export */
import React, { memo } from 'react';
import {
  ActionIcon,
  Anchor,
  Kbd,
  SegmentedControl,
  TextInput,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';

import styles from './settings.module.css';

function Settings({
  assissantContext,
  model,
  token,
  showTokenError,
  onModelChange,
  onTokenChange,
  onAssistantContextChange,
  onSettingsClose,
}: {
  assissantContext: string;
  model: string;
  token: string;
  showTokenError: boolean;
  onAssistantContextChange: React.ChangeEventHandler<HTMLInputElement>;
  onTokenChange: React.ChangeEventHandler<HTMLInputElement>;
  onModelChange: (value: string) => void;
  onSettingsClose: () => void;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>
        <div className={styles.circle} />
        Ask
      </div>
      <ActionIcon
        onClick={onSettingsClose}
        className={styles.close}
        radius="md"
        color="gray"
        variant="subtle"
      >
        <IconX />
      </ActionIcon>
      <div className={styles.fields}>
        <div className={styles.label}>
          OpenAI API key <span className={styles.required}>*</span>
        </div>
        <div className={styles.description}>
          Get your key at{' '}
          <Anchor
            target="_blank"
            color="dark"
            href="https://platform.openai.com/account/api-keys"
          >
            API keys page
          </Anchor>
        </div>
        <TextInput
          className={styles.control}
          variant="filled"
          size="sm"
          color="dark"
          value={token}
          spellCheck={false}
          onChange={onTokenChange}
          error={
            showTokenError && !token
              ? 'Please provide an API key to continue'
              : undefined
          }
          placeholder="sk-"
          styles={() => ({
            input: { '&:focus': { borderColor: 'rgba(0,0,0,0.3)' } },
          })}
        />
        <div className={styles.model}>
          <div className={styles.label}>Chat model</div>
          <div className={styles.description}>
            Note that GPT-4 is still in{' '}
            <Anchor
              color="dark"
              href="https://platform.openai.com/docs/models/gpt-4"
            >
              limited beta
            </Anchor>{' '}
            and may not be available
          </div>
          <SegmentedControl
            className={styles.control}
            fullWidth
            size="sm"
            value={model}
            onChange={onModelChange}
            data={[
              { label: 'GPT-4', value: 'gpt-4' },
              { label: 'GPT-3.5', value: 'gpt-3.5-turbo-0613' },
            ]}
          />
        </div>
        <div className={styles.context}>
          <div className={styles.label}>Chat context</div>
          <div className={styles.description}>
            The context helps set the behavior of the assistant.
          </div>
          <TextInput
            className={styles.control}
            variant="filled"
            size="sm"
            color="dark"
            value={assissantContext}
            onChange={onAssistantContextChange}
            placeholder="You are a helpful assistant"
            styles={() => ({
              input: { '&:focus': { borderColor: 'rgba(0,0,0,0.3)' } },
            })}
          />
        </div>
        <div className={styles.hotkeys}>
          <div className={styles.label}>Hotkeys</div>
          <div className={styles.kbd}>
            <div>Show Ask input</div>
            <Kbd>⌘ + J</Kbd>
          </div>
          <div className={styles.kbd}>
            <div>New chat</div>
            <div>
              <Kbd>Down</Kbd> in an empty input or <Kbd>⌘ + N</Kbd>
            </div>
          </div>
          <div className={styles.kbd}>
            <div>Last chat</div>
            <div>
              <Kbd>Up</Kbd> in an empty input
            </div>
          </div>
          <div className={styles.kbd}>
            <div>Settings</div>
            <Kbd>⌘ + ,</Kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

const Enh = memo(Settings);

export { Enh as Settings };
