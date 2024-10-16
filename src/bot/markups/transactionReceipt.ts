export const transactionReceiptMarkup = async (
  receipt: any,
  description?: any,
) => {
  return {
    message: `<b>Transaction Receipt</b>\n\nHash: <a href="${process.env.BASE_SCAN_URL}/tx/${receipt.transactionHash}">${receipt.transactionHash}</a>\n\nStatus:${receipt.status === 0 ? 'Failed ❌' : 'Successful ✅'}\nDescription:${description || ''}`,

    keyboard: [
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
