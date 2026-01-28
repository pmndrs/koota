# NestJS Integration Reference

> **Load when:** User asks about NestJS with TypeScript, API development, DTOs, validation, authentication, or backend patterns.

Type-safe API development with NestJS 11+.

## Contents

- [Project Structure](#project-structure)
- [Controllers and Routes](#controllers-and-routes)
- [DTOs and Validation](#dtos-and-validation)
- [Services and Dependency Injection](#services-and-dependency-injection)
- [Authentication](#authentication)
- [Error Handling](#error-handling)

---

## Project Structure

### Recommended Layout

```
src/
├── main.ts                    # Application entry point
├── app.module.ts              # Root module
├── common/                    # Shared utilities
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
├── config/                    # Configuration
│   ├── config.module.ts
│   └── env.validation.ts
└── modules/
    ├── users/
    │   ├── users.module.ts
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   ├── users.repository.ts
    │   ├── dto/
    │   │   ├── create-user.dto.ts
    │   │   └── update-user.dto.ts
    │   ├── entities/
    │   │   └── user.entity.ts
    │   └── __tests__/
    └── auth/
        └── ...
```

### Module Configuration

```typescript
// users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService] // Export for use in other modules
})
export class UsersModule {}
```

---

## Controllers and Routes

### Basic Controller

```typescript
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto';
import { PaginationDto } from '@/common/dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  async findAll(@Query() query: PaginationDto): Promise<UserResponseDto[]> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new user' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
```

---

## DTOs and Validation

### Class-Validator Approach

```typescript
// dto/create-user.dto.ts
import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsArray
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  User = 'user',
  Admin = 'admin',
  Moderator = 'moderator'
}

export class AddressDto {
  @ApiProperty()
  @IsString()
  street: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty()
  @IsString()
  country: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.User })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.User;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// dto/update-user.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

### Zod-Based DTOs (Modern Approach)

```typescript
// dto/user.schema.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Define Zod schemas
export const UserRoleSchema = z.enum(['user', 'admin', 'moderator']);

export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string()
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  password: z.string().min(8),
  role: UserRoleSchema.default('user').optional(),
  address: AddressSchema.optional(),
  tags: z.array(z.string()).optional()
});

export const UpdateUserSchema = CreateUserSchema.partial();

// Create DTO classes from schemas
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}

// Infer types
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
```

### Global Validation Pipe

```typescript
// main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Transform payloads to DTO classes
      transformOptions: {
        enableImplicitConversion: true
      }
    })
  );

  await app.listen(3000);
}
bootstrap();
```

---

## Services and Dependency Injection

### Typed Service

```typescript
// users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto';
import { PaginationDto } from '@/common/dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(query: PaginationDto): Promise<UserResponseDto[]> {
    const users = await this.usersRepository.findAll(query);
    return users.map(this.toResponseDto);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.toResponseDto(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.create(dto);
    return this.toResponseDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.update(id, dto);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.toResponseDto(user);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.usersRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    };
  }
}
```

### Repository Pattern

```typescript
// users.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { User, Prisma } from '@prisma/client';
import { PaginationDto } from '@/common/dto';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationDto): Promise<User[]> {
    return this.prisma.user.findMany({
      skip: query.skip,
      take: query.take,
      orderBy: { createdAt: 'desc' }
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User | null> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## Authentication

### JWT Authentication

```typescript
// auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET')
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

### Role-Based Access Control

```typescript
// common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// Usage in controller
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('users')
  @Roles('admin')
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Delete('users/:id')
  @Roles('admin', 'moderator')
  removeUser(@Param('id') id: string) {
    return this.adminService.removeUser(id);
  }
}
```

---

## Error Handling

### Exception Filters

```typescript
// common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || message;
        error = (responseObj.error as string) || exception.name;
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url
    };

    response.status(status).json(errorResponse);
  }
}

// main.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

### Custom Exceptions

```typescript
// common/exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST
  ) {
    super({ message, code }, status);
  }
}

export class InsufficientFundsException extends BusinessException {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      'INSUFFICIENT_FUNDS'
    );
  }
}

export class DuplicateEmailException extends BusinessException {
  constructor(email: string) {
    super(`Email ${email} is already registered`, 'DUPLICATE_EMAIL');
  }
}

// Usage
throw new InsufficientFundsException(100, 50);
```
