import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { BotModule } from './bot/bot.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [DatabaseModule, BotModule, WalletModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
