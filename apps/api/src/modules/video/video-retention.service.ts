import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VideosService } from './videos.service.js';

@Injectable()
export class VideoRetentionService {
  private readonly logger = new Logger(VideoRetentionService.name);

  constructor(private readonly videos: VideosService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredVideos(): Promise<void> {
    try {
      const removed = await this.videos.purgeExpired();
      if (removed > 0) {
        this.logger.log(`Retention: removed ${removed} expired video(s)`);
      }
    } catch (error) {
      this.logger.error('Retention job failed', error as Error);
    }
  }
}
