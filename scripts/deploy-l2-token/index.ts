#!/usr/bin/env -S node --require ts-node/register

import { providers, Wallet, utils, Contract } from "ethers";
import { getContractInterface, predeploys } from "@eth-optimism/contracts";
import dotenv from "dotenv";
dotenv.config();

const TOKEN_NAME = "Optimistic Token";
const TOKEN_SYMBOL = "OPM";
const L1_TOKEN_ADDRESS = "0x8Ea80Efa7ca0bcF7dbCd9D4cffc3578802887903";

function config() {
  if (!process.env.PRIVATE_KEY) throw new Error("Must pass PRIVATE_KEY");
  if (!process.env.NETWORK) throw new Error("Must pass NETWORK");
  return {
    privateKey: process.env.PRIVATE_KEY,
    network: process.env.NETWORK,
  };
}

(async () => {
  console.log("booting up fam\n");
  const cfg = config();

  const l2FactoryAddress =
    cfg.network === "kovan"
      ? "0x50EB44e3a68f1963278b4c74c6c343508d31704C"
      : "0x2e985AcD6C8Fa033A4c5209b0140940E24da7C5C";

  const l2Provider = new providers.JsonRpcProvider(`https://${cfg.network}.optimism.io`);
  const wallet = new Wallet(cfg.privateKey).connect(l2Provider);
  const l2TokenFactory = new Contract(l2FactoryAddress, getContractInterface("OVM_L2StandardTokenFactory"), wallet);
  const address = await wallet.getAddress();
  console.log(`Deploying ${TOKEN_NAME} ($${TOKEN_SYMBOL}) from ${address}...`);
  const tx = await l2TokenFactory.createStandardL2Token(L1_TOKEN_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL);
  const receipt = await tx.wait();
  const [, tokenCreatedEvent] = receipt.events;
  const l2TokenAddress = tokenCreatedEvent.args._l2Token;
  console.log(`Deployed to ${l2TokenAddress} on Optimistic ${cfg.network}`);
})().catch((err) => {
  console.log(err);
  process.exit(1);
});
