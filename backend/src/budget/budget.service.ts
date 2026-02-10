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
}
