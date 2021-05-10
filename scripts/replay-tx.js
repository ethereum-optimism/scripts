require("colors");
const { Command } = require("commander");
const log = require("single-line-log").stdout;
const dotenv = require("dotenv").config();
const { Contract, Wallet, utils } = require("ethers");
const { getContractInterface } = require("@eth-optimism/contracts");
const { JsonRpcProvider, getDefaultProvider } = require("@ethersproject/providers");
const program = new Command();

program.requiredOption("-h, --hash <number>", "specify transaction hash");
program.requiredOption("-n, --network <string>", "specify network");
program.option("-k, --key <number>", "specify private key");
program.parse(process.argv);
const argOptions = program.opts();

const mainnetProvider = getDefaultProvider(argOptions.network);

const L1_MESSENGER_PROXY = "0xD1EC7d40CCd01EB7A305b94cBa8AB6D17f6a9eFE";

const wallet = new Wallet(argOptions.key, mainnetProvider);
const proxyL1Messenger = new Contract(L1_MESSENGER_PROXY, getContractInterface("OVM_L1CrossDomainMessenger"), wallet);

const main = async () => {
  const receipt = await mainnetProvider.getTransactionReceipt(argOptions.hash);

  const decodedMessages = [];
  for (const log of receipt.logs) {
    if (log.address === L1_MESSENGER_PROXY && log.topics[0] === utils.id("SentMessage(bytes)")) {
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
