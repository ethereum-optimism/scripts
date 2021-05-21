/**
 * Message replayer script
 * Requires a hash, network (string), and hash or block number
 * If block number provided, it loops over the transaction history and replays all failed txs
 */
require("colors");
const { Command } = require("commander");
const log = require("single-line-log").stdout;
const dotenv = require("dotenv").config();
const { Contract, Wallet, utils } = require("ethers");
const { getContractInterface } = require("@eth-optimism/contracts");
const { JsonRpcProvider, getDefaultProvider } = require("@ethersproject/providers");
const program = new Command();

program.requiredOption("-n, --network <string>", "specify network");
program.requiredOption("-k, --key <number>", "specify private key");
program.option("-h, --hash <number>", "specify transaction hash");
program.option("-b, --blockNumber <number>", "specify a block number");

program.parse(process.argv);
const argOptions = program.opts();

const mainnetProvider = getDefaultProvider(argOptions.network);

// Addresses from May 11 regenesis
const MAINNET_L1_MESSENGER_PROXY = "0x902e5fF5A99C4eC1C21bbab089fdabE32EF0A5DF";
const KOVAN_L1_MESSENGER_PROXY = "0x78b88FD62FBdBf67b9C5C6528CF84E9d30BB28e0";

const wallet = new Wallet(argOptions.key, mainnetProvider);
const proxyL1Messenger = new Contract(L1_MESSENGER_PROXY, getContractInterface("OVM_L1CrossDomainMessenger"), wallet);

const main = async () => {
  if (!argOptions.hash && !argOptions.blockNumber) {
    console.error("Must provide a hash or block number.");
    return;
  }

  if (argOptions.hash) {
    replayMessage(argOptions.hash);
  } else {
    // TODO: loop over blocks starting at argOptions.blockNumber, get all failed transactions and replay them
  }
};

const replayMessage = async (hash) => {
  const l1MessengerProxy = argOptions.network === "mainnet" ? MAINNET_L1_MESSENGER_PROXY : KOVAN_L1_MESSENGER_PROXY;
  const receipt = await mainnetProvider.getTransactionReceipt(hash);

  const decodedMessages = [];
  for (const log of receipt.logs) {
    if (log.address === l1MessengerProxy && log.topics[0] === utils.id("SentMessage(bytes)")) {
      const [message] = utils.defaultAbiCoder.decode(["bytes"], log.data);

      const xDomainInterface = getContractInterface("OVM_L2CrossDomainMessenger");
      const decodedMessage = xDomainInterface.decodeFunctionData("relayMessage", message);
      decodedMessages.push(decodedMessage);
    }
  }

  for (const message of decodedMessages) {
    try {
      await proxyL1Messenger.replayMessage(
        message._target,
        message._sender,
        message._message,
        message._messageNonce,
        3000000
      );
    } catch (err) {
      console.log(err);
    }
  }
};

main();
