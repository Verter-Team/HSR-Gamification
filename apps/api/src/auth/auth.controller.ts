import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { LoginResponse } from '../common/swagger-responses';

@ApiTags('Вход')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Вход по табельному номеру и паролю' })
  @ApiResponse({ status: 200, description: 'JWT и данные сотрудника', type: LoginResponse })
  @ApiResponse({ status: 401, description: 'Неверные учётные данные' })
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
