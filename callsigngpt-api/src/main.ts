import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import fastifyCors from '@fastify/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      // Raise body limit to accommodate large image payloads (configurable via BODY_LIMIT_BYTES)
      bodyLimit: Number(process.env.BODY_LIMIT_BYTES ?? 50 * 1024 * 1024), // 50MB default
    }),
  );

  const fastify = app.getHttpAdapter().getInstance();
  const logger = new Logger('Bootstrap');

  // Optional request log (good for CORS debugging)
  fastify.addHook('onRequest', async (req, _reply) => {
    req.log.info(
      { method: req.method, url: req.url, origin: req.headers.origin },
      'incoming',
    );
  });

  // CORS must be registered before routes are used
  await fastify.register(fastifyCors, {
    origin: true, // reflect request origin
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    hook: 'onRequest',
    preflight: true,
  });


  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // (Optional but nice) — handle graceful shutdowns
  app.enableShutdownHooks();

  // (Optional) If you want a global API prefix:
  // app.setGlobalPrefix('v1');

  await app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
  const address = await app.getUrl();
  logger.log(`API up at ${address}`);
}
bootstrap();
