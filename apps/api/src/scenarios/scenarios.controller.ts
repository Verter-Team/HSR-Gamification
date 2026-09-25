import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScenarioResponse } from '../common/swagger-responses';
import { ScenariosService } from './scenarios.service';

@Controller('scenarios')
@ApiTags('Сценарии')
@ApiBearerAuth()
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Get()
  @ApiOperation({ summary: 'Список опубликованных сценариев' })
  @ApiResponse({ status: 200, description: 'Сценарии с актуальным графом', type: [ScenarioResponse] })
  list() {
    return this.scenarios.listPublished();
  }
}
