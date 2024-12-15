/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type SessionDocument = mongoose.HydratedDocument<Session>;

@Schema()
export class Session {
  @Prop({ type: Number, ref: 'User' })
  chat_id: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  user: mongoose.Types.ObjectId;

  @Prop({ default: false })
  sessionOn: boolean;

  @Prop({ default: false })
  airtime: boolean;

  @Prop({ default: false })
  sendToken: boolean;

  @Prop({ default: false })
  data: boolean;

  @Prop({ default: false })
  electricity: boolean;

  @Prop({ default: false })
  createWallet: boolean;

  @Prop({ default: false })
  createSmartWallet: boolean;

  @Prop({ default: false })
  importWallet: boolean;

  @Prop({ default: false })
  exportWallet: boolean;

  @Prop({ default: false })
  resetWallet: boolean;

  @Prop({ default: false })
  changeWalletPin: boolean;

  @Prop({ default: false })
  walletPinPromptInput: boolean;

  @Prop()
  walletPinPromptInputId: number[];

  @Prop({ default: false })
  importWalletPromptInput: boolean;

  @Prop()
  importWalletPromptInputId: number[];

  @Prop()
  userInputId: number[];

  @Prop()
  transactionId: string;

  @Prop({ default: false })
  createGroupWallet: boolean;

  @Prop({ default: false })
  pendingGroupApproval: boolean;

  @Prop()
  groupTransactionId: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
