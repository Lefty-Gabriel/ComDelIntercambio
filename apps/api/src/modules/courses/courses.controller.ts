import { EnrollByEmailDto } from './dto/enroll-by-email.dto.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CoursesService } from './courses.service.js';
import { AssignDocenteDto } from './dto/assign-docente.dto.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { EnrollDto } from './dto/enroll.dto.js';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.courses.listForUser(user);
  }

  @Patch(':courseId/docente')
  @Roles('admin')
  assignDocente(
    @Param('courseId') courseId: string,
    @Body() dto: AssignDocenteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.assignDocente(courseId, dto.docenteId, user);
  }

  @Post(':courseId/enrollments')
  @Roles('admin', 'mentor')
  enroll(
    @Param('courseId') courseId: string,
    @Body() dto: EnrollDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.enroll(courseId, dto.studentId, user);
  }

  @Get(':courseId/enrollment-candidates')
  @Roles('admin', 'mentor')
  candidates(@Param('courseId') courseId: string, @Query('page') page: string,
    @CurrentUser() user: AuthenticatedUser) {
    return this.courses.enrollmentCandidates(courseId, user, Number(page || 0));
  }

  @Post(':courseId/enrollments/by-email')
  @Roles('admin', 'mentor')
  enrollByEmail(
    @Param('courseId') courseId: string,
    @Body() dto: EnrollByEmailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.enrollByEmail(courseId, dto.email, user);
  }

  @Get(':courseId/enrollments')
  @Roles('admin', 'mentor')
  listEnrollments(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.listEnrollments(courseId, user);
  }
}
