import { Module } from '@nestjs/common';
import { SonsController } from './sons.controller';

@Module({
  controllers: [SonsController],
})
export class SonsModule {}
