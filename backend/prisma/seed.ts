import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generatePassword() {
  return randomBytes(6).toString('base64');
}

async function main() {
  const users = [
    { email: 'employee@expenseflow.local', fullName: 'Erin Employee', role: Role.EMPLOYEE },
    { email: 'approver@expenseflow.local', fullName: 'Andy Approver', role: Role.APPROVER },
    { email: 'finance@expenseflow.local', fullName: 'Fiona Finance', role: Role.FINANCE_ADMIN },
    { email: 'admin@expenseflow.local', fullName: 'Sam Admin', role: Role.SYSTEM_ADMIN }
  ];

  for (const user of users) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        role: user.role,
        passwordHash
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash,
        active: true
      }
    });
    console.log(`Seeded ${user.email} password: ${password}`);
  }

  const categories = [
    { name: 'Travel', requiresReceipt: true },
    { name: 'Fitness', requiresReceipt: true },
    { name: 'Screen Glasses', requiresReceipt: true },
    { name: 'Other', requiresReceipt: false }
  ];

  for (const category of categories) {
    await prisma.expenseCategory.upsert({
      where: { name: category.name },
      update: { requiresReceipt: category.requiresReceipt, active: true },
      create: { ...category, active: true }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
