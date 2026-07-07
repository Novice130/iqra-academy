export interface CreateRoomOptions {
  name?: string;
  maxParticipants?: number;
  expiresInSeconds?: number;
  enableRecording?: boolean;
  metadata?: any;
}

export interface VideoRoom {
  id: string;
  name: string;
  url: string;
  provider: 'daily' | 'livekit';
  createdAt: Date;
  expiresAt?: Date;
  metadata?: any;
}

export interface JoinToken {
  token: string;
  url: string;
  provider: 'daily' | 'livekit';
}


// NOTE: This interface is for reference when you integrate Daily.co.
export interface TokenOptionsDaily {
  roomId: string;
  userId: string;
  userName: string;
  isModerator: boolean;
  expiresInSeconds?: number;
}

export class DailyVideoProvider {
  readonly type = 'daily' as const;
  private apiKey: string;
  private baseUrl = 'https://api.daily.co/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createRoom(options: CreateRoomOptions): Promise<VideoRoom> {
    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name: options.name,
        properties: {
          max_participants: options.maxParticipants ?? 20,
          exp: options.expiresInSeconds
            ? Math.floor(Date.now() / 1000) + options.expiresInSeconds
            : undefined,
          enable_recording: options.enableRecording ? 'cloud' : undefined,
          enable_chat: true,
          enable_screenshare: true,
          enable_knocking: true,
          start_audio_off: true,
          start_video_off: false,
        },
      }),
    });

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      url: data.url,
      provider: 'daily',
      createdAt: new Date(data.created_at),
      expiresAt: data.config?.exp ? new Date(data.config.exp * 1000) : undefined,
      metadata: options.metadata,
    };
  }

  async generateToken(options: TokenOptionsDaily): Promise<JoinToken> {
    const res = await fetch(`${this.baseUrl}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: options.roomId,
          user_name: options.userName,
          user_id: options.userId,
          is_owner: options.isModerator,
          exp: options.expiresInSeconds
            ? Math.floor(Date.now() / 1000) + options.expiresInSeconds
            : Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    });

    const data = await res.json();
    return {
      token: data.token,
      url: `https://${process.env.DAILY_DOMAIN || 'your-subdomain'}.daily.co/${options.roomId}`,
      provider: 'daily',
    };
  }

  async deleteRoom(roomId: string): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
  }

  async getRoom(roomId: string): Promise<VideoRoom | null> {
    const res = await fetch(`${this.baseUrl}/rooms/${roomId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      url: data.url,
      provider: 'daily',
      createdAt: new Date(data.created_at),
    };
  }
}
