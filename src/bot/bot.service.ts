import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import {
  welcomeMessageMarkup,
  allFeaturesMarkup,
  wallerDetailsMarkup,
  showBalanceMarkup,
  exportWalletWarningMarkup,
  displayPrivateKeyMarkup,
  resetWalletWarningMarkup,
  walletFeaturesMarkup,
  transactionReceiptMarkup,
} from './markups';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/database/schemas/user.schema';
import { Model } from 'mongoose';
import { Session, SessionDocument } from 'src/database/schemas/session.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/database/schemas/transaction.schema';
import { WalletService } from 'src/wallet/wallet.service';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { detectSendToken } from './utils/detectSendToken.utils';
import { detectAirtime } from './utils/detectAirtime.utils';
import { BillsService } from 'src/bills/bills.service';
// import { base, baseSepolia } from 'viem/chains';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

//dynamically import coinbaseOnchainkit
async function loadGetAddressModule(name: string) {
  const { getAddress } = await import('@coinbase/onchainkit/identity');
  return getAddress({ name });
}

@Injectable()
export class BotService {
  private readonly egoBloxBot: TelegramBot;
  private logger = new Logger(BotService.name);
  private readonly saltRounds = 10;
  private readonly getAddress = loadGetAddressModule;

  constructor(
    private readonly walletService: WalletService,
    private readonly billsService: BillsService,
    @InjectModel(User.name) private readonly UserModel: Model<User>,
    @InjectModel(Session.name) private readonly SessionModel: Model<Session>,
    @InjectModel(Transaction.name)
    private readonly TransactionModel: Model<Transaction>,
  ) {
    this.egoBloxBot = new TelegramBot(token, { polling: true });
    // event listerner for incomning messages
    this.egoBloxBot.on('message', this.handleRecievedMessages);

    // event Listerner for button requests
    this.egoBloxBot.on('callback_query', this.handleButtonCommands);
  }

