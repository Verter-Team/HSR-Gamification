import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

test('вход проверяет хеш пароля и выдаёт JWT с id сотрудника', async () => {
  const id = '578ac298-7f8f-49ea-9aba-18192069aa12';
  const passwordHash = await argon2.hash('demo');
  const prisma = { user: { findUnique: async () => ({ id, externalId: '4471', displayName: 'Проводник №4471', role: 'PLAYER', passwordHash }) } } as unknown as PrismaService;
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '12h' } });
  const service = new AuthService(prisma, jwt);

  const response = await service.login({ externalId: '4471', password: 'demo' });
  assert.equal(response.user.id, id);
  assert.equal(response.user.role, 'player');
  assert.equal((await jwt.verifyAsync<{ sub: string }>(response.accessToken)).sub, id);
  await assert.rejects(() => service.login({ externalId: '4471', password: 'wrong' }), UnauthorizedException);
});
