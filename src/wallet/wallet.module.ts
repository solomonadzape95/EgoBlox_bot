import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { GroupWalletService } from './group-wallet.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { Transaction, TransactionSchema } from '../database/schemas/transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [WalletService, GroupWalletService],
  exports: [WalletService, GroupWalletService],
})
export class WalletModule {}
