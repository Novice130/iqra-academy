'use client';

import React, { useRef } from 'react';
// NOTE: These imports require "@daily-co/daily-react" and "@daily-co/daily-js" packages.
// In the future, you will run: npm install @daily-co/daily-js @daily-co/daily-react
// For now, these are kept as reference comments.
// import { DailyProvider, useCallFrame } from '@daily-co/daily-react';

interface DailyRoomProps {
  token: string;
  url: string;
}

function DailyCallFrame({ url, token }: DailyRoomProps) {
  const callFrameRef = useRef<HTMLDivElement>(null);

  // Example hook usage:
  // useCallFrame({
  //   parentElRef: callFrameRef,
  //   options: {
  //     url,
  //     token,
  //     iframeStyle: {
  //       width: '100%',
  //       height: '100%',
  //       border: 'none',
  //       borderRadius: '12px',
  //     },
  //     showLeaveButton: true,
  //     showFullscreenButton: true,
  //   },
  // });

  return (
    <div ref={callFrameRef} style={{ width: '100%', height: '100vh' }}>
      <p style={{ color: 'white', padding: '20px' }}>
        Daily.co video room placeholder. (Iframe container)
        <br />
        URL: {url}
      </p>
    </div>
  );
}

export default function DailyRoom({ token, url }: DailyRoomProps) {
  return (
    // <DailyProvider>
      <DailyCallFrame url={url} token={token} />
    // </DailyProvider>
  );
}
