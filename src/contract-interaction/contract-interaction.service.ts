import { Injectable } from '@nestjs/common';
import { abi } from './utils/abi';
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';
import { http, createPublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_URL =
  'https://api.developer.coinbase.com/rpc/v1/base-sepolia/Y3cqPVNjohH5-Cgg_veLfU4qfsgY5kix';

const NFT_CONTRACT_ADDRESS = '0x66519FCAee1Ed65bc9e0aCc25cCD900668D3eD49';

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
    console.log(publicClient);

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
