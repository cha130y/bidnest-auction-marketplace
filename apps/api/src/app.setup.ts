import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Shared by main.ts and the e2e suite so tests exercise the same pipes and
 * filters production runs — a DTO rule that only holds in one of the two is
 * worse than no rule at all.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}
