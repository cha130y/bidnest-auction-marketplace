import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { EnvVariable } from './config/env.validation';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const config = app.get(ConfigService<EnvVariable, true>);

  app.enableCors({
    origin: config.get('WEB_APP_URL', { infer: true }),
    credentials: true
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BidNest API')
    .setDescription('Auction & Marketplace REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig)
  );

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
