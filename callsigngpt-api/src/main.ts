import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { envSchema } from './config/env.schema';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const env = envSchema.parse(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: env.NODE_ENV === 'production' ? { level: 'warn' } : true,
      // Raise body limit to accommodate large image payloads (configurable via BODY_LIMIT_BYTES)
      bodyLimit: env.BODY_LIMIT_BYTES, // validated default in env schema
    }),
  );

  const fastify = app.getHttpAdapter().getInstance();
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  // Optional request log (good for CORS debugging)
  fastify.addHook('onRequest', async (req, _reply) => {
    req.log.info(
      { method: req.method, url: req.url, origin: req.headers.origin },
      'incoming',
    );
  });

  // CORS must be registered before routes are used
  await fastify.register(fastifyCors as any, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    hook: 'onRequest',
    preflight: true,
  });

  // Simple IP-based rate limiter to reduce abuse
  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    allowList: ['127.0.0.1', '::1'], // keep localhost unrestricted for dev
  });

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // (Optional but nice) handle graceful shutdowns
  app.enableShutdownHooks();
  // Ensure Prisma disconnects cleanly on shutdown
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  // (Optional) If you want a global API prefix:
  // app.setGlobalPrefix('v1');

  await app.listen({ port: config.port, host: config.host });
  const address = await app.getUrl();
  logger.log(`API up at ${address}`);
}

bootstrap();
