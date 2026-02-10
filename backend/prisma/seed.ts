import { PrismaClient, Role, ExpenseType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generatePassword() {
  return randomBytes(6).toString('base64');
}

async function main() {
  // --- Approvers (managers) ---
  const approvers = [
    { email: 'approver1@expenseflow.local', fullName: 'Andrea Manager', role: Role.APPROVER },
    { email: 'approver2@expenseflow.local', fullName: 'Boris Manager', role: Role.APPROVER }
  ];

  const approverRecords: Record<string, string> = {};
  for (const user of approvers) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, role: user.role, passwordHash },
      create: { email: user.email, fullName: user.fullName, role: user.role, passwordHash, active: true }
    });
    approverRecords[user.email] = record.id;
    console.log(`Seeded ${user.email} password: ${password}`);
  }

  // --- Employees (assigned to managers) ---
  const employees = [
    { email: 'employee1@expenseflow.local', fullName: 'Erin Employee', role: Role.EMPLOYEE, managerEmail: 'approver1@expenseflow.local' },
    { email: 'employee2@expenseflow.local', fullName: 'Erik Employee', role: Role.EMPLOYEE, managerEmail: 'approver1@expenseflow.local' },
    { email: 'employee3@expenseflow.local', fullName: 'Eva Employee', role: Role.EMPLOYEE, managerEmail: 'approver2@expenseflow.local' },
    { email: 'employee4@expenseflow.local', fullName: 'Emil Employee', role: Role.EMPLOYEE, managerEmail: 'approver2@expenseflow.local' }
  ];

  const employeeIds: string[] = [];
  for (const user of employees) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const managerId = approverRecords[user.managerEmail];
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, role: user.role, passwordHash, managerId },
      create: { email: user.email, fullName: user.fullName, role: user.role, passwordHash, managerId, active: true }
    });
    employeeIds.push(record.id);
    console.log(`Seeded ${user.email} password: ${password}  (manager: ${user.managerEmail})`);
  }

  // --- Finance & Admin ---
  const others = [
    { email: 'finance@expenseflow.local', fullName: 'Fiona Finance', role: Role.FINANCE_ADMIN },
    { email: 'admin@expenseflow.local', fullName: 'Sam Admin', role: Role.SYSTEM_ADMIN }
  ];

  for (const user of others) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, role: user.role, passwordHash },
      create: { email: user.email, fullName: user.fullName, role: user.role, passwordHash, active: true }
    });
    console.log(`Seeded ${user.email} password: ${password}`);
  }

  // --- Categories ---
  const categories = [
    { name: 'Training', expenseType: ExpenseType.BENEFIT, defaultBudget: 1000, requiresReceipt: true },
    { name: 'Eyeglass', expenseType: ExpenseType.BENEFIT, defaultBudget: 200, requiresReceipt: true },
    { name: 'Fitness', expenseType: ExpenseType.BENEFIT, defaultBudget: 500, requiresReceipt: true },
    { name: 'Travel Expenses', expenseType: ExpenseType.TRAVEL, defaultBudget: 0, requiresReceipt: true },
    { name: 'Client Entertainment', expenseType: ExpenseType.PROTOCOL, defaultBudget: 0, requiresReceipt: true }
  ];

  const categoryRecords: Record<string, string> = {};
  for (const category of categories) {
    const record = await prisma.expenseCategory.upsert({
      where: { name: category.name },
      update: { expenseType: category.expenseType, defaultBudget: category.defaultBudget, requiresReceipt: category.requiresReceipt, active: true },
      create: { name: category.name, expenseType: category.expenseType, defaultBudget: category.defaultBudget, requiresReceipt: category.requiresReceipt, active: true }
    });
    categoryRecords[category.name] = record.id;
  }
  console.log('Seeded categories:', Object.keys(categoryRecords).join(', '));

  // --- Budget Allocations (benefit categories only, current year) ---
  const currentYear = new Date().getFullYear();
  const benefitCategories = categories.filter(c => c.expenseType === ExpenseType.BENEFIT && c.defaultBudget > 0);

  for (const empId of employeeIds) {
    for (const cat of benefitCategories) {
      const catId = categoryRecords[cat.name];
      await prisma.budgetAllocation.upsert({
        where: { userId_categoryId_year: { userId: empId, categoryId: catId, year: currentYear } },
        update: { allocated: cat.defaultBudget },
        create: { userId: empId, categoryId: catId, year: currentYear, allocated: cat.defaultBudget, spent: 0 }
      });
    }
  }
  console.log(`Seeded budget allocations for ${employeeIds.length} employees × ${benefitCategories.length} categories (year ${currentYear})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
