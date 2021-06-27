/**
 * This script transfers ETH between Optimistic Mainnet accounts
 */

const { providers, Wallet, utils, Contract } = require("ethers");
const { getContractInterface } = require("@eth-optimism/contracts");
const { JsonRpcProvider } = providers;

const cfg = config();

const provider = new JsonRpcProvider("https://mainnet.optimism.io");
const wallet = new Wallet(cfg.privateKey).connect(provider);
const l2ETHContract = new Contract(
  "0x4200000000000000000000000000000000000006",
  getContractInterface("OVM_ETH"),
  wallet
);

(async () => {
  const address = await wallet.getAddress();
  console.log(`Sending from ${address}`);

  const balance = await wallet.getBalance();
  console.log(`Balance: ${utils.formatEther(balance.toString())}`);

  console.log(`Sending to ${cfg.to}`);

  const tx = await l2ETHContract.transfer(cfg.to, utils.parseUnits(cfg.amount));

  console.log("Waiting for receipt");
  const receipt = await tx.wait();
  console.log(receipt);
})().catch((err) => {
  console.log(err);
  process.exit(1);
});

function config() {
  if (!process.env.PRIVATE_KEY) throw new Error("Must pass PRIVATE_KEY");
  if (!process.env.TO) throw new Error("Must pass TO");
  if (!process.env.AMOUNT) throw new Error("Must pass AMOUNT");
  return {
    privateKey: process.env.PRIVATE_KEY,
    to: process.env.TO,
    amount: process.env.AMOUNT,
  };
}
