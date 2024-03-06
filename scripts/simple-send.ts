#!/usr/bin/env -S node --require ts-node/register

// Import necessary modules from ethers
import {providers, Wallet, utils, BigNumber} from 'ethers';
const {JsonRpcProvider} = providers;

// Function to read configuration from environment variables
function config() {
 // Check and throw errors if required environment variables are not set
 if (!process.env.PRIVATE_KEY)
    throw new Error('Must pass PRIVATE_KEY');
 if (!process.env.HTTP_ENDPOINT)
    throw new Error('Must pass HTTP_ENDPOINT');
 if (!process.env.TRANSACTION_TO)
    throw new Error('Must pass TRANSACTION_TO');
 // Return configuration object
 return {
    privateKey: process.env.PRIVATE_KEY,
    httpEndpoint: process.env.HTTP_ENDPOINT,
    transactionTo: process.env.TRANSACTION_TO,
    gasLimit: process.env.GAS_LIMIT,
 };
}

// Main function to execute the script
(async () => {
 const cfg = config(); // Read configuration

 // Initialize provider and wallet
 const provider = new JsonRpcProvider(cfg.httpEndpoint);
 const wallet = new Wallet(cfg.privateKey).connect(provider);

 // Fetch and log wallet address
 const address = await wallet.getAddress();
 console.log(`Sending from ${address}`);

 // Fetch and log wallet balance
 const balance = await wallet.getBalance();
 console.log(`Balance: ${utils.formatEther(balance.toString())}`);

 // Fetch and log gas price
 const gasPrice = await wallet.getGasPrice();

 // Calculate gas limit
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

 // Calculate value to be sent
 const value = balance.sub(gasPrice.mul(gasLimit));
 console.log(`Sweeping balance ${utils.formatEther(value.toString())}`);
 console.log(`Sending to ${cfg.transactionTo}`);

 // Send transaction
 const tx = await wallet.sendTransaction({
    to: cfg.transactionTo,
    value,
    gasPrice,
    gasLimit,
 });

 console.log('Waiting for receipt');
 const receipt = await tx.wait();
 console.log(receipt);
})().catch(err => {
 console.log(err);
 process.exit(1);
});
