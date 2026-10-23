import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { MentorDashboardController } from './mentor-dashboard.controller.js';
import { MentorDashboardService } from './mentor-dashboard.service.js';
import { StudentDashboardController } from './student-dashboard.controller.js';
import { StudentDashboardService } from './student-dashboard.service.js';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [
    AdminDashboardController,
    MentorDashboardController,
    StudentDashboardController,
  ],
  providers: [
    AdminDashboardService,
    MentorDashboardService,
    StudentDashboardService,
  ],
  exports: [
    AdminDashboardService,
    MentorDashboardService,
    StudentDashboardService,
  ],
})
export class ContentModule {}
