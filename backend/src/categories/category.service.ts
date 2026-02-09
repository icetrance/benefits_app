import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    return this.prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });
  }
}
