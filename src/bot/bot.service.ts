import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import {
  welcomeMessageMarkup,
  allFeaturesMarkup,
  wallerDetailsMarkup,
} from './markups';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/database/schemas/user.schema';
import { Model } from 'mongoose';
import { Session, SessionDocument } from 'src/database/schemas/session.schema';
import { Transaction } from 'src/database/schemas/transaction.schema';
import { WalletService } from 'src/wallet/wallet.service';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

@Injectable()
export class BotService {
  private readonly egoBloxBot: TelegramBot;
  private logger = new Logger(BotService.name);
  private readonly saltRounds = 10;

  constructor(
    private readonly walletService: WalletService,
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
      if (msg.text !== '/start' && session) {
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
    session: SessionDocument,
  ) => {
    await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
    try {
      // update users answerId
      await this.SessionModel.updateOne(
        { _id: session._id },
        { $push: { userInputId: msg.message_id } },
      );

      // function to detect 4 digit pin
      function isValidPin(pin) {
        const pinRegex = /^\d{4}$/;
        return pinRegex.test(pin);
      }

      // parse incoming message and handle commands
      try {
        // handle wallet creation
        if (isValidPin(msg.text.trim()) && session.walletPinPromptInput) {
          const pin = msg.text.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const newWallet = this.walletService.createWallet();

          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });

          // check if a user wallet details exist, then decrypt with default pin and and encrypt again
          if (user.walletAddress && user.walletDetails) {
            const decryptedWallet = await this.walletService.decryptWallet(
              process.env.DEFAULT_WALLET_PIN,
              user.walletDetails,
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
          } else {
            // encrypt wallet details with pin
            const encryptedWalletDetails =
              await this.walletService.encryptWallet(pin, newWallet.privateKey);
            // save  user wallet details
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                walletDetails: encryptedWalletDetails.json,
                pin: hashedPin,
                walletAddress: newWallet.address,
              },
            );

            await this.sendWalletDetails(msg.chat.id, newWallet.address);
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
        } //handle import wallet
        else if (
          (await this.isPrivateKey(msg.text.trim(), msg.chat.id)) &&
          session.importWalletPromptInput
        ) {
          const privateKey = msg.text.trim();
          console.log(privateKey);
          const importedWallet = this.walletService.getAddressFromPrivateKey(
            `${privateKey}`,
          );
          console.log(importedWallet);

          // encrypt wallet details with  default
          const encryptedWalletDetails = await this.walletService.encryptWallet(
            process.env.DEFAULT_WALLET_PIN,
            privateKey,
          );

          // save  user wallet details
          await this.UserModel.updateOne(
            { chat_id: msg.chat.id },
            {
              walletDetails: encryptedWalletDetails.json,
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
          // loop through to delet all userReply
          for (let i = 0; i < latestSession.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession.userInputId[i],
              ),
            );
          }

          await this.sendWalletDetails(msg.chat.id, importedWallet.address);
          return this.promptWalletPin(msg.chat.id);
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
            // update a user data with session id
            await this.UserModel.updateOne(
              { chat_id: chatId },
              { $push: { sessions: session._id } },
            );
            await this.promptWalletPin(chatId);
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

        // close opened markup and delete result
        // case '/closedelete':
        //   await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
        //   await this.databaseService.session.deleteMany({
        //     where: { chat_id: chatId },
        //   });
        //   //Number(bookingDetailsDbId)
        //   return await this.egoBloxBot.deleteMessage(
        //     query.message.chat.id,
        //     query.message.message_id,
        //   );

        case '/close':
          await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
          return await this.egoBloxBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        // case '/viewFiles':
        //   try {
        //     await this.egoBloxBot.sendMessage(chatId, '⏳ Request Processing .....');
        //     const allFiles = await this.databaseService.pdf.findMany({
        //       where: { owner: chatId },
        //     });
        //     if (allFiles) {
        //       const allFilesArray = [...allFiles];
        //       if (allFilesArray.length == 0) {
        //         return this.egoBloxBot.sendMessage(
        //           chatId,
        //           '❓ Your PDF list is empty',
        //         );
        //       } else {
        //         allFilesArray.map(async (file) => {
        //           try {
        //             const pdfDetail = await pdFDetails(
        //               file.name,
        //               file.url,
        //               file.sourceId,
        //             );
        //             if (pdfDetail) {
        //               const Markup = {
        //                 inline_keyboard: pdfDetail.keyboard,
        //               };

        //               await this.egoBloxBot.sendMessage(chatId, file.name, {
        //                 reply_markup: Markup,
        //               });
        //             } else {
        //               return;
        //             }
        //           } catch (error) {
        //             console.log(error);
        //           }
        //         });
        //       }
        //     }
        //   } catch (error) {
        //     console.log(error);
        //   }

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

  promptWalletPin = async (chatId: TelegramBot.ChatId) => {
    try {
      const session = await this.SessionModel.findOne({ chat_id: chatId });
      const pinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        'Please enter a 4 digit pin for your wallet transactions ‼️‼️please remember this pin',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (pinPromptId && session) {
        await this.SessionModel.updateOne(
          { chat_id: chatId },
          {
            walletPinPromptInput: true,
            $push: { walletPinPromptInputId: pinPromptId.message_id },
          },
        );
      } else {
        await this.SessionModel.create({
          chat_id: chatId,
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

  // utitlity functions
  isPrivateKey = async (input: string, chatId: number): Promise<boolean> => {
    const latestSession = await this.SessionModel.findOne({ chat_id: chatId });
    const trimmedInput = input.trim();
    const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;

    if (privateKeyRegex.test(trimmedInput)) {
      return true;
    } else if (latestSession.importWalletPromptInput) {
      this.egoBloxBot.sendMessage(chatId, 'Invalid Private KEY');

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
