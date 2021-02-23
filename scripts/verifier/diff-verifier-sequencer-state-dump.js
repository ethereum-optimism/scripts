/**
 * Utility script for running a health check that compares the state of a verifier to the state of
 * the current sequencer. Useful for catching discrepancies on verifier/sequencer codebases.
 *
 * Required environment variables:
 * VERIFIER_ENDPOINT: RPC endpoint for the verifier node.
 * SEQUENCER_ENDPOINT: RPC endpoint for the sequencer node.
 */
require("colors");
const { Command } = require("commander");
const axios = require("axios");
const diff = require("deep-diff").diff;
const fs = require("fs");
const log = require("single-line-log").stdout;
const dotenv = require("dotenv").config();
const { JsonRpcProvider } = require("@ethersproject/providers");
const program = new Command();

program.option("-b, --block <number>", "specify block number");
program.option("-s, --search", "binary search for specific diff");
program.parse(process.argv);
const argOptions = program.opts();

const sources = [
  {
    url: `https://raw.githubusercontent.com/ethereum-optimism/regenesis/master/${process.env.ETH_NETWORK}/1.json`,
    path: "accounts",
  },
  {
    url: `https://raw.githubusercontent.com/Synthetixio/synthetix/develop/publish/deployed/${process.env.ETH_NETWORK}-ovm/deployment.json`,
    path: "targets",
  },
];

const verifier = new JsonRpcProvider(process.env.VERIFIER_ENDPOINT);
const sequencer = new JsonRpcProvider(process.env.SEQUENCER_ENDPOINT);

const getBlock = async (provider, index) => {
  return provider.send("eth_getBlockByNumber", [`0x${index.toString(16)}`, true]);
};

async function getAddressMappping() {
  const addressMapping = {};
  for (const addressItem of sources) {
    let { data: contractInfo } = await axios.get(addressItem.url);
    contractInfo = contractInfo[addressItem.path];
    for (const contractName in contractInfo) {
      const contractAddress = contractInfo[contractName].address.toUpperCase();
      addressMapping[contractAddress] = contractName;
    }
  }
  return addressMapping;
}

async function main() {
  const addressMapping = await getAddressMappping();
  const latestVerifierBlockNum = await verifier.getBlockNumber();
  const latestSequencerBlockNum = await sequencer.getBlockNumber();

  // use lower block number
  const blockNum = +argOptions.block || Math.min(latestVerifierBlockNum, latestSequencerBlockNum);

  const differences = (await getDiff(blockNum, addressMapping)) || [];

  fs.writeFileSync("diff.json", JSON.stringify(differences, null, 2));
}

async function getDiff(blockNum, addressMapping) {
  console.log("Making diff at block", blockNum);

  let vdump = await verifier.send("debug_dumpBlock", [`0x${blockNum.toString(16)}`]);
  let sdump = await sequencer.send("debug_dumpBlock", [`0x${blockNum.toString(16)}`]);

  const differences = await diff(vdump, sdump);

  if (differences) {
    // swaps addresses for contract names
    for (const diffItem of differences) {
      const address = diffItem.path[1] && diffItem.path[1].toUpperCase();
      if (addressMapping[address]) {
        diffItem.path[1] = addressMapping[address];
      }
    }
  }
  return differences;
}

/**
 * Search for specific diff (use -s flag in command)
 */
async function binarySearch() {
  const addressMapping = await getAddressMappping();
  const latestVerifierBlockNum = await verifier.getBlockNumber();
  const latestSequencerBlockNum = await sequencer.getBlockNumber();

  let startBlock = 1;
  let endBlock = Math.min(latestVerifierBlockNum, latestSequencerBlockNum);
  let middleBlock, differences;

  while (startBlock + 1 !== endBlock) {
    middleBlock = Math.floor((startBlock + endBlock) / 2);
    differences = await getDiff(middleBlock, addressMapping);

    if (
      differences &&
      // change logic here to find where a specific diff begins
      differences.find(
        (diffItem) => diffItem.path[1] === "OVM_L2CrossDomainMessenger" && diffItem.path[2] === "storage"
      )
    ) {
      endBlock = middleBlock;
    } else {
      startBlock = middleBlock;
    }
  }
  fs.writeFileSync("diff.json", JSON.stringify(differences, null, 2));
  console.log("\nDifference starts at", endBlock, "🎉");
}

if (argOptions.search) {
  binarySearch();
} else {
  main();
}
