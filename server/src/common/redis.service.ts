import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config/config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
