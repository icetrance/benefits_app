import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';

@Controller('budget')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetController {
    constructor(private readonly budgetService: BudgetService) { }

    @Get()
    async getMyBudgets(@CurrentUser() user: AuthenticatedUser, @Query('year') year?: string) {
        return this.budgetService.getBudgetsForUser(user.sub, year ? parseInt(year, 10) : undefined);
    }

    @Get(':userId')
    async getUserBudgets(@Param('userId') userId: string, @Query('year') year?: string) {
        return this.budgetService.getBudgetsForUser(userId, year ? parseInt(year, 10) : undefined);
    }
}
