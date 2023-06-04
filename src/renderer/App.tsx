import {
  ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Textarea, MantineProvider, Button } from '@mantine/core';
import { nanoid } from 'nanoid';
import {
  getHotkeyHandler,
  useInputState,
  useHotkeys,
  useFocusTrap,
  HotkeyItem,
} from '@mantine/hooks';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import { throttle } from 'lodash';

import { Msg, Settings as SettingsType } from 'main/types';

import { readFromLocalStorage, saveToLocalStorage } from 'renderer/misc';
import { Settings } from 'renderer/settings';
import { Message } from 'renderer/message';

import 'highlight.js/styles/github.css';
import './App.css';
import styles from './styles.module.css';

// TODO: probably should add chats history, IndexedDB can be used

marked.setOptions({
  highlight(code, lang) {
    if (hljs.getLanguage(lang)) {
      return hljs.highlight(lang, code).value;
    }

    return hljs.highlightAuto(code).value;
  },
});

const STOP_BUTTON_APPEAR_TIMEOUT = 1200;
const THINKING_MESSAGE_APPEAR_TIMEOUT = 700;

const assistantLoadingMsg: Msg = {
  role: 'assistant',
  content: '',
  thinking: true,
  id: nanoid(),
};

const DEFAULT_CONTEXT = 'You are a helpful assistant';
const DEFAULT_MODEL = 'gpt-3.5-turbo';

