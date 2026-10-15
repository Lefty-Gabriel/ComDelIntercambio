import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.users.list();
  }

  @Patch(':id/role')
  @Roles('admin')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.users.updateRole(id, dto.role);
  }
}
