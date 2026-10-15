import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
    return this.courses.create(dto, user.id);
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
  ) {
    return this.courses.assignDocente(courseId, dto.docenteId);
  }

  @Post(':courseId/enrollments')
  @Roles('admin')
  enroll(
    @Param('courseId') courseId: string,
    @Body() dto: EnrollDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.enroll(courseId, dto.studentId, user.id);
  }

  @Get(':courseId/enrollments')
  @Roles('admin', 'docente')
  listEnrollments(@Param('courseId') courseId: string) {
    return this.courses.listEnrollments(courseId);
  }
}
