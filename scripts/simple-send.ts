#!/usr/bin/env -S node --require ts-node/register

// Import necessary ethers.js components
import {providers, Wallet, utils, BigNumber} from 'ethers';
const {JsonRpcProvider} = providers;

// Retrieve configuration from environment variables
const cfg = config();

// Initialize a new provider with the HTTP endpoint from the config
const provider = new JsonRpcProvider(cfg.httpEndpoint);
// Connect a wallet using the private key from the config and the provider
const wallet = new Wallet(cfg.privateKey).connect(provider);

// Main async function to execute the transaction process
(async () => {
 // Fetch the wallet's address
 const address = await wallet.getAddress();
 console.log(`Sending from ${address}`);

 // Retrieve the wallet's balance
 const balance = await wallet.getBalance();
 console.log(`Balance: ${utils.formatEther(balance.toString())}`);

 // Get the current gas price
 const gasPrice = await wallet.getGasPrice();

 // Determine the gas limit, either from the config or by estimating
 let gasLimit;
 if (cfg.gasLimit) {
    gasLimit = BigNumber.from(cfg.gasLimit);
 } else {
    gasLimit = await wallet.estimateGas({
      to: cfg.transactionTo,
      gasPrice,
    });
 }

 console.log(`Using Gas Price: ${gasPrice.toString()}`);
 console.log(`Using Gas Limit: ${gasLimit.toString()}`);

 // Calculate the value to be sent, subtracting the gas fees from the balance
 const value = balance.sub(gasPrice.mul(gasLimit));
 console.log(`Sweeping balance ${utils.formatEther(value.toString())}`);
 console.log(`Sending to ${cfg.transactionTo}`);

 // Send the transaction
 const tx = await wallet.sendTransaction({
    to: cfg.transactionTo,
    value,
    gasPrice,
    gasLimit,
 });

 // Wait for the transaction receipt
 console.log('Waiting for receipt');
 const receipt = await tx.wait();
 console.log(receipt);
})().catch(err => {
 console.log(err);
 process.exit(1);
});

// Configuration function to fetch settings from environment variables
function config() {
 if (!process.env.PRIVATE_KEY)
    throw new Error('Must pass PRIVATE_KEY');
 if (!process.env.HTTP_ENDPOINT)
    throw new Error('Must pass HTTP_ENDPOINT');
 if (!process.env.TRANSACTION_TO)
    throw new Error('Must pass TRANSACTION_TO');
 return {
    privateKey: process.env.PRIVATE_KEY,
    httpEndpoint: process.env.HTTP_ENDPOINT,
    transactionTo: process.env.TRANSACTION_TO,
    gasLimit: process.env.GAS_LIMIT,
 };
}
