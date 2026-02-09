import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';
import PDFDocument from 'pdfkit';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('reports/requests.csv')
  async exportCsv(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    if (user.role !== Role.FINANCE_ADMIN && user.role !== Role.SYSTEM_ADMIN) {
      res.status(403).send('Forbidden');
      return;
    }
    const requests = await this.prisma.expenseRequest.findMany({ include: { employee: true, category: true } });
    const rows = [
      'RequestNumber,Employee,Category,Status,Currency,TotalAmount,SubmittedAt'
    ];
    for (const request of requests) {
      rows.push(
        `${request.requestNumber},${request.employee.fullName},${request.category.name},${request.status},${request.currency},${request.totalAmount},${request.submittedAt ?? ''}`
      );
    }
    res.header('Content-Type', 'text/csv');
    res.attachment('requests.csv');
    res.send(rows.join('\n'));
  }

  @Get('requests/:id/export.pdf')
  async exportPdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const request = await this.prisma.expenseRequest.findUnique({
      where: { id },
      include: { employee: true, category: true, lineItems: true }
    });
    if (!request) {
      res.status(404).send('Not found');
      return;
    }
    if (user.role === Role.EMPLOYEE && request.employeeId !== user.sub) {
      res.status(403).send('Forbidden');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${request.requestNumber}.pdf"`);
    const doc = new PDFDocument();
    doc.pipe(res);
    doc.fontSize(18).text('ExpenseFlow Request Summary');
    doc.moveDown();
    doc.text(`Request: ${request.requestNumber}`);
    doc.text(`Employee: ${request.employee.fullName}`);
    doc.text(`Category: ${request.category.name}`);
    doc.text(`Status: ${request.status}`);
    doc.text(`Total: ${request.currency} ${request.totalAmount}`);
    doc.moveDown();
    doc.text('Line Items:', { underline: true });
    request.lineItems.forEach((item) => {
      doc.text(`${item.date.toISOString().slice(0, 10)} - ${item.description} - ${item.currency} ${item.amount}`);
    });
    doc.end();
  }
}
