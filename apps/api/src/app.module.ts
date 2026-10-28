import { AdministrationModule } from './modules/administration/administration.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './common/health/health.controller.js';
import { SupabaseModule } from './common/supabase/supabase.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { ContentModule } from './modules/content/content.module.js';
import { VideoModule } from './modules/video/video.module.js';
import { AssignmentsModule } from './modules/assignments/assignments.module.js';
import { GradesModule } from './modules/grades/grades.module.js';
import { ForumsModule } from './modules/forums/forums.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    UsersModule,
    AdministrationModule,
    CoursesModule,
    ContentModule,
    VideoModule,
    AssignmentsModule,
    GradesModule,
    ForumsModule,
    NotificationsModule,
    TicketsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
