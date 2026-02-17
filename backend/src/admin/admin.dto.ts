import { IsString, IsEmail, IsOptional, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    fullName!: string;

    @IsString()
    @IsNotEmpty()
    password!: string;

    @IsString()
    @IsNotEmpty()
    role!: string;

    @IsOptional()
    @IsString()
    managerId?: string;
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsString()
    role?: string;

    @IsOptional()
    @IsString()
    managerId?: string | null;

    @IsOptional()
    active?: boolean;
}

export class ResetPasswordDto {
    @IsString()
    @IsNotEmpty()
    password!: string;
}


export class CreateBenefitDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsNumber()
    @Min(0.01)
    budgetLimit!: number;
}
