import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BudgetService {
    constructor(private readonly prisma: PrismaService) { }

    async getBudgetsForUser(userId: string, year?: number) {
        const targetYear = year || new Date().getFullYear();
        return this.prisma.budgetAllocation.findMany({
            where: { userId, year: targetYear },
            include: { category: true },
            orderBy: { category: { name: 'asc' } }
        });
    }

    /** Return budget allocations for all direct reports of a manager */
    async getTeamBudgets(managerId: string, year?: number) {
        const targetYear = year || new Date().getFullYear();
        // Get all direct reports
        const reports = await this.prisma.user.findMany({
            where: { managerId, active: true },
            select: { id: true, fullName: true, email: true }
        });
        if (reports.length === 0) return [];
        const reportIds = reports.map(r => r.id);
        const allocations = await this.prisma.budgetAllocation.findMany({
            where: { userId: { in: reportIds }, year: targetYear },
            include: { category: true, user: { select: { id: true, fullName: true, email: true } } },
            orderBy: [{ user: { fullName: 'asc' } }, { category: { name: 'asc' } }]
        });
        return allocations;
    }
}
