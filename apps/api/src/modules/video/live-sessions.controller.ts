import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateLiveSessionDto } from './dto/create-live-session.dto.js';
import { LiveSessionsService } from './live-sessions.service.js';

@Controller('live-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LiveSessionsController {
  constructor(private readonly sessions: LiveSessionsService) {}

  @Post()
  @Roles('admin', 'mentor')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLiveSessionDto,
  ) {
    return this.sessions.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.getById(user, id);
  }

 @Post(':id/end')
  @Roles('admin', 'mentor')
  @HttpCode(HttpStatus.OK)
  end(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.end(user, id);
  }
}
