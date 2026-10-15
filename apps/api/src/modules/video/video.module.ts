import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { LivekitService } from './livekit.service.js';
import { LiveSessionsController } from './live-sessions.controller.js';
import { LiveSessionsService } from './live-sessions.service.js';
import { VideoRetentionService } from './video-retention.service.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [VideosController, LiveSessionsController],
  providers: [
    VideosService,
    VideoRetentionService,
    LivekitService,
    LiveSessionsService,
  ],
})
export class VideoModule {}
