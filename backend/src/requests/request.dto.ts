import { IsString, IsNumber, IsUUID, IsOptional } from 'class-validator';

export class CreateRequestDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  reason: string;

  @IsString()
  currency: string;

  @IsNumber()
  totalAmount: number;
}

export class UpdateRequestDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;
}

export class ActionCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
