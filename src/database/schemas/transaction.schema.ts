import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type TransactionDocument = mongoose.HydratedDocument<Transaction>;

@Schema()
export class Transaction {
  @Prop()
  hash: string;

  @Prop()
  status: string;

  @Prop({ enum: ['SEND', 'AIRTIME', 'DATA', 'ELECTRICITY'], required: true })
  type: string; // Enum for TransactionType

  @Prop()
  description: string;

  @Prop()
  ownerApproved: boolean;

  @Prop()
  token: string;

  @Prop()
  amount: string;

  @Prop()
  receiver: string;

  @Prop()
  receiverType: string;

  @Prop()
  sender: string;

  @Prop({ type: mongoose.Schema.Types.BigInt, ref: 'User' })
  chat_id: bigint;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user: mongoose.Types.ObjectId;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
