import { Injectable } from '@nestjs/common';
import { erc20Abi } from './utils/erc20Abi';
import { egoBloxAbi } from './utils/egoBloxAbi';
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';
import { http, createPublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.PAYMASTER_RPC_URL;

const EGOBLOX_ADDRESS = process.env.EGOBLOX_ADDRESS;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

@Injectable()
export class ContractInteractionService {
  // Get account based on private key
  async getAccount(privateKey: `0x${string}`) {
    const owner = privateKeyToAccount(privateKey);
    console.log(owner);

    return await toCoinbaseSmartAccount({
      client: publicClient,
      owners: [owner],
    });
  }

  // Get bundler client for processing transactions
  private async getBundlerClient(privateKey: `0x${string}`) {
    const userAccount = await this.getAccount(privateKey);
    return createBundlerClient({
      account: userAccount,
      client: publicClient,
      transport: http(RPC_URL),
      chain: baseSepolia,
    });
  }

  // Helper function to estimate gas and adjust pre-verification gas
  private async estimateGas(userOperation, bundlerClient) {
    const estimate =
      await bundlerClient.estimateUserOperationGas(userOperation);
    estimate.preVerificationGas *= 2n; // Adjust preVerification upward
    return estimate;
  }

  // execute eth transfer
  async executeEthTransferTransaction(
    privateKey: `0x${string}`,
    receiver: `0x${string}`,
    amount: number,
  ) {
    try {
      // Step 1: Get the user's account from the private key
      const userAccount = await this.getAccount(privateKey);
      console.log('This is the address:', userAccount.address);

      // Step 2: Initialize bundler client or provider
      const bundlerClient = await this.getBundlerClient(privateKey);

      // Step 3: Create the ETH transfer transaction
      const ethTransferCall: any = {
        abi: egoBloxAbi,
        functionName: 'transferETH',
        to: EGOBLOX_ADDRESS,
        args: [receiver],
        value: amount * 10 ** 18, // Amount in ETH (converted to wei)
      };

      // Step 4: Assign the gas estimation logic
      userAccount.userOperation = {
        estimateGas: (userOperation) =>
          this.estimateGas(userOperation, bundlerClient),
      };

      // Step 5: Sign and send the transaction
      const userOpHash = await bundlerClient.sendUserOperation({
        account: userAccount,
        calls: [ethTransferCall], // Using ETH transfer call instead of ERC-20 function
        paymaster: true, // Paymaster logic (optional)
      });

      // Step 6: Wait for the transaction receipt
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log('Transaction receipt :', receipt);
      return receipt;
    } catch (error) {
      console.error('Error sending transaction: ', error);
      process.exit(1);
    }
  }

  // Execute the erc20 token transfer
  async executeTransferErc20Transaction(
    privateKey: `0x${string}`,
    tokenAddress: `0x${string}`,
    receiver: `0x${string}`,
    amount: number,
    decimals: number,
  ) {
    try {
      const userAccount = await this.getAccount(privateKey);
      console.log('this is address:', userAccount.address);
      const bundlerClient = await this.getBundlerClient(privateKey);

      const transferCall: any = {
        abi: erc20Abi,
        functionName: 'transfer',
        to: tokenAddress,
        args: [receiver, amount * 10 ** decimals],
      };

      userAccount.userOperation = {
        estimateGas: (userOperation) =>
          this.estimateGas(userOperation, bundlerClient),
      };

      // Sign and send the UserOperation
      const userOpHash = await bundlerClient.sendUserOperation({
        account: userAccount,
        calls: [transferCall],
        paymaster: true,
      });

      // Step 6: Wait for the transaction receipt
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log('Transaction receipt :', receipt);
      return receipt;
    } catch (error) {
      console.error('Error sending transaction: ', error);
      process.exit(1);
    }
  }

  // Log success message with relevant links
  // private logTransactionSuccess(userOpHash: string, userAddress: string) {
  //   console.log('✅ Transaction successfully sponsored!');
  //   console.log(
  //     `⛽ View sponsored UserOperation on blockscout: https://base-sepolia.blockscout.com/op/${userOpHash}`,
  //   );
  //   console.log(
  //     `🔍 View NFT mint on basescan: https://sepolia.basescan.org/address/${userAddress}`,
  //   );
  //   process.exit();
  // }
}
