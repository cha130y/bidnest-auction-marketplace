import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { EnvVariable } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<EnvVariable, true>);

  // Deployed, nothing reaches this process directly: the platform terminates
  // TLS at its own router and forwards on, so every request carries that
  // router's address. Left unset, the throttler counts the entire internet as
  // one client and the first busy visitor rate-limits everybody else.
  //
  // `1` is the number of proxies to look past, not a flag — one hop, because
  // the platform's router is the only thing in front of this. Trusting more
  // hops than there are lets a caller forge the address by sending its own
  // X-Forwarded-For, which is the whole reason this is not just `true`.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.get('WEB_APP_URL', { infer: true }),
    credentials: true
  });

  // PrismaService closes its pool in onModuleDestroy, and Nest only calls that
  // if it is listening for the signal. A redeploy stops the old container with
  // SIGTERM, so without this the connections are dropped by the process dying
  // rather than closed — and in-flight requests die with it.
  app.enableShutdownHooks();

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

  // The host is named rather than left to Node, which binds the IPv6 wildcard
  // and counts on dual-stack to pick up the platform's IPv4 health check. That
  // holds on most hosts and is silently fatal on the ones where it does not:
  // the container looks healthy from inside and unreachable from outside.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application failed to start', error);
  process.exit(1);
});
