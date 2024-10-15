import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { DatabaseModule } from 'src/database/database.module';
import { User, UserSchema } from 'src/database/schemas/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Transaction,
  TransactionSchema,
} from 'src/database/schemas/transaction.schema';
import { Session, SessionSchema } from 'src/database/schemas/session.schema';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    WalletModule,
    DatabaseModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
  ],
  providers: [BotService],
})
export class BotModule {}
