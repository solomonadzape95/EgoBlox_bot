import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type TransactionDocument = mongoose.HydratedDocument<Transaction>;

@Schema()
export class Transaction {
  @Prop()
  hash: string;

  @Prop()
  userOpHash: string;

  @Prop()
  status: string;

  @Prop({ enum: ['SEND', 'AIRTIME', 'DATA', 'ELECTRICITY'], required: true })
  type: string; // Enum for TransactionType

  @Prop()
  description: string;

  @Prop()
  flutterWave_tx_ref: string;

  @Prop()
  flutterWave_reference: string;

  @Prop()
  flutterWave_status: string;

  @Prop()
  flutterWave_bill_Network: string;

  @Prop()
  ownerApproved: boolean;

  @Prop()
  airtimeDataNumber: string;

  @Prop()
  airtimeAmount: string;

  @Prop()
  token: string;

  @Prop()
  amount: string;

  @Prop()
  receiver: string;

  @Prop()
  receiverType: string;

  @Prop()
  receiverAddress: string;

  @Prop()
  receiverChatId: string;
  @Prop()
  sender: string;

  @Prop({ type: Number, ref: 'User' })
  chat_id: number;

  @Prop({ default: false })
  isGroupTransaction: boolean;

  @Prop([String])
  approvedBy: string[];

  @Prop()
  requiredApprovals: number;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