  handleRecievedMessages = async (msg: any) => {
    this.logger.debug(msg);
    try {
      await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
      // condition to differntiate between users actions on the bot
      const session = await this.SessionModel.findOne({
        chat_id: msg.chat.id,
      });
      const user = await this.UserModel.findOne({
        chat_id: msg.chat.id,
      });
      console.log('session  ', session);
      if (msg.text !== '/start') {
        this.handleUserTextInputs(msg, session);
      } else {
        const command = msg.text;
        console.log('Command :', command);
        if (command === '/start') {
          // delete existing user session
          if (session) {
            await this.SessionModel.deleteMany({
              chat_id: msg.chat.id,
            });
          }
          const username = `${msg.from.username}`;
          if (!user) {
            // save user
            await this.UserModel.create({
              chat_id: msg.chat.id,
              username,
            });
          }

          const welcome = await welcomeMessageMarkup(username);

          if (welcome) {
            const replyMarkup = {
              inline_keyboard: welcome.keyboard,
            };
            await this.egoBloxBot.sendMessage(msg.chat.id, welcome.message, {
              reply_markup: replyMarkup,
            });
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  //handler for users inputs
  handleUserTextInputs = async (
    msg: TelegramBot.Message,
    session?: SessionDocument,
  ) => {
    await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
    try {
      const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
      if (session) {
        // update users answerId
        await this.SessionModel.updateOne(
          { _id: session._id },
          { $push: { userInputId: msg.message_id } },
        );
      }

      // function to detect 4 digit pin
      function isValidPin(pin) {
        const pinRegex = /^\d{4}$/;
        return pinRegex.test(pin);
      }

      // detect send token command
      const matchedSend = detectSendToken(msg.text.trim());
      console.log('sned', matchedSend);

      // detect buy airtime command
      const matchBuyAirtime = detectAirtime(msg.text.trim());
      console.log('airtime', matchBuyAirtime);
      // parse incoming message and handle commands
      try {
        // handle wallet creation
        if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.createWallet
        ) {
          const pin = msg.text.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const newWallet = this.walletService.createWallet();

          // encrypt wallet details with pin
          const encryptedWalletDetails = await this.walletService.encryptWallet(
            pin,
            newWallet.privateKey,
          );

          // encrypt with deafault pin(for recovery)
          const defaultEncryptedWalletDetails =
            await this.walletService.encryptWallet(
              process.env.DEFAULT_WALLET_PIN,
              newWallet.privateKey,
            );
          // save  user wallet details
          await this.UserModel.updateOne(
            { chat_id: msg.chat.id },
            {
              defaultWalletDetails: defaultEncryptedWalletDetails.json,
              walletDetails: encryptedWalletDetails.json,
              pin: hashedPin,
              walletAddress: newWallet.address,
            },
          );

          const promises = [];
          const latestSession = await this.SessionModel.findOne({
            chat_id: msg.chat.id,
          });
          // loop through pin prompt to delete them
          for (
            let i = 0;
            i < latestSession.walletPinPromptInputId.length;
            i++
          ) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession.walletPinPromptInputId[i],
              ),
            );
          }
          // loop through to delete all userReply
          for (let i = 0; i < latestSession.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession.userInputId[i],
              ),
            );
          }

          await this.sendWalletDetails(msg.chat.id, newWallet.address);
        } // wallet import pin
        else if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.importWallet
        ) {
          const pin = msg.text.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // check if a user wallet details exist, then decrypt with default pin and and encrypt again
          if (user.walletAddress && user.defaultWalletDetails) {
            const decryptedWallet = await this.walletService.decryptWallet(
              process.env.DEFAULT_WALLET_PIN,
              user.defaultWalletDetails,
            );
            const encryptedWalletDetails =
              await this.walletService.encryptWallet(
                pin,
                decryptedWallet.privateKey,
              );
            // save  user wallet details
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                walletDetails: encryptedWalletDetails.json,
                pin: hashedPin,
                walletAddress: decryptedWallet.address,
              },
            );

            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'Transaction pin successfully updated',
            );
          }

          const promises = [];
          const latestSession = await this.SessionModel.findOne({
            chat_id: msg.chat.id,
          });
          // loop through pin prompt to delete them
          for (
            let i = 0;
            i < latestSession.walletPinPromptInputId.length;
            i++
          ) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession.walletPinPromptInputId[i],
              ),
            );
          }
          // loop through to delete all userReply
          for (let i = 0; i < latestSession.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession.userInputId[i],
              ),
            );
          }

          await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
        } // wallet export
        else if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.exportWallet
        ) {
          const pin = msg.text.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user.pin);
          // decrypt wallet if pin is correct
          if (pinMatch && user.walletAddress && user.walletDetails) {
            const decryptedWallet = await this.walletService.decryptWallet(
              pin,
              user.walletDetails,
            );

            if (decryptedWallet.privateKey) {
              const promises = [];
              const latestSession = await this.SessionModel.findOne({
                chat_id: msg.chat.id,
              });
              // loop through pin prompt to delete them
              for (
                let i = 0;
                i < latestSession.walletPinPromptInputId.length;
                i++
              ) {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.walletPinPromptInputId[i],
                  ),
                );
              }
              // loop through to delete all userReply
              for (let i = 0; i < latestSession.userInputId.length; i++) {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.userInputId[i],
                  ),
                );
              }

              // display wallet key
              await this.displayWalletPrivateKey(
                msg.chat.id,
                decryptedWallet.privateKey,
              );
            }

            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        } // reset wallet
        else if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.resetWallet
        ) {
          const pin = msg.text.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user.pin);
          // delete wallet if pin is correct
          if (pinMatch) {
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                $unset: {
                  walletAddress: '',
                  walletDetails: '',
                  defaultWalletDetails: '',
                  pin: '',
                },
              },
            );

            const promises = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }

            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'Wallet deleted successfully',
            );

            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        } // handle send token
        else if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.sendToken
        ) {
          const pin = msg.text.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user.pin);
          // send Token if pin is correct
          if (pinMatch) {
            // DECRYPT WALLET
            const walletDetail = await this.walletService.decryptWallet(
              pin,
              user.walletDetails,
            );
            // get the transaction
            const transaction = await this.TransactionModel.findOne({
              _id: session.transactionId,
            });
            let txn: any;
            let receipt: any;
            switch (transaction.token) {
              case 'ETH':
                txn = await this.walletService.transferEth(
                  walletDetail.privateKey,
                  transaction.receiverAddress,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `Transfer of ${transaction.amount} ${transaction.token} to ${transaction.receiver}`,
                );
                break;

              case 'USDC':
                txn = await this.walletService.transferUSDC(
                  walletDetail.privateKey,
                  transaction.receiverAddress,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `Transfer of ${transaction.amount} ${transaction.token} to ${transaction.receiver}`,
                );
                break;

              case 'DAI':
                txn = await this.walletService.transferDAI(
                  walletDetail.privateKey,
                  transaction.receiverAddress,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `Transfer of ${transaction.amount} ${transaction.token} to ${transaction.receiver}`,
                );
                break;

              default:
                break;
            }

            const promises = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            console.log('latest session', latestSession);
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // delete all session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        }
        // handle buy airtime
        else if (
          isValidPin(msg.text.trim()) &&
          session.walletPinPromptInput &&
          session.airtime
        ) {
          const pin = msg.text.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user.pin);
          // send Token if pin is correct
          if (pinMatch) {
            // DECRYPT WALLET
            const walletDetail = await this.walletService.decryptWallet(
              pin,
              user.walletDetails,
            );
            // get the transaction
            const transaction = await this.TransactionModel.findOne({
              _id: session.transactionId,
            });
            let txn: any;
            let receipt: any;
            switch (transaction.token) {
              case 'ETH':
                txn = await this.walletService.transferEth(
                  walletDetail.privateKey,
                  process.env.ADMIN_WALLET,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                if (receipt.status == 1) {
                  // buy airtime
                  const airtime = await this.billsService.buyAirtime(
                    `${transaction.airtimeDataNumber}`,
                    `${transaction.airtimeAmount}`,
                  );
                  if (airtime) {
                    //update transaction
                    await this.TransactionModel.updateOne(
                      { _id: transaction._id },
                      {
                        flutterWave_status: airtime.status,
                        flutterWave_reference: airtime.data.reference,
                        flutterWave_tx_ref: airtime.data.tx_ref,
                        flutterWave_bill_Network: airtime.data.network,
                      },
                    );
                  }
                }

                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `₦${transaction.airtimeAmount} Airtime purchase for ${transaction.airtimeDataNumber} `,
                );
                break;

              case 'USDC':
                txn = await this.walletService.transferUSDC(
                  walletDetail.privateKey,
                  process.env.ADMIN_WALLET,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                if (receipt.status == 1) {
                  // buy airtime
                  const airtime = await this.billsService.buyAirtime(
                    `${transaction.airtimeDataNumber}`,
                    `${transaction.airtimeAmount}`,
                  );
                  if (airtime) {
                    //update transaction
                    await this.TransactionModel.updateOne(
                      { _id: transaction._id },
                      {
                        flutterWave_status: airtime.status,
                        flutterWave_reference: airtime.data.reference,
                        flutterWave_tx_ref: airtime.data.tx_ref,
                        flutterWave_bill_Network: airtime.data.network,
                      },
                    );
                  }
                }

                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `₦${transaction.airtimeAmount} Airtime purchase for ${transaction.airtimeDataNumber} `,
                );
                break;

              case 'DAI':
                txn = await this.walletService.transferDAI(
                  walletDetail.privateKey,
                  process.env.ADMIN_WALLET,
                  Number(transaction.amount),
                );
                console.log(txn);
                receipt = await txn.wait();
                console.log(receipt);
                if (receipt.status == 1) {
                  // buy airtime
                  const airtime = await this.billsService.buyAirtime(
                    `${transaction.airtimeDataNumber}`,
                    `${transaction.airtimeAmount}`,
                  );
                  if (airtime) {
                    //update transaction
                    await this.TransactionModel.updateOne(
                      { _id: transaction._id },
                      {
                        flutterWave_status: airtime.status,
                        flutterWave_reference: airtime.data.reference,
                        flutterWave_tx_ref: airtime.data.tx_ref,
                        flutterWave_bill_Network: airtime.data.network,
                      },
                    );
                  }
                }

                //update transaction
                await this.TransactionModel.updateOne(
                  { _id: transaction._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );

                await this.sendTransactionReceipt(
                  msg.chat.id,
                  receipt,
                  `₦${transaction.airtimeAmount} Airtime purchase for ${transaction.airtimeDataNumber} `,
                );
                break;

              default:
                break;
            }

            const promises = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            console.log('latest session', latestSession);
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // delete all session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        }
        //handle import wallet private key
        else if (
          session &&
          session.importWallet &&
          session.importWalletPromptInput
        ) {
          if (await this.isPrivateKey(msg.text.trim(), msg.chat.id)) {
            const privateKey = msg.text.trim();
            console.log(privateKey);
            const importedWallet = this.walletService.getAddressFromPrivateKey(
              `${privateKey}`,
            );
            console.log(importedWallet);

            // encrypt wallet details with  default
            const encryptedWalletDetails =
              await this.walletService.encryptWallet(
                process.env.DEFAULT_WALLET_PIN,
                privateKey,
              );

            // save  user wallet details
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                defaultWalletDetails: encryptedWalletDetails.json,
                walletAddress: importedWallet.address,
              },
            );

            const promises = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            // loop through  import privateKey prompt to delete them
            for (
              let i = 0;
              i < latestSession.importWalletPromptInputId.length;
              i++
            ) {
              promises.push(
                await this.egoBloxBot.deleteMessage(
                  msg.chat.id,
                  latestSession.importWalletPromptInputId[i],
                ),
              );
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession.userInputId.length; i++) {
              promises.push(
                await this.egoBloxBot.deleteMessage(
                  msg.chat.id,
                  latestSession.userInputId[i],
                ),
              );
            }

            await this.sendWalletDetails(msg.chat.id, importedWallet.address);
            return this.promptWalletPin(msg.chat.id, 'import');
          }
          return;
        }
        // detect send action
        else if (matchedSend) {
          let receiverAddress: string;
          if (matchedSend.walletType === 'ens') {
            receiverAddress = await this.getAddress(matchedSend.receiver);
          } else if (matchedSend.walletType === 'username') {
            const receiver = await this.UserModel.findOne({
              username: matchedSend.receiver,
            });
            receiverAddress = receiver.walletAddress;
          } else receiverAddress = matchedSend.receiver;

          // save transaction
          const transaction = await this.TransactionModel.create({
            chat_id: msg.chat.id,
            token: matchedSend.token,
            amount: matchedSend.amount,
            sender: user.walletAddress,
            receiver: matchedSend.receiver,
            type: 'SEND',
            ownerApproved: false,
            receiverType: matchedSend.walletType,
            receiverAddress,
          });
          if (transaction) {
            return await this.sendTokenWalletPinPrompt(
              msg.chat.id,
              transaction,
            );
          }
        }
        // detect buy airtime action
        else if (matchBuyAirtime) {
          const rateAmount = (() => {
            const { token, amount } = matchBuyAirtime;
            const rates = {
              ETH: process.env.ETH_RATE!,
              USDC: process.env.USDC_RATE!,
              DAI: process.env.DAI_RATE!,
            };

            if (token === 'ETH') {
              return (Number(amount) / Number(rates.ETH)).toFixed(18);
            } else if (token === 'USDC') {
              return (Number(amount) / Number(rates.USDC)).toFixed(6);
            } else if (token === 'DAI') {
              return (Number(amount) / Number(rates.DAI)).toFixed(6);
            }

            return null; // Handle the case where token is not ETH, USDC, or DAI
          })();

          // save transaction
          const transaction = await this.TransactionModel.create({
            chat_id: msg.chat.id,
            token: matchBuyAirtime.token,
            airtimeAmount: matchBuyAirtime.amount,
            amount: rateAmount,
            sender: user.walletAddress,
            airtimeDataNumber: matchBuyAirtime.phoneNumber,
            type: 'AIRTIME',
            ownerApproved: false,
          });
          if (transaction) {
            return await this.buyAirtimeWalletPinPrompt(
              msg.chat.id,
              transaction,
            );
          }
        }
      } catch (error) {
        console.error(error);

        return await this.egoBloxBot.sendMessage(
          msg.chat.id,
          `Processing command failed, please try again`,
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  handleButtonCommands = async (query: any) => {
    this.logger.debug(query);
    let command: string;
    // let markdownId: string;

    // const last_name = query.from.last_name;
    // const user_Id = query.from.id;

    // function to check if query.data is a json type
    function isJSON(str) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        console.log(e);
        return false;
      }
    }

    if (isJSON(query.data)) {
      command = JSON.parse(query.data).command;
      //   markdownId = JSON.parse(query.data).eventDetailsId;
    } else {
      command = query.data;
    }

    const chatId = query.message.chat.id;
    // const userId = query.from.id;

    try {
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
      const user = await this.UserModel.findOne({ chat_id: chatId });
      let session: SessionDocument;
      switch (command) {
        case '/menu':
          await this.sendAllFeature(chatId);
          return;

        case '/walletFeatures':
          await this.sendAllWalletFeature(chatId);
          return;

        case '/createWallet':
          // check if user already have a wallet
          if (user.walletAddress) {
            return this.sendWalletDetails(chatId, user.walletAddress);
          }
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            createWallet: true,
          });
          if (session) {
            await this.promptWalletPin(chatId, 'create');
            return;
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/linkWallet':
          // check if user already have a wallet
          if (user.walletAddress) {
            await this.egoBloxBot.sendMessage(
              query.message.chat.id,
              `‼️ You already have a wallet\n\nto link a new, make sure to export and secure you old wallet and then click on the reset wallet button`,
            );
            return this.sendWalletDetails(chatId, user.walletAddress);
          }
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            importWallet: true,
          });
          if (session) {
            await this.promptWalletPrivateKEY(chatId);
            return;
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/fundWallet':
          if (user.walletAddress) {
            return await this.egoBloxBot.sendMessage(
              chatId,
              `Your Address:\n<b><code>${user.walletAddress}</code></b>\n\n send token to your address above `,
              {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: 'Close ❌',
                        callback_data: JSON.stringify({
                          command: '/close',
                          language: 'english',
                        }),
                      },
                    ],
                  ],
                },
              },
            );
          }

        case '/sendToken':
          return this.promptSendToken(chatId);

        case '/airtime':
          return this.promptBuyAirtime(chatId);

        case '/checkBalance':
          return this.showBalance(chatId);

        case '/exportWallet':
          return this.showExportWalletWarning(chatId);

        case '/confirmExportWallet':
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            exportWallet: true,
          });
          if (session) {
            return this.walletPinPrompt(chatId);
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/resetWallet':
          return this.showResetWalletWarning(chatId);

        case '/confirmReset':
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            resetWallet: true,
          });
          if (session) {
            return this.walletPinPrompt(chatId);
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        //   close opened markup and delete session
        case '/closeDelete':
          await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
          await this.SessionModel.deleteMany({
            chat_id: chatId,
          });
          return await this.egoBloxBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        case '/close':
          await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
          return await this.egoBloxBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        default:
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendAllFeature = async (chatId: any) => {
    try {
      const allFeatures = await allFeaturesMarkup();
      if (allFeatures) {
        const replyMarkup = {
          inline_keyboard: allFeatures.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, allFeatures.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendAllWalletFeature = async (chatId: any) => {
    try {
      const allWalletFeatures = await walletFeaturesMarkup();
      if (allWalletFeatures) {
        const replyMarkup = {
          inline_keyboard: allWalletFeatures.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, allWalletFeatures.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptWalletPin = async (chatId: TelegramBot.ChatId, context?: string) => {
    try {
      if (context === 'create') {
        const pinPromptId = await this.egoBloxBot.sendMessage(
          chatId,
          'Please enter a 4 digit pin for your wallet transactions ‼️ please remember this pin ‼️',
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );
        await this.SessionModel.updateOne(
          { chat_id: chatId },
          {
            walletPinPromptInput: true,
            $push: { walletPinPromptInputId: pinPromptId.message_id },
          },
        );
      } else if (context === 'import') {
        const pinPromptId = await this.egoBloxBot.sendMessage(
          chatId,
          'Please enter a 4 digit pin for your wallet transactions ‼️ please remember this pin ‼️',
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );
        await this.SessionModel.deleteMany({ chat_id: chatId });
        await this.SessionModel.create({
          chat_id: chatId,
          importWallet: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [pinPromptId.message_id],
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptWalletPrivateKEY = async (chatId: TelegramBot.ChatId) => {
    try {
      const privateKeyPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter wallet's private key`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (privateKeyPromptId) {
        await this.SessionModel.updateOne(
          { chat_id: chatId },
          {
            importWalletPromptInput: true,
            $push: { importWalletPromptInputId: privateKeyPromptId.message_id },
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptSendToken = async (chatId: TelegramBot.ChatId) => {
    try {
      await this.egoBloxBot.sendMessage(
        chatId,
        `to send token use this format:\n/send amount token address or basename or telegram Username\n e.g:\n\n/send 0.5 ETH ekete.base.eth\n/send 0.5 ETH @eketeUg\n/send 0.5 ETH 0x2189878C4963B84Fd737640db71D7650214c4A18`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
          },
        },
      );
    } catch (error) {
      console.log(error);
    }
  };

  promptBuyAirtime = async (chatId: TelegramBot.ChatId) => {
    try {
      await this.egoBloxBot.sendMessage(
        chatId,
        `to buy airtime use this format:\n/airtime amount phone_number token(token you want to use and buy the airtime)\n e.g:\n\n/airtime 100 07064350087 ETH`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
          },
        },
      );
    } catch (error) {
      console.log(error);
    }
  };

  sendWalletDetails = async (
    ChatId: TelegramBot.ChatId,
    walletAddress: string,
  ) => {
    await this.egoBloxBot.sendChatAction(ChatId, 'typing');
    try {
      const walletDetails = await wallerDetailsMarkup(walletAddress);
      if (wallerDetailsMarkup) {
        const replyMarkup = {
          inline_keyboard: walletDetails.keyboard,
        };
        // delete createwallet session
        await this.SessionModel.deleteMany({ chat_id: ChatId });
        return await this.egoBloxBot.sendMessage(
          ChatId,
          walletDetails.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  showBalance = async (chatId: TelegramBot.ChatId) => {
    try {
      const user = await this.UserModel.findOne({ chat_id: chatId });
      if (!user.walletAddress) {
        return this.egoBloxBot.sendMessage(
          chatId,
          `You don't have a wallet connected`,
        );
      }
      const ethBalance = await this.walletService.getEthBalance(
        user.walletAddress,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        user.walletAddress,
        process.env.USDC_ADDRESS,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        user.walletAddress,
        process.env.DAI_ADDRESS,
      );

      const showBalance = await showBalanceMarkup(
        ethBalance.balance,
        usdcBalance.balance,
        daiBalance.balance,
      );
      if (showBalance) {
        const replyMarkup = { inline_keyboard: showBalance.keyboard };

        return await this.egoBloxBot.sendMessage(chatId, showBalance.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  showExportWalletWarning = async (chatId: TelegramBot.ChatId) => {
    try {
      const showExportWarning = await exportWalletWarningMarkup();
      if (showExportWarning) {
        const replyMarkup = { inline_keyboard: showExportWarning.keyboard };

        return await this.egoBloxBot.sendMessage(
          chatId,
          showExportWarning.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  displayWalletPrivateKey = async (
    chatId: TelegramBot.ChatId,
    privateKey: string,
  ) => {
    try {
      const displayPrivateKey = await displayPrivateKeyMarkup(privateKey);
      if (displayPrivateKey) {
        const replyMarkup = { inline_keyboard: displayPrivateKey.keyboard };

        const sendPrivateKey = await this.egoBloxBot.sendMessage(
          chatId,
          displayPrivateKey.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
        if (sendPrivateKey) {
          // Delay the message deletion by 1 minute
          setTimeout(async () => {
            try {
              // Delete the message after 1 minute
              await this.egoBloxBot.deleteMessage(
                chatId,
                sendPrivateKey.message_id,
              );
            } catch (error) {
              console.error('Error deleting message:', error);
            }
          }, 60000);
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  walletPinPrompt = async (chatId: TelegramBot.ChatId) => {
    try {
      const session = await this.SessionModel.findOne({ chat_id: chatId });
      const walletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (walletPinPromptId) {
        if (session) {
          await this.SessionModel.updateOne(
            { chat_id: chatId },
            {
              walletPinPromptInput: true,
              $push: { walletPinPromptInputId: walletPinPromptId.message_id },
            },
          );
        }
        await this.SessionModel.create({
          chat_id: chatId,
          walletPinPromptInput: true,
          walletPinPromptInputId: [walletPinPromptId.message_id],
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendTokenWalletPinPrompt = async (
    chatId: TelegramBot.ChatId,
    transaction?: TransactionDocument,
  ) => {
    try {
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction.sender,
        process.env.USDC_ADDRESS,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction.sender,
        process.env.DAI_ADDRESS,
      );
      if (
        transaction.token === 'ETH' &&
        ethBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient ETH balance\nBalance: ${ethBalance.balance} ETH`,
        );
      } else if (
        transaction.token === 'USDC' &&
        usdcBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient USDC balance\nBalance: ${usdcBalance.balance} USDC`,
        );
      } else if (
        transaction.token === 'DAI' &&
        daiBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient DAI balance\nBalance: ${daiBalance.balance} DAI`,
        );
      }

      const sendTokenWalletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (sendTokenWalletPinPromptId) {
        await this.SessionModel.deleteMany({ chat_id: chatId });

        await this.SessionModel.create({
          chat_id: chatId,
          sendToken: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [sendTokenWalletPinPromptId.message_id],
          transactionId: transaction._id,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  buyAirtimeWalletPinPrompt = async (
    chatId: TelegramBot.ChatId,
    transaction?: TransactionDocument,
  ) => {
    try {
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction.sender,
        process.env.USDC_ADDRESS,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction.sender,
        process.env.DAI_ADDRESS,
      );
      if (
        transaction.token === 'ETH' &&
        ethBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient ETH balance\nBalance: ${ethBalance.balance} ETH\n\nAirtime amount: ${transaction.airtimeAmount}\nETH amount: ${transaction.amount} ETH`,
        );
      } else if (
        transaction.token === 'USDC' &&
        usdcBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient USDC balance\nBalance: ${usdcBalance.balance} USDC\n\nAirtime amount: ${transaction.airtimeAmount}\nUSDC amount: ${transaction.amount} USDC`,
        );
      } else if (
        transaction.token === 'DAI' &&
        daiBalance.balance <= +transaction.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient DAI balance\nBalance: ${daiBalance.balance} DAI\n\nAirtime amount: ${transaction.airtimeAmount}\nDAI amount: ${transaction.amount} DAI`,
        );
      }

      const buyAirtimWalletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (buyAirtimWalletPinPromptId) {
        await this.SessionModel.deleteMany({ chat_id: chatId });

        await this.SessionModel.create({
          chat_id: chatId,
          airtime: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [buyAirtimWalletPinPromptId.message_id],
          transactionId: transaction._id,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  showResetWalletWarning = async (chatId: TelegramBot.ChatId) => {
    try {
      const showResetWarning = await resetWalletWarningMarkup();
      if (showResetWarning) {
        const replyMarkup = { inline_keyboard: showResetWarning.keyboard };

        return await this.egoBloxBot.sendMessage(
          chatId,
          showResetWarning.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendTransactionReceipt = async (
    chatId: any,
    transactionReceipt: any,
    description?: any,
  ) => {
    try {
      const receipt = await transactionReceiptMarkup(
        transactionReceipt,
        description,
      );
      if (receipt) {
        const replyMarkup = {
          inline_keyboard: receipt.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, receipt.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  // utitlity functions
  isPrivateKey = async (input: string, chatId: number): Promise<boolean> => {
    const latestSession = await this.SessionModel.findOne({ chat_id: chatId });
    const trimmedInput = input.trim();
    const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
    if (privateKeyRegex.test(trimmedInput)) {
      return true;
    } else if (latestSession) {
      if (latestSession.importWallet) {
        this.egoBloxBot.sendMessage(chatId, 'Invalid Private KEY');
      }

      const promises = [];
      // loop through  import privateKey prompt to delete them
      for (let i = 0; i < latestSession.importWalletPromptInputId.length; i++) {
        try {
          promises.push(
            await this.egoBloxBot.deleteMessage(
              chatId,
              latestSession.importWalletPromptInputId[i],
            ),
          );
        } catch (error) {
          console.log(error);
        }
      }
      // loop through to delet all userReply
      for (let i = 0; i < latestSession.userInputId.length; i++) {
        try {
          promises.push(
            await this.egoBloxBot.deleteMessage(
              chatId,
              latestSession.userInputId[i],
            ),
          );
        } catch (error) {
          console.log(error);
        }
      }
      return false;
    }
    return false;
  };
}
