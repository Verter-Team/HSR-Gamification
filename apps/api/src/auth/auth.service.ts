import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(body: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { externalId: body.externalId },
      select: { id: true, externalId: true, displayName: true, role: true, passwordHash: true },
    });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, body.password))) {
      throw new UnauthorizedException('Неверный табельный номер или пароль');
    }
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      tokenType: 'Bearer',
      expiresIn: 43_200,
      user: { id: user.id, externalId: user.externalId, displayName: user.displayName, role: user.role.toLowerCase() },
    };
  }
}
