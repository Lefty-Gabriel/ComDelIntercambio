import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { AssignMentorDto } from './dto/assign-mentor.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UsersService } from './users.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/mentor')
  @Roles('admin')
  assignMentor(@Param('id') id: string, @Body() dto: AssignMentorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.users.assignMentor(id, dto.mentorId, user);
  }

  @Get()
  @Roles('admin')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.users.list(user);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id/role')
  @Roles('admin')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.updateRole(id, dto.role, user);
  }
}
