/* eslint-disable react/self-closing-comp */
/* eslint-disable no-restricted-syntax */
/* eslint-disable import/prefer-default-export */
import React, { memo, useEffect, useLayoutEffect } from 'react';
// import { Root, createRoot } from 'react-dom/client';

import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import { ActionIcon, Button, CopyButton, Loader } from '@mantine/core';

import { Msg } from 'main/types';
import { formatDuration } from 'renderer/misc';

import styles from './message.module.css';
// import { IconCheck, IconCopy } from '@tabler/icons-react';

marked.setOptions({
  highlight(code, lang) {
    if (hljs.getLanguage(lang)) {
      return hljs.highlight(lang, code).value;
    }

    return hljs.highlightAuto(code).value;
  },
});

function Message({
  msg,
  tryAgainPending = false,
  onTryAgainClick,
}: {
  msg: Msg;
  tryAgainPending: boolean;
  onTryAgainClick: () => void;
}) {
  // useEffect(() => {
  //   const pres = Array.from(document.querySelectorAll('pre code')).map(
  //     (codeElement) => {
  //       const appended = document.createElement('div');
  //       appended.classList.add(styles.copyWrap);
  //       appended.setAttribute('data-ts', Date.now().toString());
  //       const pre = codeElement.parentElement;

  //       pre?.parentElement?.insertBefore(appended, pre);

  //       return appended;
  //     }
  //   );

  //   const roots: Root[] = pres.map((pre) => {
  //     const content = pre?.innerHTML;
  //     const textValue = pre?.textContent || '';
  //     const root = createRoot(pre!);

  //     root.render(
  //       <>
  //         <CopyButton value={textValue}>
  //           {({ copied, copy }) => (
  //             <ActionIcon onClick={copy} className={styles.copy}>
  //               {copied ? <IconCheck size="18px" /> : <IconCopy size="18px" />}
  //             </ActionIcon>
  //           )}
  //         </CopyButton>

  //         <div dangerouslySetInnerHTML={{ __html: content || '' }}></div>
  //       </>
  //     );

  //     return root;
  //   });

  //   return () => {
  //     console.log('wtf');
  //     for (const root of roots) {
  //       root.unmount();
  //     }
  //     for (const pre of pres) {
  //       console.log(pre);
  //       pre.remove();
  //     }
  //   };
  // }, [msg]);

  return (
    <div
      className={
        // eslint-disable-next-line no-nested-ternary
        msg.role === 'user'
          ? styles.msg
          : msg.is_error
          ? styles.msgTheirsError
          : styles.msgTheirs
      }
    >
      <div className={styles.msgContent}>
        <div className={styles.info}>
          <div className={styles.avatar} />
          <div className={styles.name}>
            {msg.role === 'user' ? 'You' : 'Computer'}
          </div>
          {(msg.response_time || msg.canceled) && !msg.thinking ? (
            <div className={styles.duration}>
              {msg.canceled ? 'STOPPED' : formatDuration(msg.response_time!)}
            </div>
          ) : null}
          {msg.thinking && <Loader variant="dots" color="gray" size="xs" />}
        </div>
        <div className={styles.text}>
          {msg.content && !msg.is_error ? (
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                // TODO: sanitize
                __html: marked(msg.content + (msg.canceled ? '…' : '')).replace(
                  /<\/p>\n|<\/li>\n|<ol>\n|\/ol>\n|<ul>\n|\/ul>\n|\/pre>\n/g,
                  (match) => match.replace(/\n/, '')
                ),
              }}
            />
          ) : (
            msg.content
          )}
        </div>
        {msg.is_error && (
          <div className={styles.buttonWrap}>
            <Button
              color="dark"
              size="xs"
              radius="sm"
              loading={tryAgainPending}
              loaderProps={{ variant: 'bars' }}
              onClick={onTryAgainClick}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const Enh = memo(Message);

export { Enh as Message };
