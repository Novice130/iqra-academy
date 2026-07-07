'use client';

import React from 'react';
import {
  LiveKitRoom as LKRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';

interface LiveKitRoomProps {
  token: string;
  url: string;
}

export default function LiveKitRoom({ token, url }: LiveKitRoomProps) {
  return (
    <LKRoom
      serverUrl={url}
      token={token}
      connect={true}
      video={true}
      audio={true}
      style={{ height: '100vh' }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LKRoom>
  );
}
