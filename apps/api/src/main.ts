import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  if (process.env.TRUST_PROXY === '1') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (corsOrigins?.length) {
    if (corsOrigins.includes('*')) throw new Error('CORS_ORIGIN должен содержать конкретные адреса');
    app.enableCors({ origin: corsOrigins, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type'] });
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const openApi = new DocumentBuilder()
    .setTitle('Тренажёр проводника ВСМ')
    .setDescription('API сценариев, прохождений, достижений и рейтинга')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi));
  await app.listen(Number(process.env.API_PORT ?? 3000));
}

void bootstrap();
