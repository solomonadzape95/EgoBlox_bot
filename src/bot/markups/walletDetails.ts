export const wallerDetailsMarkup = async (address: any) => {
  return {
    message: `<b>Your Wallet:</b>\n\n<b>Address:</b> <code>${address}</code>\n\n Tap to copy the address and send Eth, USDC or any token on base to deposit.`,
    keyboard: [
      [
        {
          text: '🔎 View on basescan',
          url: `https://sepolia.basescan.org/address/${address}`,
        },
        {
          text: 'check Balance',
          callback_data: JSON.stringify({
            command: '/checkBalance',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Export wallet',
          callback_data: JSON.stringify({
            command: '/exportWallet',
            language: 'english',
          }),
        },
        {
          text: 'Reset wallet',
          callback_data: JSON.stringify({
            command: '/resetWallet',
            language: 'english',
          }),
        },
      ],
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
  };
};
