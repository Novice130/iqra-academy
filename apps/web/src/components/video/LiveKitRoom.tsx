'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom as LKRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';

interface LiveKitRoomProps {
  token: string;
  url: string;
  sessionId: string;
  isModerator: boolean;
}

export default function LiveKitRoom({ token, url, sessionId, isModerator }: LiveKitRoomProps) {
  const router = useRouter();

  const handleDisconnected = useCallback(() => {
    // Only the host ending the call marks the session done — a student
    // disconnecting shouldn't close the room for everyone else.
    if (isModerator) {
      fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    router.push('/dashboard');
  }, [isModerator, sessionId, router]);

  return (
    <LKRoom
      serverUrl={url}
      token={token}
      connect={true}
      video={true}
      audio={true}
      style={{ height: '100vh' }}
      onDisconnected={handleDisconnected}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LKRoom>
  );
}
