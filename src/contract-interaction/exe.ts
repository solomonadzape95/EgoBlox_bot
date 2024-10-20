import { ContractInteractionService } from './contract-interaction.service';

async function main() {
  const service = new ContractInteractionService();

  const privateKey =
    '0x4af0d34f7152213dcc1e478239f1960b8580287cfe8904ff5344872113c9af13'; // Replace with your private key
  try {
    console.log(await service.executeEthTransferTransaction(privateKey));
  } catch (error) {
    console.error('Error executing transaction:', error);
  }
}

main();

//this is address: 0x254152680D520d3BBFDA92B88682Ea3F2d616201

//0xce5333e65ee7da869d48bb9ee2a2dc1892a917b0;
