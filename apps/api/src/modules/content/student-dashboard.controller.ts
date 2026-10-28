import { SaveResumeDto } from './dto/save-resume.dto.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateLessonQuestionDto } from './dto/create-lesson-question.dto.js';
import { SaveLessonNoteDto } from './dto/save-lesson-note.dto.js';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto.js';
import { StudentDashboardService } from './student-dashboard.service.js';

@Controller('dashboard/student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('estudiante')
export class StudentDashboardController {
  constructor(private readonly dashboard: StudentDashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getDashboard(user);
  }

  @Get('courses/:courseId/resume')
  getResume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ) {
    return this.dashboard.getResume(user, courseId);
  }
  @Put('courses/:courseId/resume')
  saveResume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body() dto: SaveResumeDto,
  ) {
    return this.dashboard.saveResume(
      user,
      courseId,
      dto.lessonId,
      dto.positionSeconds,
    );
  }
  @Get('resources/:resourceId/access')
  getResourceAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resourceId') resourceId: string,
  ) {
    return this.dashboard.getResourceAccess(user, resourceId);
  }

  @Patch('lessons/:lessonId')
  @HttpCode(HttpStatus.OK)
  updateLessonProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
  ) {
    return this.dashboard.updateLessonProgress(user, lessonId, dto.completed);
  }

  @Put('lessons/:lessonId/note')
  saveLessonNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: SaveLessonNoteDto,
  ) {
    return this.dashboard.saveLessonNote(user, lessonId, dto.content);
  }

  @Post('lessons/:lessonId/questions')
  createLessonQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateLessonQuestionDto,
  ) {
    return this.dashboard.createLessonQuestion(user, lessonId, dto.question);
  }
}