const textareaStyles = () => ({
  input: {
    border: 'none',
    lineHeight: '38px',
    transition: 'background-color .2s ease-out',
    background: 'transparent',

    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
});

function hide() {
  window.electron.ipcRenderer.sendMessage('ipc-hide');
}

function updateToken(token: string): void {
  window.electron.ipcRenderer.sendMessage('ipc-openai-update-token', token);
}

function cancelCall() {
  window.electron.ipcRenderer.sendMessage('ipc-openai-cancel');
}

function Hello() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const textareaWrapRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const thinkingMessageTimeout = useRef<number | null>(null);
  const isStopVisibleTimeout = useRef<number | null>(null);

  const [text, onChange] = useInputState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [animating, setAnimating] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<number | null>(null);
  const [windowOpened, setWindowOpened] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [showTokenError, setShowTokenError] = useState(false);
  const [isStopVisible, setIsStopVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [assistantContext, onAssistantContextChange] = useInputState(
    readFromLocalStorage('assistant-context', DEFAULT_CONTEXT)
  );
  const [model, onModelChange] = useInputState(
    readFromLocalStorage('model', DEFAULT_MODEL)
  );
  const [token, setToken] = useState('');
  const [settingsReceived, setSettingsReceived] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);

  const isComputerThinking = Boolean(msgs.find((m) => m.thinking));

  const hasText = text.length > 0;
  const haveMessages = msgs.length > 0;
  const shouldOpenSettings = settingsReceived && !token;

  const assistantContextMessage = useMemo(
    () => ({
      role: 'system',
      content: assistantContext || DEFAULT_CONTEXT,
      id: nanoid(),
    }),
    [assistantContext]
  );

  const focusTrapRef = useFocusTrap(true);

  const updateStoppedMessage = useCallback(
    (messages: Msg[]) =>
      messages.reduce<Msg[]>((r, m) => {
        r.push(m.thinking ? { ...m, canceled: true, thinking: false } : m);

        return r;
      }, []),
    []
  );

  const onStopClick = useCallback(() => {
    cancelCall();
    setPending(false);
    setIsStopVisible(false);

    setMsgs(updateStoppedMessage);
  }, [updateStoppedMessage]);

  const clearPending = useCallback(() => {
    setPending(false);
    setPendingMsg(null);
  }, []);

  const clearThinkingMessageTimeout = useCallback(() => {
    if (thinkingMessageTimeout.current) {
      clearTimeout(thinkingMessageTimeout.current);
    }
  }, []);

  const clearIsStopVisibleTimeout = useCallback(() => {
    if (isStopVisibleTimeout.current) {
      clearTimeout(isStopVisibleTimeout.current);
    }
  }, []);

  const openWindow = useCallback((withAnimation = true) => {
    if (withAnimation) {
      setAnimating(true);

      setTimeout(() => {
        setAnimating(false);
      }, 200);
    }

    setWindowOpened(true);

    window.electron.ipcRenderer.sendMessage(
      'ipc-open-window',
      true,
      withAnimation
    );
  }, []);

  const closeWindow = useCallback((withAnimation = true) => {
    if (withAnimation) {
      setAnimating(true);

      setTimeout(() => {
        setAnimating(false);
      }, 400);
    }

    setWindowOpened(false);

    window.electron.ipcRenderer.sendMessage('ipc-close-window', withAnimation);
  }, []);

  const clearAll = useCallback(
    (clearInput = true, withAnimation = true) => {
      if (windowOpened) {
        closeWindow(withAnimation);
      }

      textareaRef.current?.focus();
      cancelCall();

      if (clearInput) {
        onChange('');
      }

      clearPending();
      clearThinkingMessageTimeout();
      setMsgs([]);
    },
    [
      closeWindow,
      onChange,
      textareaRef,
      clearPending,
      clearThinkingMessageTimeout,
      windowOpened,
    ]
  );

  const onEscape = useCallback(() => {
    if (settingsOpened) {
      if (!token) {
        setShowTokenError(true);

        return;
      }

      saveToLocalStorage('assistant-context', assistantContext);
      saveToLocalStorage('model', model);
      updateToken(token);

      setSettingsOpened(false);

      if (!haveMessages) {
        closeWindow();
        textareaRef.current?.focus();
      }
    } else {
      hide();
      clearAll(true, false);
    }
  }, [
    clearAll,
    token,
    haveMessages,
    assistantContext,
    model,
    closeWindow,
    textareaRef,
    settingsOpened,
  ]);

  const onSettings = useCallback(
    (withAnimation = true) => {
      if (settingsOpened) {
        return;
      }

      openWindow(withAnimation);
      setSettingsOpened(true);
    },
    [settingsOpened, openWindow]
  );

  const onSettingsHotkey = useCallback(() => {
    onSettings();
  }, [onSettings]);

  const closeChat = useCallback(() => {
    clearThinkingMessageTimeout();
    clearPending();

    if (windowOpened) {
      closeWindow();
    }

    textareaRef.current?.focus();
  }, [
    clearThinkingMessageTimeout,
    clearPending,
    closeWindow,
    textareaRef,
    windowOpened,
  ]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const onChatScroll = useCallback(
    throttle((e) => {
      if (e.isTrusted) {
        setAutoScrollEnabled(false);
      }
    }, 400),
    []
  );

  const onArrowUp = useCallback(() => {
    if (!text && !windowOpened) {
      if (!windowOpened) {
        openWindow();
      }

      setMsgs(readFromLocalStorage<Msg[]>('last-chat', []));
    }
  }, [openWindow, text, windowOpened]);

  const onRefresh = useCallback(() => {
    cancelCall();

    clearPending();
    clearThinkingMessageTimeout();

    setMsgs([]);
    onChange('');
  }, [onChange, clearThinkingMessageTimeout, clearPending]);

  const onArrowDown = useCallback(() => {
    if (!hasText && windowOpened && !settingsOpened) {
      clearAll();
      closeChat();
    }
  }, [clearAll, closeChat, windowOpened, hasText, settingsOpened]);

  const onArrowDownForce = useCallback(() => {
    clearAll(false);
    closeChat();
  }, [clearAll, closeChat]);

  const call = useCallback(
    (messages: Msg[], id = nanoid()) => {
      window.electron.ipcRenderer.sendMessage(
        'ipc-openai-call',
        [assistantContextMessage, ...messages].map(({ role, content }) => ({
          role,
          content,
        })),
        model,
        id
      );
    },
    [assistantContextMessage, model]
  );

  const tryAgain = useCallback(() => {
    call(msgs.filter((m) => !m.is_error && !m.thinking));
  }, [call, msgs]);

  const onSubmit = useCallback(async () => {
    if (!text || (isComputerThinking && !isStopVisible)) {
      return;
    }

    const isInterrupting = isComputerThinking && isStopVisible;

    if (!windowOpened) {
      openWindow();
    }

    setAutoScrollEnabled(true);
    setIsStopVisible(false);
    setPending(true);

    const msg: Msg = { role: 'user', content: text, id: nanoid() };
    let newMessages = [...msgs, msg];

    if (isInterrupting) {
      onStopClick();

      newMessages = updateStoppedMessage(newMessages);
    }

    const nextMessageId = nanoid();

    setMsgs(newMessages);
    call(newMessages, nextMessageId);

    onChange('');

    clearThinkingMessageTimeout();
    clearIsStopVisibleTimeout();

    thinkingMessageTimeout.current = window.setTimeout(() => {
      setMsgs((c) => [...c, { ...assistantLoadingMsg, id: nextMessageId }]);
    }, THINKING_MESSAGE_APPEAR_TIMEOUT);
    isStopVisibleTimeout.current = window.setTimeout(
      () => setIsStopVisible(true),
      STOP_BUTTON_APPEAR_TIMEOUT
    );
  }, [
    updateStoppedMessage,
    isComputerThinking,
    isStopVisible,
    onStopClick,
    openWindow,
    clearThinkingMessageTimeout,
    clearIsStopVisibleTimeout,
    onChange,
    call,
    windowOpened,
    msgs,
    text,
  ]);

  const onTokenChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
  }, []);

  // save to localStorage all messages in current chat
  useLayoutEffect(() => {
    const filtered = msgs.filter((m) => !m.is_error && !m.thinking);

    if (filtered.length > 0) {
      saveToLocalStorage('last-chat', filtered);
    }
  }, [msgs]);

  // process assistant's response
  useEffect(() => {
    return window.electron.ipcRenderer.on('ipc-openai-response', (response) => {
      if (!response || !windowOpened) {
        return;
      }

      const msg = response as Msg;

      clearThinkingMessageTimeout();

      if (msg.response_time) {
        setIsStopVisible(false);
        setPending(false);
        setPendingMsg(null);
      }

      setMsgs((currentMessages) => {
        const hasThinkingMessage = currentMessages.find(
          ({ id }) => id === msg.id
        );

        if (!hasThinkingMessage) {
          return [...currentMessages.filter((m) => !m.is_error), msg];
        }

        return currentMessages.reduce<Msg[]>((res, m) => {
          if (m.is_error) {
            return res;
          }

          if (msg.id === m.id) {
            res.push({
              ...m,
              ...msg,
              content: m.content + (msg.content! || ''),
            });
          } else {
            res.push(m);
          }

          return res;
        }, []);
      });
    });
  }, [windowOpened, clearThinkingMessageTimeout]);

  const globalHotkeys = useMemo<HotkeyItem[]>(
    () => [
      ['mod+,', onSettingsHotkey],
      ['Escape', onEscape],
      ['mod+W', onEscape],
      ['mod+R', onRefresh],
      ['mod+N', onArrowDownForce],
    ],
    [onEscape, onRefresh, onArrowDownForce, onSettingsHotkey]
  );

  const textareaHotkeys = useMemo<HotkeyItem[]>(
    () =>
      [
        ...globalHotkeys,
        ['Enter', onSubmit],
        !text && ['ArrowUp', onArrowUp],
        !text && ['ArrowDown', onArrowDown],
      ].filter(Boolean) as HotkeyItem[],
    [text, globalHotkeys, onSubmit, onArrowDown, onArrowUp]
  );

  useHotkeys(globalHotkeys);

  const [textareaHeight, setTextareaHeight] = useState(60);

  // resize window to fit multiline input
  useLayoutEffect(() => {
    const actualHeight =
      textareaWrapRef.current?.getBoundingClientRect().height || 20;

    if (!haveMessages && token && !settingsOpened) {
      setTextareaHeight(actualHeight - 20);

      window.electron.ipcRenderer.sendMessage('ipc-resize', `${actualHeight}`);
    }
  }, [textareaHeight, text, haveMessages, settingsOpened, token]);

  // focus textarea after assistant response
  useEffect(() => {
    if (!pending) {
      textareaRef.current?.focus();
    }
  }, [pending, textareaRef]);

  useLayoutEffect(() => {
    if (shouldOpenSettings) {
      onSettings();
    }
  }, [shouldOpenSettings, onSettings]);

  // scroll chat to bottom whenever messages change
  useEffect(() => {
    if (msgs.length && autoScrollEnabled) {
      chatRef.current?.scrollTo({
        top: chatRef.current?.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [msgs, autoScrollEnabled]);

  // focus textarea after settings panel is closed
  useEffect(() => {
    if (settingsOpened) {
      textareaRef.current?.focus();
    }
  }, [settingsOpened, textareaRef]);

  useEffect(() => {
    const container = chatRef.current;

    container?.addEventListener('wheel', onChatScroll);

    return () => {
      container?.removeEventListener('wheel', onChatScroll);
    };
  }, [onChatScroll]);

  useEffect(() => {
    // @ts-expect-error fine
    window.electron.ipcRenderer.on('ipc-settings', (settings: SettingsType) => {
      console.log('Renderer: received settings', settings);

      setSettingsReceived(true);
      setToken(settings.token || '');
    });

    window.electron.ipcRenderer.sendMessage('ipc-example', ['ping']);
  }, []);

  useEffect(() => {
    window.electron.ipcRenderer.on('ipc-open-settings', () => {
      onSettings(false);
    });
  }, [onSettings]);

  return (
    <div className={styles.root} ref={focusTrapRef}>
      <div
        className={animating ? styles.chatHidden : styles.chat}
        ref={chatRef}
      >
        {msgs.map((msg, i) => (
          <Message
            key={msg.id}
            msg={msg}
            tryAgainPending={pendingMsg === i}
            onTryAgainClick={() => {
              setPendingMsg(i);
              tryAgain();
            }}
          />
        ))}
      </div>
      {!windowOpened && (
        <div style={{ width: '100%', height: textareaHeight }} />
      )}
      <div
        className={
          windowOpened || animating
            ? styles.textareaWithBorder
            : styles.textarea
        }
        ref={textareaWrapRef}
        style={{ paddingRight: isComputerThinking ? 68 : 0 }}
      >
        <Textarea
          ref={textareaRef}
          size="xl"
          minRows={1}
          maxRows={5}
          onChange={onChange}
          autosize
          value={text}
          // @ts-expect-error this is fine
          onKeyDown={getHotkeyHandler(textareaHotkeys)}
          styles={textareaStyles}
        />
        <Button
          className={
            isComputerThinking && isStopVisible
              ? styles.stop
              : styles.stopHidden
          }
          color="gray"
          radius="md"
          size="sm"
          variant="subtle"
          onClick={onStopClick}
        >
          Stop
        </Button>
      </div>
      {settingsOpened && (
        <Settings
          model={model}
          token={token}
          onTokenChange={onTokenChange}
          assissantContext={assistantContext}
          showTokenError={showTokenError}
          onModelChange={onModelChange}
          onAssistantContextChange={onAssistantContextChange}
          onSettingsClose={onEscape}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{ activeStyles: { transform: 'scale(0.97)' } }}
    >
      <Hello />
    </MantineProvider>
  );
}
