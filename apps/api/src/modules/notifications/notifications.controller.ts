import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { NotificationsService } from './notifications.service.js';
import {
  ReadNotificationsDto,
  PublishAnnouncementDto,
} from './notifications.dto.js';
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user);
  }
  @Patch('read') markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReadNotificationsDto,
  ) {
    return this.notifications.markRead(user, dto.ids);
  }
  @Post() @Roles('admin', 'mentor') publish(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishAnnouncementDto,
  ) {
    return this.notifications.publish(user, dto);
  }
}
