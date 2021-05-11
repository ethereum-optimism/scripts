const dotenv = require("dotenv");
const fs = require("fs");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { Contract } = require("@ethersproject/contracts");
const { ethers } = require("ethers");
const synthetixL2Bridge = require("./SynthetixBridgeToBase.json");
const { Watcher } = require("@eth-optimism/watcher");

dotenv.config();

const FETCH_SIZE = 1000;
const l1Provider = new JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`);
const l2Provider = new JsonRpcProvider(`https://mainnet.optimism.io`);

const watcher = new Watcher({
  l1: {
    provider: l1Provider,
    messengerAddress: "0xD1EC7d40CCd01EB7A305b94cBa8AB6D17f6a9eFE",
  },
  l2: {
    provider: l2Provider,
    messengerAddress: "0x4200000000000000000000000000000000000007",
  },
});

(async () => {
  // SNX bridge
  const l2BridgeAddress = "0x4D7186818daBFe88bD80421656BbD07Dffc979Cc";
  const l2BridgeContract = new Contract(l2BridgeAddress, synthetixL2Bridge, l2Provider);

  try {
    const withdrawals = await getTxHistory({
      provider: l2Provider,
      bridgeAddress: l2BridgeAddress,
      eventFilter: l2BridgeContract.filters.WithdrawalInitiated,
    });
  } catch (err) {
    console.error(err);
  }

  async function getTxHistory({ bridgeAddress, provider, eventFilter }) {
    try {
      const currentBlock = await provider.getBlockNumber();
      // const currentBlock = 21634;
      let toBlock = currentBlock;
      let fromBlock = toBlock - FETCH_SIZE;
      while (fromBlock > 0) {
        console.log("fromBlock", fromBlock);
        console.log("toBlock", toBlock);
        try {
          const logs = await provider.getLogs({
            ...eventFilter(),
            fromBlock,
            toBlock,
          });
          const events = await processLogs({ logs, provider });
          fs.appendFileSync(__dirname + `/dump.json`, JSON.stringify(events, null, 2));
          toBlock = fromBlock - 1;
          fromBlock = fromBlock - FETCH_SIZE;
        } catch (err) {
          console.error(err);
        }
        await new Promise((res) => setTimeout(res, 100));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function processLogs({ logs, provider }) {
    try {
      const events = await Promise.all(
        logs.map(async (l) => {
          const block = await provider.getBlock(l.blockNumber);
          const { args } = l2BridgeContract.interface.parseLog(l);
          const initiatedTime = Number(block.timestamp * 1000);
          return {
            initiatedTime,
            account: args.account,
            amount: args.amount.toString(),
            l2TransactionHash: l.transactionHash,
          };
        })
      );
      return await Promise.all(
        events.map(async (event) => {
          try {
            const msgHashes = await watcher.getMessageHashesFromL2Tx(event.l2TransactionHash);
            const receipt = await watcher.getL1TransactionReceipt(msgHashes[0], false);
            const eventObj = {
              ...event,
              status: receipt?.transactionHash ? "COMPLETE" : "PENDING",
              l1TransactionHash: receipt?.transactionHash,
              completedTime: receipt?.timestamp,
            };

            return eventObj;
          } catch (err) {
            console.error(err);
          }
        })
      );
    } catch (err) {
      console.error(err);
    }
  }
})();
