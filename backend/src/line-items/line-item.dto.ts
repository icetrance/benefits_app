import { IsDateString, IsNumber, IsString } from 'class-validator';

export class CreateLineItemDto {
  @IsDateString()
  date: string;

  @IsString()
  description: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;
}

export class UpdateLineItemDto {
  @IsDateString()
  date: string;

  @IsString()
  description: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;
}
