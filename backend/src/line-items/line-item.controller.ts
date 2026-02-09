import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LineItemService } from './line-item.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { CreateLineItemDto, UpdateLineItemDto } from './line-item.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LineItemController {
  constructor(private readonly lineItemService: LineItemService) {}

  @Post('requests/:id/line-items')
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') requestId: string,
    @Body() body: CreateLineItemDto
  ) {
    return this.lineItemService.addLineItem(user.sub, user.role as any, requestId, body);
  }

  @Patch('line-items/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateLineItemDto
  ) {
    return this.lineItemService.updateLineItem(user.sub, user.role as any, id, body);
  }

  @Delete('line-items/:id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.lineItemService.deleteLineItem(user.sub, user.role as any, id);
  }
}
