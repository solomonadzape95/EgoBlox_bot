// import { Injectable, Logger } from '@nestjs/common';
// import {
//   toSimpleSmartAccount,
//   toSafeSmartAccount,
//   toEcdsaKernelSmartAccount,
// } from 'permissionless/accounts';
// import { privateKeyToAccount } from 'viem/accounts';
// import { http, createPublicClient, encodeFunctionData } from 'viem';
// import { baseSepolia } from 'viem/chains';
// import {} from 'permissionless/actions';
// import { createPimlicoClient } from 'permissionless/clients/pimlico';
// import { abi } from './utils/abi.js'; // Import ABI
// import { config } from '../contract-interaction/config.js'; // Import the config file

// @Injectable()
// export class ContractInteractionService {
//   private readonly logger = new Logger(ContractInteractionService.name);
//   private publicClient = createPublicClient({
//     transport: http(config.rpc_url),
//   });

//   private cloudPaymaster = createPimlicoClient({
//     chain: baseSepolia,
//     transport: http(config.rpc_url),
//   });

//   // Method to get the account based on account type
//   async getAccount(type: string) {
//     const signer = privateKeyToAccount(config.private_key as any);

//     switch (type) {
//       case 'simple':
//         this.logger.log('Creating a Simple Account...');
//         return await toSimpleSmartAccount(this.publicClient, {
//           privateKey: config.private_key,
//           factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454',
//           entryPoint: config.entry_point,
//         });
//       case 'safe':
//         this.logger.log('Creating a Safe Account...');
//         return await toSafeSmartAccount(this.publicClient, {
//           entryPoint: config.entry_point,
//           signer: signer,
//           safeVersion: '1.4.1',
//         });
//       case 'kernel':
//         this.logger.log('Creating a Kernel Account...');
//         return await toEcdsaKernelSmartAccount(this.publicClient, {
//           entryPoint: config.entry_point,
//           signer: signer,
//         });
//       default:
//         throw new Error('Invalid account type in config.json');
//     }
//   }

//   // Method to execute the smart contract interaction
//   async executeTransaction() {
//     try {
//       // Get the account based on account type
//       const account = await this.getAccount(config.account_type);

//       // Create the smart account client
//       const smartAccountClient = createSmartAccountClient({
//         account,
//         chain: baseSepolia,
//         transport: http(config.rpc_url),
//         sponsorUserOperation: this.cloudPaymaster.sponsorUserOperation,
//       });

//       // Encode the function data for the contract interaction
//       const callData = encodeFunctionData({
//         abi: abi,
//         functionName: config.function_name,
//         args: [smartAccountClient.account.address, 0], // Modify args as necessary
//       });

//       this.logger.log(
//         `Minting to ${account.address} (Account type: ${config.account_type})`,
//       );
//       this.logger.log('Waiting for transaction...');

//       // Send the transaction
//       const txHash = await smartAccountClient.sendTransaction({
//         account: smartAccountClient.account,
//         to: config.contract_address,
//         data: callData,
//         value: BigInt(0), // Adjust value if necessary
//       });

//       // Log transaction success
//       this.logger.log(
//         `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Developer Platform!`,
//       );
//       this.logger.log(
//         `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`,
//       );

//       return txHash;
//     } catch (error) {
//       this.logger.error(`❌ Error executing transaction: ${error.message}`);
//       throw new Error(error.message);
//     }
//   }
// }
