import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CommunicationService } from './communication.service.js';
import {
  ChatMessageDto,
  ForumLikeDto,
  ForumReplyDto,
  ForumThreadDto,
} from './communication.dto.js';
@Controller('forums')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('estudiante', 'mentor', 'admin')
export class ForumsController {
  constructor(private readonly communication: CommunicationService) {}
  @Get('threads') list(@CurrentUser() user: AuthenticatedUser) {
    return this.communication.forum(user, 'list');
  }
  @Post('threads') create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ForumThreadDto,
  ) {
    return this.communication.forum(user, 'create', {
      title: dto.title.trim(),
      content: dto.content.trim(),
      category: dto.category,
    });
  }
  @Post('threads/:id/replies') reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForumReplyDto,
  ) {
    return this.communication.forum(user, 'reply', {
      id,
      content: dto.content.trim(),
    });
  }
  @Put('threads/:id/like') like(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForumLikeDto,
  ) {
    return this.communication.forum(user, 'like', { id, liked: dto.liked });
  }
}
@Controller('mentor-chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('estudiante', 'mentor')
export class MentorChatController {
  constructor(private readonly communication: CommunicationService) {}
  @Get('conversations') contacts(@CurrentUser() user: AuthenticatedUser) {
    return this.communication.chat(user, 'contacts');
  }
  @Get(':studentId/messages') messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) id: string,
    @Query('mentorId', ParseUUIDPipe) mentorId: string,
  ) {
    return this.communication.chat(user, 'messages', id, { mentorId });
  }
  @Post(':studentId/messages') send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) id: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.communication.chat(user, 'send', id, {
      body: dto.body,
      mentorId: dto.mentorId,
    });
  }
}
