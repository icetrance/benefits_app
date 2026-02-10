import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BudgetController } from './budget.controller';
import { BudgetService } from './budget.service';
import { PrismaService } from '../prisma.service';

@Module({
    imports: [JwtModule.register({})],
    controllers: [BudgetController],
    providers: [BudgetService, PrismaService]
})
export class BudgetModule { }
