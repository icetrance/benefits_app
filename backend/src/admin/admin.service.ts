import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role, ExpenseType, RequestStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService
    ) { }



    async listBenefits() {
        return this.prisma.expenseCategory.findMany({
            where: { expenseType: ExpenseType.BENEFIT },
            orderBy: { name: 'asc' }
        });
    }

    async createBenefit(actorId: string, data: { name: string; budgetLimit: number }) {
        const name = data.name.trim();
        if (!name) {
            throw new BadRequestException('Benefit name is required');
        }
        if (data.budgetLimit <= 0) {
            throw new BadRequestException('Benefit budget limit must be greater than 0');
        }

        const category = await this.prisma.expenseCategory.create({
            data: {
                name,
                expenseType: ExpenseType.BENEFIT,
                defaultBudget: data.budgetLimit,
                requiresReceipt: true,
                active: true
            }
        });

        const currentYear = new Date().getFullYear();
        const employees = await this.prisma.user.findMany({
            where: { role: Role.EMPLOYEE, active: true },
            select: { id: true }
        });

        for (const employee of employees) {
            await this.prisma.budgetAllocation.upsert({
                where: { userId_categoryId_year: { userId: employee.id, categoryId: category.id, year: currentYear } },
                update: { allocated: data.budgetLimit },
                create: { userId: employee.id, categoryId: category.id, year: currentYear, allocated: data.budgetLimit, spent: 0 }
            });
        }

        await this.auditService.recordEvent({
            actorId,
            entityType: 'ExpenseCategory',
            entityId: category.id,
            eventType: 'ADMIN_CREATE_BENEFIT',
            eventData: { name, budgetLimit: data.budgetLimit }
        });

        return category;
    }

    async deleteBenefit(actorId: string, id: string) {
        const benefit = await this.prisma.expenseCategory.findUnique({ where: { id } });
        if (!benefit || benefit.expenseType !== ExpenseType.BENEFIT) {
            throw new NotFoundException('Benefit not found');
        }

        const activeRequestCount = await this.prisma.expenseRequest.count({
            where: {
                categoryId: id,
                status: { in: [RequestStatus.DRAFT, RequestStatus.SUBMITTED, RequestStatus.UNDER_REVIEW, RequestStatus.APPROVED, RequestStatus.PAYMENT_PROCESSING] }
            }
        });
        if (activeRequestCount > 0) {
            throw new BadRequestException('Cannot remove benefit with active requests');
        }

        await this.prisma.budgetAllocation.deleteMany({ where: { categoryId: id } });
        await this.prisma.expenseCategory.delete({ where: { id } });

        await this.auditService.recordEvent({
            actorId,
            entityType: 'ExpenseCategory',
            entityId: id,
            eventType: 'ADMIN_DELETE_BENEFIT',
            eventData: { name: benefit.name }
        });

        return { success: true };
    }

    async listUsers() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                managerId: true,
                active: true,
                createdAt: true,
                manager: { select: { id: true, fullName: true, email: true } },
                _count: { select: { reports: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getUser(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                managerId: true,
                active: true,
                createdAt: true,
                manager: { select: { id: true, fullName: true, email: true } },
                reports: { select: { id: true, fullName: true, email: true, role: true } }
            }
        });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async createUser(actorId: string, data: { email: string; fullName: string; password: string; role: string; managerId?: string }) {
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) throw new BadRequestException('Email already in use');

        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                fullName: data.fullName,
                passwordHash,
                role: data.role as Role,
                managerId: data.managerId || null,
                active: true
            }
        });

        // Create budget allocations for benefit categories if employee
        if (data.role === 'EMPLOYEE') {
            await this.createDefaultBudgets(user.id);
        }

        await this.auditService.recordEvent({
            actorId,
            entityType: 'User',
            entityId: user.id,
            eventType: 'ADMIN_CREATE_USER',
            eventData: { email: data.email, role: data.role }
        });

        return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, active: user.active };
    }

    async updateUser(actorId: string, id: string, data: { fullName?: string; role?: string; managerId?: string | null; active?: boolean }) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                fullName: data.fullName,
                role: data.role as Role | undefined,
                managerId: data.managerId !== undefined ? data.managerId : undefined,
                active: data.active
            }
        });

        await this.auditService.recordEvent({
            actorId,
            entityType: 'User',
            entityId: id,
            eventType: 'ADMIN_UPDATE_USER',
            eventData: { ...data } as Record<string, unknown>
        });

        return { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role, active: updated.active };
    }

    async deactivateUser(actorId: string, id: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        await this.prisma.user.update({ where: { id }, data: { active: false } });

        await this.auditService.recordEvent({
            actorId,
            entityType: 'User',
            entityId: id,
            eventType: 'ADMIN_DEACTIVATE_USER',
            eventData: { email: user.email }
        });

        return { success: true };
    }

    async permanentDeleteUser(actorId: string, id: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        // Prevent deleting yourself
        if (id === actorId) throw new BadRequestException('Cannot delete your own account');

        // Reassign reports to no manager
        await this.prisma.user.updateMany({ where: { managerId: id }, data: { managerId: null } });

        // Delete budget allocations
        await this.prisma.budgetAllocation.deleteMany({ where: { userId: id } });

        // Delete approval actions where this user is the actor
        await this.prisma.approvalAction.deleteMany({ where: { actorId: id } });

        // Delete expense requests and their actions
        const requests = await this.prisma.expenseRequest.findMany({ where: { employeeId: id }, select: { id: true } });
        const requestIds = requests.map(r => r.id);
        if (requestIds.length > 0) {
            await this.prisma.approvalAction.deleteMany({ where: { requestId: { in: requestIds } } });
            await this.prisma.expenseLineItem.deleteMany({ where: { requestId: { in: requestIds } } });
            await this.prisma.receiptAttachment.deleteMany({ where: { requestId: { in: requestIds } } });
            await this.prisma.expenseRequest.deleteMany({ where: { employeeId: id } });
        }

        // Delete the user
        await this.prisma.user.delete({ where: { id } });

        await this.auditService.recordEvent({
            actorId,
            entityType: 'User',
            entityId: id,
            eventType: 'ADMIN_PERMANENT_DELETE_USER',
            eventData: { email: user.email, fullName: user.fullName }
        });

        return { success: true };
    }

    async resetPassword(actorId: string, id: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id }, data: { passwordHash } });

        await this.auditService.recordEvent({
            actorId,
            entityType: 'User',
            entityId: id,
            eventType: 'ADMIN_RESET_PASSWORD',
            eventData: { email: user.email }
        });

        return { success: true };
    }

    private async createDefaultBudgets(userId: string) {
        const currentYear = new Date().getFullYear();
        const benefitCategories = await this.prisma.expenseCategory.findMany({
            where: { expenseType: ExpenseType.BENEFIT, defaultBudget: { gt: 0 }, active: true }
        });
        for (const cat of benefitCategories) {
            await this.prisma.budgetAllocation.upsert({
                where: { userId_categoryId_year: { userId, categoryId: cat.id, year: currentYear } },
                update: {},
                create: { userId, categoryId: cat.id, year: currentYear, allocated: cat.defaultBudget, spent: 0 }
            });
        }
    }
}
