import { BadRequestException, Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReceiptService } from './receipt.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { Response } from 'express';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Post('requests/:id/receipts')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') requestId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.receiptService.uploadReceipt(user.sub, user.role as any, requestId, file);
  }

  @Get('receipts/:id/download')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const receipt = await this.receiptService.downloadReceipt(user.sub, user.role as any, id);
    return res.download(receipt.storagePath, receipt.filename);
  }
}
