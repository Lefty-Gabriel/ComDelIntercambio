import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureHttpSecurity } from './common/http-security.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureHttpSecurity(app);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

await bootstrap();
