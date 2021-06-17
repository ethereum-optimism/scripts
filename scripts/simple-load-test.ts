import hre from "hardhat"
import { ethers } from "ethers"
import dotenv from "dotenv"
import yesno from "yesno"

import * as l1FundDistrubutorJSON from '../artifacts/contracts/FundDistributor.sol/FundDistributor.json'
import * as l2FundDistributorJSON from '../artifacts-ovm/contracts/FundDistributor.sol/FundDistributor.json'

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

const yesOrExit = async (question: string): Promise<void> => {
  const ok = await yesno({
    question
  })

  if (!ok) {
    console.log(`exiting`)
    process.exit(1)
  }
}

const main = async () => {
	const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1RpcUrl)
	const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2RpcUrl)
	
	const l1MainWallet = new ethers.Wallet(privateKey, l1RpcProvider)
	const l2MainWallet = new ethers.Wallet(privateKey, l2RpcProvider)

  console.log(`wallet address on L1 is: ${l1MainWallet.address}`)
  console.log(`wallet address on L2 is: ${l2MainWallet.address}`)

  // Calculate how much ETH we need.
  const ethPerThread = ethAllocationPerTransaction.mul(numTransactionsPerThread)
  const minEthPerMainWallet = ethPerThread.mul(numThreads).mul(2)
  console.log(`number of threads: ${numThreads}`)
  console.log(`number of transactions per thread: ${numTransactionsPerThread}`)
  console.log(`gas allocation per thread: ${ethers.utils.formatEther(ethPerThread)} ETH`)

  // Make sure the wallet has a balance on L1.
  const l1MainBalance = await l1MainWallet.getBalance()
  console.log(`balance on L1 is ${ethers.utils.formatEther(l1MainBalance)} ETH`)
  if (l1MainBalance.lt(minEthPerMainWallet)) {
    throw new Error(`main account has less than minimum balance of ${ethers.utils.formatEther(minEthPerMainWallet)} on L1`)
  }

  // Fund the L2 wallet if necessary.
  let l2MainBalance = await l2MainWallet.getBalance()
  console.log(`balance on L2 is ${ethers.utils.formatEther(l2MainBalance)} ETH`)
  if (l2MainBalance.lt(minEthPerMainWallet)) {
    console.log(`need to fund account on L2`)
    if (l2MainBalance.sub(minEthPerMainWallet).gt(minEthPerMainWallet)) {
      await yesOrExit(`ok to deposit ${ethers.utils.formatEther(minEthPerMainWallet)} ETH?`)

      console.log(`funding account on L2 by depositing on L1...`)
      const l2DepositResult = await l1MainWallet.sendTransaction({
        to: l1BridgeAddress,
        value: minEthPerMainWallet
      })
      await l2DepositResult.wait()

      while (l2MainBalance.lt(minEthPerMainWallet)) {
        console.log(`waiting for deposit...`)
        await sleep(5000)
        l2MainBalance = await l2MainWallet.getBalance()
      }

      console.log(`deposit completed successfully`)
      console.log(`new balance on L2 is ${l2MainBalance.toString()}`)
    } else {
      throw new Error(`main account has less than minimum balance of ${ethers.utils.formatEther(minEthPerMainWallet)} L2 and does NOT have enough funds to deposit on L1`)
    }
  }

  // We want to keep track of these wallets so we can send the funds back when we're done.
	const wallets: ethers.Wallet[] = []
	for (let i = 0; i < numThreads.toNumber(); i++) {
		wallets.push(ethers.Wallet.createRandom())
  }

  const l1FundDistributorFactory = new ethers.ContractFactory(
    l1FundDistrubutorJSON.abi,
    l1FundDistrubutorJSON.bytecode
  )
  console.log(`deploying L1 fund distributor contract...`)
  const l1FundDistributor = await l1FundDistributorFactory.connect(l1MainWallet).deploy()
  await l1FundDistributor.deployTransaction.wait()
  console.log(`depositing funds into L1 distributor...`)
  const l1DepositResult = await l1FundDistributor.deposit({
    value: minEthPerMainWallet
  })
  await l1DepositResult.wait()
  console.log(`approving L1 wallets...`)
  const l1ApproveResult = await l1FundDistributor.approve(wallets.map((wallet) => {
    return wallet.address
  }))
  await l1ApproveResult.wait()

  const l2FundDistributorFactory = new ethers.ContractFactory(
    l2FundDistributorJSON.abi,
    l2FundDistributorJSON.bytecode
  )
  console.log(`deploying L2 fund distributor contract...`)
  const l2FundDistributor = await l2FundDistributorFactory.connect(l2MainWallet).deploy()
  await l2FundDistributor.deployTransaction.wait()
  console.log(`depositing funds into L2 distributor...`)
  const l2DepositResult = await l2FundDistributor.deposit({
    value: minEthPerMainWallet
  })
  await l2DepositResult.wait()
  console.log(`approving L2 wallets...`)
  const l2ApproveResult = await l2FundDistributor.approve(wallets.map((wallet) => {
    return wallet.address
  }))
  await l2ApproveResult.wait()

  await yesOrExit(`ready to start load test?`)

  try {
    console.log(`funding wallets...`)
    await Promise.all(wallets.map(async (wallet) => {
      const l1Wallet = wallet.connect(l1RpcProvider)
      const l1FundResult = await l1FundDistributor.connect(l1Wallet).withdraw(ethPerThread)
      await l1FundResult.wait()
      const l1Balance = await l1Wallet.getBalance()
      if (l1Balance.eq(0)) {
        throw new Error(`unable to fund account on L1: ${wallet.address}`)
      }
      console.log(`funded address ${wallet.address} on L1`)

      const l2Wallet = wallet.connect(l2RpcProvider)
      const l2FundResult = await l2FundDistributor.connect(l2Wallet).withdraw(ethPerThread)
      await l2FundResult.wait()
      const l2Balance = await l2Wallet.getBalance()
      if (l2Balance.eq(0)) {
        throw new Error(`unable to fund account on L2: ${wallet.address}`)
      }
      console.log(`funded address ${wallet.address} on L2`)
    }))

    console.log(`running load tests...`)
    await Promise.all(wallets.map(async (wallet, idx) => {
      console.log(`starting thread for account: ${wallet.address}`)
      for (let i = 0; i < numTransactionsPerThread.toNumber(); i++) {
        console.log(`thread ${idx} executing tx ${i}`)
        // TODO: Add support for more interesting transactions.
        const l2TxResult = await wallet.connect(l2RpcProvider).sendTransaction({
          to: "0x" + "11".repeat(20)
        })
        await l2TxResult.wait()
      }
      console.log(`finished thread for account: ${wallet.address}`)
    }))
  } catch (err) {
    console.log(`caught an unhandled error: ${err}`)
  } finally {
    console.log(`returning funds to main wallet`)
    const intrinsicTxCost = ethers.utils.parseEther('0.005')

    await Promise.all(wallets.map(async (wallet) => {
      const l1Wallet = wallet.connect(l1RpcProvider)
      const l1Balance = await l1Wallet.getBalance()
      const l1RefundAmount = l1Balance.sub(intrinsicTxCost)
      if (l1RefundAmount.gt(0)) {
        const l1RefundResult = await l1FundDistributor.connect(l1Wallet).deposit({
          value: l1RefundAmount
        })
        await l1RefundResult.wait()
        console.log(`returned L1 funds from account: ${wallet.address}`)
      } else {
        console.log(`account has no L1 funds to return: ${wallet.address}`)
      }

      const l2Wallet = wallet.connect(l2RpcProvider)
      const l2Balance = await l2Wallet.getBalance()
      const l2RefundAmount = l2Balance.sub(intrinsicTxCost)
      if (l2RefundAmount.gt(0)) {
        const l2RefundResult = await l2FundDistributor.connect(l2Wallet).deposit({
          value: l2RefundAmount
        })
        await l2RefundResult.wait()
        console.log(`returned L2 funds for account: ${wallet.address}`)
      } else {
        console.log(`account has no L2 funds to return: ${wallet.address}`)
      }
    }))

    console.log(`withdrawing funds from L1 distributor...`)
    const l1FundDistributorBalance = await l1FundDistributor.balance()
    const l1WithdrawResult = await l1FundDistributor.connect(l1MainWallet).withdraw(l1FundDistributorBalance)
    await l1WithdrawResult.wait()

    console.log(`withdrawing funds from L2 distributor...`)
    const l2FundDistributorBalance = await l2FundDistributor.balance()
    const l2WithdrawResult = await l2FundDistributor.connect(l2MainWallet).withdraw(l2FundDistributorBalance)
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
