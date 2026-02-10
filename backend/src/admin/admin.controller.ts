import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('users')
    async listUsers() {
        return this.adminService.listUsers();
    }

    @Get('users/:id')
    async getUser(@Param('id') id: string) {
        return this.adminService.getUser(id);
    }

    @Post('users')
    async createUser(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateUserDto) {
        return this.adminService.createUser(user.sub, body);
    }

    @Patch('users/:id')
    async updateUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: UpdateUserDto) {
        return this.adminService.updateUser(user.sub, id, body);
    }

    @Delete('users/:id')
    async deactivateUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return this.adminService.deactivateUser(user.sub, id);
    }

    @Delete('users/:id/permanent')
    async permanentDeleteUser(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
        return this.adminService.permanentDeleteUser(user.sub, id);
    }

    @Post('users/:id/reset-password')
    async resetPassword(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: ResetPasswordDto) {
        return this.adminService.resetPassword(user.sub, id, body.password);
    }
}
