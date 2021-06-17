import { ethers } from "ethers"
import dotenv from "dotenv"
import cliprogress from "cli-progress"

import * as l2FundDistributorJSON from '../../artifacts-ovm/contracts/FundDistributor.sol/FundDistributor.json'

dotenv.config()
const l1RpcUrl = process.env.LOAD_TEST__L1_RPC_URL
const l2RpcUrl = process.env.LOAD_TEST__L2_RPC_URL
const privateKey = process.env.LOAD_TEST__L1_PRIVATE_KEY
const l1BridgeAddress = process.env.LOAD_TEST__L1_BRIDGE_ADDRESS
const numThreads = ethers.BigNumber.from(process.env.LOAD_TEST__NUM_THREADS)
const numTransactionsPerThread = ethers.BigNumber.from(process.env.LOAD_TEST__NUM_TRANSACTIONS_PER_THREAD)
const ethAllocationPerTransaction = ethers.utils.parseEther(process.env.LOAD_TEST__ETH_ALLOCATION_PER_TRANSACTION)

const sleep = async (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const main = async () => {
	const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcUrl)
	const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2RpcUrl)
	
	const l1MainWallet = new ethers.Wallet(privateKey, l1RpcProvider)
	const l2MainWallet = new ethers.Wallet(privateKey, l2RpcProvider)

  console.log(`main wallet address is: ${l1MainWallet.address}`)

  // Calculate how much ETH we need.
  const ethPerThread = ethAllocationPerTransaction.mul(numTransactionsPerThread)
  const minL2Balance = ethPerThread.mul(numThreads).mul(2) // Multiply by a factor of 2 just to be safe.
  console.log(`number of threads: ${numThreads}`)
  console.log(`number of transactions per thread: ${numTransactionsPerThread}`)
  console.log(`ETH required for load test: ${ethers.utils.formatEther(minL2Balance)} ETH`)

  // Fund the L2 wallet if necessary.
  let l1MainBalance = await l1MainWallet.getBalance()
  let l2MainBalance = await l2MainWallet.getBalance()
  console.log(`balance on L2 is ${ethers.utils.formatEther(l2MainBalance)} ETH`)
  if (l2MainBalance.lt(minL2Balance)) {
    console.log(`need to fund account on L2`)
    if (l1MainBalance.gt(minL2Balance)) {
      console.log(`funding account on L2 by depositing on L1...`)
      const l2DepositResult = await l1MainWallet.sendTransaction({
        to: l1BridgeAddress,
        value: minL2Balance
      })
      await l2DepositResult.wait()

      while (l2MainBalance.lt(minL2Balance)) {
        console.log(`waiting for deposit...`)
        await sleep(5000)
        l2MainBalance = await l2MainWallet.getBalance()
      }

      console.log(`deposit completed successfully`)
      console.log(`new balance on L2 is ${l2MainBalance.toString()}`)
    } else {
      throw new Error(`main account has less than minimum balance of ${ethers.utils.formatEther(minL2Balance)} L2 and does NOT have enough funds to deposit on L1`)
    }
  }

  // We want to keep track of these wallets so we can send the funds back when we're done.
	const wallets: ethers.Wallet[] = []
	for (let i = 0; i < numThreads.toNumber(); i++) {
		wallets.push(ethers.Wallet.createRandom())
  }

  console.log(`distributing L2 funds...`)
  const l2FundDistributorFactory = new ethers.ContractFactory(
    l2FundDistributorJSON.abi,
    l2FundDistributorJSON.bytecode
  )
  const l2FundDistributor = await l2FundDistributorFactory.connect(l2MainWallet).deploy()
  await l2FundDistributor.deployTransaction.wait()
  const l2DistributionResult = await l2FundDistributor.distribute(
    wallets.map((wallet) => {
      return wallet.address
    }),
    {
      value: minL2Balance.mul(90).div(100) // We already overestimated by 2x so using 90% here is fine. We need to retain gas for fees.
    }
  )
  await l2DistributionResult.wait()

  try {
    console.log(`starting load test...`)
    const progress = new cliprogress.SingleBar({
      clearOnComplete: true
    })
    progress.start(numThreads.mul(numTransactionsPerThread).toNumber(), 0)

    await Promise.all(wallets.map(async (wallet) => {
      for (let i = 0; i < numTransactionsPerThread.toNumber(); i++) {
        // TODO: Add support for more interesting transactions.
        progress.increment()
        const l2TxResult = await wallet.connect(l2RpcProvider).sendTransaction({
          to: "0x" + "11".repeat(20)
        })
        await l2TxResult.wait()
      }
    }))

    progress.stop()
  } catch (err) {
    console.log(`caught an unhandled error: ${err}`)
  } finally {
    console.log(`returning funds to main wallet...`)
    const intrinsicTxCost = ethers.utils.parseEther('0.005')

    await Promise.all(wallets.map(async (wallet) => {
      const l2Wallet = wallet.connect(l2RpcProvider)
      const l2Balance = await l2Wallet.getBalance()
      const l2RefundAmount = l2Balance.sub(intrinsicTxCost)
      if (l2RefundAmount.gt(0)) {
        const l2RefundResult = await l2FundDistributor.connect(l2Wallet).deposit({
          value: l2RefundAmount
        })
        await l2RefundResult.wait()
      }
    }))

    console.log(`withdrawing funds from L2 distributor...`)
    const l2WithdrawResult = await l2FundDistributor.connect(l2MainWallet).withdraw()
    await l2WithdrawResult.wait()
  }

  const finalL1MainBalance = await l1MainWallet.getBalance()
  const l1EthUsed = l1MainBalance.sub(finalL1MainBalance)
  console.log(`total ETH used on L1: ${ethers.utils.formatEther(l1EthUsed)} ETH`)

  const finalL2MainBalance = await l2MainWallet.getBalance()
  const l2EthUsed = l2MainBalance.sub(finalL2MainBalance)
  console.log(`total ETH used on L2: ${ethers.utils.formatEther(l2EthUsed)} ETH`)
  
  console.log(`done.`)
}

main()
