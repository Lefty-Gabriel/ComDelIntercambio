import { TicketStatusDto } from './dto/ticket-status.dto.js';
import { CreateTicketOptionDto, CustomTicketStatusDto } from './dto/ticket-options.dto.js';
import {
  Body,
  Controller,
  Delete,
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
import { TicketLabelsDto } from './dto/ticket-labels.dto.js';
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('estudiante', 'soporte', 'admin')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}
  @Post('options/:id') @Roles('soporte') @HttpCode(200) editOption(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTicketOptionDto) {
    return this.tickets.editOption(user, id, dto.name);
  }
  @Get('options') @Roles('soporte', 'admin') options(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.options(user);
  }
  @Post('options') @Roles('soporte') option(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketOptionDto) {
    return this.tickets.createOption(user, dto.kind, dto.name);
  }
  @Post(':id/custom-status') @Roles('soporte') @HttpCode(200) customStatus(
    @CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomTicketStatusDto,
  ) { return this.tickets.customStatus(user, id, dto.optionId); }
  @Post(':id/status') @Roles('soporte') @HttpCode(200) status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketStatusDto,
  ) { return this.tickets.setStatus(user, id, dto.status); }
  @Post(':id/labels') @Roles('soporte') @HttpCode(200) labels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TicketLabelsDto,
  ) { return this.tickets.organize(user, id, dto.labels); }
  @Post(':id/resolve') @Roles('soporte') @HttpCode(200) resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) { return this.tickets.organize(user, id); }
  @Delete(':id') @Roles('soporte') @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tickets.remove(user, id);
  }
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
