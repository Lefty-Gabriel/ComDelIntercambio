import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  constructor(private readonly config: ConfigService) {}

  get url(): string {
    const url = this.config.get<string>('LIVEKIT_URL');
    if (!url) throw new Error('Missing LIVEKIT_URL');
    return url;
  }

  async createJoinToken(input: {
    identity: string;
    name: string;
    room: string;
    canPublish: boolean;
  }): Promise<string> {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw new Error('Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: '2h',
    });

    token.addGrant({
      room: input.room,
      roomJoin: true,
      canPublish: input.canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    return token.toJwt();
  }
}
