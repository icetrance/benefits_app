import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ExpenseType } from '@prisma/client';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) { }

  async listActive(expenseType?: string) {
    const where: any = { active: true };
    if (expenseType && Object.values(ExpenseType).includes(expenseType as ExpenseType)) {
      where.expenseType = expenseType;
    }
    return this.prisma.expenseCategory.findMany({
      where,
      orderBy: { name: 'asc' }
    });
  }
}
