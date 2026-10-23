import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AnswerLessonQuestionDto } from './dto/answer-lesson-question.dto.js';
import { MentorDashboardService } from './mentor-dashboard.service.js';

@Controller('dashboard/mentor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('mentor')
export class MentorDashboardController {
  constructor(private readonly dashboard: MentorDashboardService) {}

  @Get()
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getDashboard(user);
  }

  @Patch('questions/:questionId')
  @HttpCode(HttpStatus.OK)
  answerQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId') questionId: string,
    @Body() dto: AnswerLessonQuestionDto,
  ) {
    return this.dashboard.answerQuestion(user, questionId, dto.reply);
  }
}
