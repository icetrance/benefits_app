import { Controller, Get, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  async list() {
    return this.categoryService.listActive();
  }
}
