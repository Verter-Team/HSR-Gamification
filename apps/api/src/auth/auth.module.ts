import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.registerAsync({
    global: true,
    useFactory: () => {
      const secret = process.env.JWT_SECRET;
      if (!secret || (process.env.NODE_ENV === 'production' && (secret.length < 32 || secret === 'change-me' || secret.startsWith('replace-')))) {
        throw new Error('Задайте отдельный JWT_SECRET для сервера');
      }
      return { secret, signOptions: { expiresIn: '12h' } };
    },
  }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
