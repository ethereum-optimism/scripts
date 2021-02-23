/**
 * Utility script for running a health check that compares the state of a verifier to the state of
 * the current sequencer. Useful for catching discrepancies on verifier/sequencer codebases.
 *
 * Required environment variables:
 * VERIFIER_ENDPOINT: RPC endpoint for the verifier node.
 * SEQUENCER_ENDPOINT: RPC endpoint for the sequencer node.
 */
require("colors");
const axios = require("axios");
const diff = require("deep-diff").diff;
const fs = require("fs");
const log = require("single-line-log").stdout;
const dotenv = require("dotenv").config();
const { JsonRpcProvider } = require("@ethersproject/providers");

const sources = {
  kovan: [
    { url: "https://raw.githubusercontent.com/ethereum-optimism/regenesis/master/kovan/1.json", path: "accounts" },
    {
      url: "https://raw.githubusercontent.com/Synthetixio/synthetix/develop/publish/deployed/kovan-ovm/deployment.json",
      path: "targets",
    },
  ],
  mainnet: [
    { url: "", path: "accounts" },
    { url: "", path: "targets" },
  ],
};

const getBlock = async (provider, index) => {
  return provider.send("eth_getBlockByNumber", [`0x${index.toString(16)}`, true]);
};

const getAddressMapping = async () => {
  const addressMapping = {};

  for (const addressItem of sources[process.env.ETH_NETWORK]) {
    let { data: contractInfo } = await axios.get(addressItem.url);
    contractInfo = contractInfo[addressItem.path];
    for (const contractName in contractInfo) {
      const contractAddress = contractInfo[contractName].address;
      addressMapping[contractAddress] = contractName;
    }
  }
  return addressMapping;
};

async function main() {
  const addressMapping = await getAddressMapping();
  const verifier = new JsonRpcProvider(process.env.VERIFIER_ENDPOINT);
  const sequencer = new JsonRpcProvider(process.env.SEQUENCER_ENDPOINT);
  console.log("----------getting Verifier dump-----------");

  // get current block number for verifier and sequeuncer
  const latestVerifierBlockNum = await verifier.getBlockNumber();
  const latestSequencerBlockNum = await sequencer.getBlockNumber();

  // use lower block number
  const latestBlockNum = Math.min(latestVerifierBlockNum, latestSequencerBlockNum);

  console.log(`Getting the verfier data...`);

  let vdump = await verifier.send("debug_dumpBlock", [`0x${latestBlockNum.toString(16)}`]);

  console.log(`Getting the sequencer data...`);
  let sdump = await sequencer.send("debug_dumpBlock", [`0x${latestBlockNum.toString(16)}`]);

  console.log(`Stringifying data...`);

  console.log(`Making the diff...`);
  var differences = diff(vdump, sdump);
  console.log(differences);
  fs.writeFileSync("diff.json", JSON.stringify(differences, null, 2));
}

main();
