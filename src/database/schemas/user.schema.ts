/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type UserDocument = mongoose.HydratedDocument<User>;

@Schema()
export class User {
  @Prop({ unique: true })
  chat_id: number;

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

  @Prop({ default: false })
  testnetAirtimeBonus: boolean;

  @Prop()
  phoneNumber: string;

  @Prop({ type: Boolean, default: false })
  isGroup: boolean;

  @Prop([{ type: String }])
  groupAdmins: string[];

  @Prop([{ type: String }])
  groupMembers: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
