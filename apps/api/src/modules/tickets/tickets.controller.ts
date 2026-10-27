import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { TicketsService } from './tickets.service.js';
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('estudiante', 'soporte')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.list(user);
  }
  @Post() @Roles('estudiante') create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ) {
    return this.tickets.create(user, dto.subject, dto.message);
  }
  @Get(':id/messages') messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.messages(user, id);
  }
  @Post(':id/messages') send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.tickets.send(user, id, dto.body);
  }
  @Post(':id/claim') @Roles('soporte') @HttpCode(200) claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.claim(user, id);
  }
  @Post(':id/close') @Roles('soporte') @HttpCode(200) close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.close(user, id);
  }
}
