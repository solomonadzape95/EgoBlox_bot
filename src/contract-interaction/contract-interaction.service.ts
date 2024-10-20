import { Injectable } from '@nestjs/common';
import { abi } from './utils/abi';
import { erc20Abi } from './utils/erc20Abi';
import { egoBloxAbi } from './utils/egoBloxAbi';
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';
import { http, createPublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// const RPC_URL =
//   'https://api.developer.coinbase.com/rpc/v1/base-sepolia/Y3cqPVNjohH5-Cgg_veLfU4qfsgY5kix';

const RPC_URL =
  'https://api.developer.coinbase.com/rpc/v1/base-sepolia/EGY1etgHHkQgIMQlJrAw95c6RlQ3Xhlw';

const NFT_CONTRACT_ADDRESS = '0x66519FCAee1Ed65bc9e0aCc25cCD900668D3eD49';
const EGOBLOX_ADDRESS = '0xb0cfc25ebcb215759b0f30f1affe35d8b0bdede9';

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

@Injectable()
export class ContractInteractionService {
  // Get account based on private key
  async getAccount(privateKey: `0x${string}`) {
    console.log('I am here', privateKey);
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

  // Execute the mintTo function on the NFT contract
  async executeMintTransaction(privateKey: `0x${string}`) {
    try {
      const userAccount = await this.getAccount(privateKey);
      console.log('this is address:', userAccount.address);
      const bundlerClient = await this.getBundlerClient(privateKey);

      const mintToCall: any = {
        abi: abi,
        functionName: 'mintTo',
        to: NFT_CONTRACT_ADDRESS,
        args: [userAccount.address, 1],
      };

      userAccount.userOperation = {
        estimateGas: (userOperation) =>
          this.estimateGas(userOperation, bundlerClient),
      };

      // Sign and send the UserOperation
      const userOpHash = await bundlerClient.sendUserOperation({
        account: userAccount,
        calls: [mintToCall],
        paymaster: true,
      });

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      this.logTransactionSuccess(receipt.userOpHash, userAccount.address);
    } catch (error) {
      console.error('Error sending transaction: ', error);
      process.exit(1);
    }
  }

  // execute eth transfer
  // Execute ETH transfer transaction
  async executeEthTransferTransaction(privateKey: `0x${string}`) {
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
        args: [`0xcA4aC4b48b15998C0315B2043e7f66C5383dC8E7`],
        value: 0.0002 * 10 ** 18, // Amount in ETH (converted to wei)
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

      // Step 7: Log the transaction success
      this.logTransactionSuccess(receipt.userOpHash, userAccount.address);
    } catch (error) {
      console.error('Error sending transaction: ', error);
      process.exit(1);
    }
  }

  // Execute the erc20 token transfer
  async executeTransferErc20Transaction(privateKey: `0x${string}`) {
    try {
      const userAccount = await this.getAccount(privateKey);
      console.log('this is address:', userAccount.address);
      const bundlerClient = await this.getBundlerClient(privateKey);

      const transferCall: any = {
        abi: erc20Abi,
        functionName: 'transfer',
        to: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`,
        args: [`0xCe5333e65Ee7DA869D48BB9EE2A2Dc1892A917B0`, 0.99999 * 10 ** 6],
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

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      this.logTransactionSuccess(receipt.userOpHash, userAccount.address);
    } catch (error) {
      console.error('Error sending transaction: ', error);
      process.exit(1);
    }
  }

  // Log success message with relevant links
  private logTransactionSuccess(userOpHash: string, userAddress: string) {
    console.log('✅ Transaction successfully sponsored!');
    console.log(
      `⛽ View sponsored UserOperation on blockscout: https://base-sepolia.blockscout.com/op/${userOpHash}`,
    );
    console.log(
      `🔍 View NFT mint on basescan: https://sepolia.basescan.org/address/${userAddress}`,
    );
    process.exit();
  }
}
