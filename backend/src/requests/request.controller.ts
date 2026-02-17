import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequestService } from './request.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/current-user.decorator';
import { CreateRequestDto, UpdateRequestDto, ActionCommentDto } from './request.dto';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRequestDto) {
    return this.requestService.createRequest(user.sub, user.role as any, body);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.requestService.listRequests(user.sub, user.role as any);
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.getRequest(user.sub, user.role as any, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateRequestDto
  ) {
    return this.requestService.updateRequest(user.sub, user.role as any, id, body);
  }

  @Post(':id/submit')
  async submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.submitRequest(user.sub, user.role as any, id);
  }

  @Post(':id/withdraw')
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.withdrawRequest(user.sub, user.role as any, id);
  }

  @Delete(':id')
  async cancelDraft(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.cancelDraftRequest(user.sub, user.role as any, id);
  }

  @Post(':id/approve')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ActionCommentDto
  ) {
    return this.requestService.approveRequest(user.sub, user.role as any, id, body.comment);
  }

  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ActionCommentDto
  ) {
    return this.requestService.rejectRequest(user.sub, user.role as any, id, body.comment);
  }

  @Post(':id/return')
  async returnRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ActionCommentDto
  ) {
    return this.requestService.returnRequest(user.sub, user.role as any, id, body.comment);
  }

  @Post(':id/finance/process')
  async financeProcess(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.financeProcess(user.sub, user.role as any, id);
  }

  @Post(':id/finance/paid')
  async financePaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requestService.financePaid(user.sub, user.role as any, id);
  }
}
