import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas/user.schema';
import { Transaction, TransactionDocument } from '../database/schemas/transaction.schema';
import { WalletService } from './wallet.service';
import { ContractInteractionService } from '../paymaster-contract-interaction/contract-interaction.service';

@Injectable()
export class GroupWalletService {
  constructor(
    @InjectModel(User.name) private readonly UserModel: Model<User>,
    @InjectModel(Transaction.name) private readonly TransactionModel: Model<Transaction>,
    private readonly walletService: WalletService,
    private readonly contractInteractionService: ContractInteractionService,
  ) {}

  async createGroupWallet(chatId: number, pin: string, admins: string[]) {
    const newWallet = await this.walletService.createWallet();
    const smartAccount = await this.contractInteractionService.getAccount(
      `${newWallet.privateKey}` as `0x${string}`,
    );

    const [encryptedWalletDetails, defaultEncryptedWalletDetails] = await Promise.all([
      this.walletService.encryptWallet(pin, newWallet.privateKey),
      this.walletService.encryptWallet(
        process.env.DEFAULT_WALLET_PIN!,
        newWallet.privateKey,
      ),
    ]);

    return {
      walletAddress: newWallet.address,
      smartWalletAddress: smartAccount.address,
      encryptedWalletDetails,
      defaultEncryptedWalletDetails,
    };
  }

  async approveGroupTransaction(
    transactionId: string,
    adminId: string,
  ): Promise<TransactionDocument | null> {
    const transaction = await this.TransactionModel.findById(transactionId);
    if (!transaction || !transaction.isGroupTransaction) return null;

    // Check if admin already approved
    if (transaction.approvedBy.includes(adminId)) return transaction;

    // Add approval
    transaction.approvedBy.push(adminId);
    await transaction.save();

    return transaction;
  }

  async checkTransactionApprovals(transaction: TransactionDocument): Promise<boolean> {
    return transaction.approvedBy.length >= transaction.requiredApprovals;
  }

  async getPendingTransactions(chatId: number): Promise<TransactionDocument[]> {
    return this.TransactionModel.find({
      chat_id: chatId,
      isGroupTransaction: true,
      $expr: { $lt: [{ $size: "$approvedBy" }, "$requiredApprovals"] }
    });
  }
} 