import { CreateCourseDto } from '../courses/dto/create-course.dto.js';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AdministrationService } from './administration.service.js';
import {
  AccessInputDto,
  GrantAccessDto,
  LessonInputDto,
  ListAccessDto,
  ModuleInputDto,
  ResourceLinkDto,
  ResourceStateDto,
} from './administration.dto.js';
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}
  @Patch('courses/:courseId') updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) id: string,
    @Body() dto: CreateCourseDto,
  ) {
    return this.administration.updateCourse(user, id, dto);
  }
  @Get('courses/:courseId/curriculum')
  @Roles('admin', 'mentor') curriculum(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) id: string,
  ) {
    return this.administration.curriculum(user, id);
  }
  @Post('courses/:courseId/modules')
  @Roles('admin', 'mentor') addModule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) id: string,
    @Body() dto: ModuleInputDto,
  ) {
    return this.administration.saveModule(user, id, dto);
  }
  @Patch('courses/:courseId/modules/:id')
  @Roles('admin', 'mentor') editModule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModuleInputDto,
  ) {
    return this.administration.saveModule(user, courseId, dto, id);
  }
  @Post('modules/:moduleId/lessons')
  @Roles('admin', 'mentor') addLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseUUIDPipe) id: string,
    @Body() dto: LessonInputDto,
  ) {
    return this.administration.saveLesson(user, id, dto);
  }
  @Patch('modules/:moduleId/lessons/:id')
  @Roles('admin', 'mentor') editLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LessonInputDto,
  ) {
    return this.administration.saveLesson(user, moduleId, dto, id);
  }
  @Post('lessons/:id/resources/link')
  @Roles('admin', 'mentor') resourceLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResourceLinkDto,
  ) {
    return this.administration.addResourceLink(user, id, dto);
  }
  @Post('lessons/:id/resources/upload')
  @Roles('admin', 'mentor')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  resourceUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    @Body('title') title?: string,
  ) {
    return this.administration.uploadResource(user, id, file, title);
  }
  @Patch('resources/:id')
  @Roles('admin', 'mentor') resourceState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResourceStateDto,
  ) {
    return this.administration.resourceState(user, id, dto.isPublished);
  }
  @Get('access') access(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListAccessDto,
  ) {
    return this.administration.listAccess(user, dto);
  }
  @Post('access') grant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantAccessDto,
  ) {
    return this.administration.grantAccess(user, dto);
  }
  @Patch('access/:id') updateAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccessInputDto,
  ) {
    return this.administration.updateAccess(user, id, dto);
  }
}
