import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CompleteVideoDto } from './dto/complete-video.dto.js';
import { CreateVideoDto } from './dto/create-video.dto.js';
import { VideosService } from './videos.service.js';

@Controller('videos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @Roles('admin', 'mentor')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVideoDto) {
    return this.videos.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.videos.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.videos.getById(user, id);
  }

  @Get(':id/playback')
  playback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.videos.playback(user, id);
  }

  @Post(':id/complete')
  @Roles('admin', 'mentor')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteVideoDto,
  ) {
    return this.videos.complete(user, id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'mentor')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.videos.remove(user, id);
  }
}
