import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShopService } from './shop.service';

@Controller('shop')
@ApiTags('Магазин')
@ApiBearerAuth()
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  @ApiOperation({ summary: 'Каталог наград, баланс коинов и мои заявки' })
  @ApiOkResponse({
    description: 'Каталог и баланс',
    schema: { example: { coins: 60, items: [{ code: 'mug', title: 'Кружка ВСМ', description: '...', icon: 'coffee', price: 60 }], purchases: [] } },
  })
  list(@CurrentUser() user: AuthUser) {
    return this.shop.list(user.id);
  }

  @Post(':code/buy')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Обменять коины на награду. Создаёт заявку руководителю.' })
  @ApiParam({ name: 'code', example: 'mug' })
  @ApiResponse({ status: 201, description: 'Заявка создана, коины списаны' })
  @ApiResponse({ status: 409, description: 'Не хватает коинов' })
  buy(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    return this.shop.buy(user.id, code.slice(0, 64));
  }
}
