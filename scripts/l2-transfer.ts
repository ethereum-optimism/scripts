/**
 * This script transfers ETH between Optimistic Mainnet accounts
 */

import { providers, Wallet, utils, Contract } from "ethers";
import { getContractInterface, predeploys } from "@eth-optimism/contracts";
const { JsonRpcProvider } = providers;

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

(async () => {
  const cfg = config();

  const provider = new JsonRpcProvider("https://mainnet.optimism.io");
  const wallet = new Wallet(cfg.privateKey).connect(provider);
  const l2ETHContract = new Contract(predeploys.OVM_ETH, getContractInterface("OVM_ETH"), wallet);
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
