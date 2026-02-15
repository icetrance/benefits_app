import { IsString, IsNumber, IsUUID, IsOptional, IsNotEmpty, Min } from 'class-validator';

export class CreateRequestDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsNumber()
  @Min(0.01, { message: 'Total amount must be positive' })
  totalAmount!: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  supplier?: string;
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
  @Min(0.01, { message: 'Total amount must be positive' })
  totalAmount?: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  supplier?: string;
}

export class ActionCommentDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
