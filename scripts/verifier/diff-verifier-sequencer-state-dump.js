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
    url: `https://raw.githubusercontent.com/ethereum-optimism/regenesis/master/${process.env.ETH_NETWORK}/2.json`,
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

  const tempDiff = await diff(vdump, sdump);
  const differences = [];

  if (tempDiff) {
    // swaps addresses for contract names
    for (const diffItem of tempDiff) {
      const address = diffItem.path[1] && diffItem.path[1].toUpperCase();
      if (addressMapping[address]) {
        diffItem.path[1] = addressMapping[address];
      }
      if (
        !(diffItem.path[1] === "ExchangeRates" && diffItem.path[2] === "storage") &&
        diffItem.lhs !== "93556a6d522eaf218b0a2363868f4e029c67e9a9c7bd6d4da605e45a9242e7ea" &&
        diffItem.lhs !==
          "608060405234801561001057600080fd5b50600436106100365760003560e01c80630900f010146100a1578063aaf10f42146100c9575b6000806100825a6100456100ed565b6000368080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525061011d92505050565b91509150811561009457805160208201f35b61009d816102c0565b5050005b6100c7600480360360208110156100b757600080fd5b50356001600160a01b031661036a565b005b6100d16100ed565b604080516001600160a01b039092168252519081900360200190f35b60006101187fdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead610406565b905090565b6000606060006101e586868660405160240180848152602001836001600160a01b0316815260200180602001828103825283818151815260200191508051906020019080838360005b8381101561017e578181015183820152602001610166565b50505050905090810190601f1680156101ab5780820380516001836020036101000a031916815260200191505b5060408051601f198184030181529190526020810180516001600160e01b03166001620631bb60e21b0319179052945061046c9350505050565b90508080602001905160408110156101fc57600080fd5b81516020830180516040519294929383019291908464010000000082111561022357600080fd5b90830190602082018581111561023857600080fd5b825164010000000081118282018810171561025257600080fd5b82525081516020918201929091019080838360005b8381101561027f578181015183820152602001610267565b50505050905090810190601f1680156102ac5780820380516001836020036101000a031916815260200191505b506040525050509250925050935093915050565b610366816040516024018080602001828103825283818151815260200191508051906020019080838360005b838110156103045781810151838201526020016102ec565b50505050905090810190601f1680156103315780820380516001836020036101000a031916815260200191505b5060408051601f198184030181529190526020810180516001600160e01b0316632a2a7adb60e01b179052925061046c915050565b5050565b6103ae61037561047e565b6001600160a01b03166103866104d4565b6001600160a01b0316146040518060600160405280603281526020016106276032913961050b565b6103b781610519565b50565b604080516024810184905260448082018490528251808303909101815260649091019091526020810180516001600160e01b0316628af59360e61b1790526104019061046c565b505050565b6040805160248082018490528251808303909101815260449091019091526020810180516001600160e01b03166303daa95960e01b179052600090819061044c9061046c565b905080806020019051602081101561046357600080fd5b50519392505050565b60606104785a8361054c565b92915050565b6040805160048152602481019091526020810180516001600160e01b0316631cd4241960e21b17905260009081906104b59061046c565b90508080602001905160208110156104cc57600080fd5b505191505090565b6040805160048152602481019091526020810180516001600160e01b031663996d79a560e01b17905260009081906104b59061046c565b8161036657610366816102c0565b6103b77fdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead6001600160a01b0383166103ba565b60606000339050600080826001600160a01b031686866040518082805190602001908083835b602083106105915780518252601f199092019160209182019101610572565b6001836020036101000a03801982511681845116808217855250505050505090500191505060006040518083038160008787f1925050503d80600081146105f4576040519150601f19603f3d011682016040523d82523d6000602084013e6105f9565b606091505b5090925090508161060c57805160208201fd5b80516001141561061c5760016000f35b925061047891505056fe454f41732063616e206f6e6c792075706772616465207468656972206f776e20454f4120696d706c656d656e746174696f6ea264697066735822122088cac10270b367dc69b01caa116dbd07bebdf5c47c1ab480f3b13fc8e7ed63d864736f6c63430007060033"
      ) {
        differences.push(diffItem);
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
