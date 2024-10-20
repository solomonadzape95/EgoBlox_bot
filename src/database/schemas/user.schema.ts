import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type UserDocument = mongoose.HydratedDocument<User>;

@Schema()
export class User {
  @Prop({ unique: true })
  chat_id: bigint;

  @Prop()
  username: string;

  @Prop()
  baseName: string;

  @Prop({ enum: ['SMART', 'NORMAL'] })
  WalletType: string;

  @Prop()
  smartWalletAddress: string;

  @Prop()
  walletAddress: string;

  @Prop()
  walletDetails: string;

  @Prop()
  defaultWalletDetails: string;

  @Prop()
  pin: string;

  @Prop()
  phoneNumber: string;

  // One-to-Many relationship with Transaction
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
  })
  transactions: mongoose.Types.ObjectId[];

  // One-to-Many relationship with Session
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }] })
  sessions: mongoose.Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
