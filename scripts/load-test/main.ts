import { ethers } from "ethers"
import dotenv from "dotenv"
import cliprogress from "cli-progress"

// import * as l2FundDistributorJSON from '../../artifacts-ovm/contracts/FundDistributor.sol/FundDistributor.json'

dotenv.config()
const l1RpcUrl = process.env.LOAD_TEST__L1_RPC_URL
const l2RpcUrl = process.env.LOAD_TEST__L2_RPC_URL
const privateKey = process.env.LOAD_TEST__L1_PRIVATE_KEY
// const l1BridgeAddress = process.env.LOAD_TEST__L1_BRIDGE_ADDRESS
const transactionsPerSecond = ethers.BigNumber.from(process.env.LOAD_TEST__TRANSACTIONS_PER_SECOND)
const totalRuntimeSeconds = ethers.BigNumber.from(process.env.LOAD_TEST__TOTAL_RUNTIME_SECONDS || Infinity)
// const totalEthAllocation = ethers.utils.parseEther(process.env.LOAD_TEST__TOTAL_ETH_ALLOCATION)

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
  console.log(`transactions per second: ${transactionsPerSecond.toString()}`)
  console.log(`total runtime: ${totalRuntimeSeconds.toString()} seconds`)
  // console.log(`total ETH allocation: ${ethers.utils.formatEther(totalEthAllocation)} ETH`)

  // Fund the L2 wallet if necessary.
  let l1MainBalance = await l1MainWallet.getBalance()
  let l2MainBalance = await l2MainWallet.getBalance()
  // console.log(`balance on L2 is ${ethers.utils.formatEther(l2MainBalance)} ETH`)
  // if (l2MainBalance.lt(totalEthAllocation)) {
  //   console.log(`need to fund account on L2`)
  //   if (l1MainBalance.gt(totalEthAllocation)) {
  //     console.log(`funding account on L2 by depositing on L1...`)
  //     const l2DepositResult = await l1MainWallet.sendTransaction({
  //       to: l1BridgeAddress,
  //       value: totalEthAllocation
  //     })
  //     await l2DepositResult.wait()

  //     while (l2MainBalance.lt(totalEthAllocation)) {
  //       console.log(`waiting for deposit...`)
  //       await sleep(5000)
  //       l2MainBalance = await l2MainWallet.getBalance()
  //     }

  //     console.log(`deposit completed successfully`)
  //     console.log(`new balance on L2 is ${l2MainBalance.toString()}`)
  //   } else {
  //     throw new Error(`main account has less than minimum balance of ${ethers.utils.formatEther(totalEthAllocation)} L2 and does NOT have enough funds to deposit on L1`)
  //   }
  // }

  // We want to keep track of these wallets so we can send the funds back when we're done.
  const transactionsPerThreadPerSecond = 0.5
  const numThreads = ethers.BigNumber.from(transactionsPerSecond.toNumber() / transactionsPerThreadPerSecond)

	const wallets: ethers.Wallet[] = []
	for (let i = 0; i < numThreads.toNumber(); i++) {
		wallets.push(ethers.Wallet.createRandom())
  }

  // console.log(`distributing L2 funds...`)
  // const l2FundDistributorFactory = new ethers.ContractFactory(
  //   l2FundDistributorJSON.abi,
  //   l2FundDistributorJSON.bytecode
  // )
  // const l2FundDistributor = await l2FundDistributorFactory.connect(l2MainWallet).deploy({
  //   gasPrice: 0
  // })
  // await l2FundDistributor.deployTransaction.wait()

  // const maxWalletsPerDistribution = 50
  // const numWallets = wallets.length
  // let numWalletsFunded = 0
  // while (numWalletsFunded < numWallets) {
  //   const walletsToFund = Math.min(maxWalletsPerDistribution, numWallets - numWalletsFunded)
  //   const fundingAmount = totalEthAllocation.mul(walletsToFund).div(numWallets)
  //   const l2DistributionResult = await l2FundDistributor.distribute(
  //     wallets.slice(numWalletsFunded, numWalletsFunded + walletsToFund).map((wallet) => {
  //       return wallet.address
  //     }),
  //     {
  //       value: fundingAmount,
  //       gasPrice: 0
  //     }
  //   )
  //   await l2DistributionResult.wait()
  //   numWalletsFunded += walletsToFund
  // }

  try {
    const progress = new cliprogress.SingleBar({
      format: 'Load test progress | {bar} | {percentage}% | TPS: {tps}',
    })
    progress.start(totalRuntimeSeconds.toNumber(), 0, {
      tps: 0
    })

    let runtime = 0
    let totalTxs = 0
    const progressUpdateInterval = setInterval(() => {
      runtime++
      const tps = totalTxs / runtime
      progress.update(runtime, {
        tps: tps.toFixed(2)
      })

      if (runtime === totalRuntimeSeconds.toNumber()) {
        progress.stop()
        clearInterval(progressUpdateInterval)
      }
    }, 1000)

    console.log(`starting load test...`)
    await Promise.all(wallets.map(async (wallet) => {
      let running = true
      setTimeout(() => {
        running = false
      }, totalRuntimeSeconds.toNumber() * 1000)

      while (running) {
        const l2TxResult = await wallet.connect(l2RpcProvider).sendTransaction({
          to: "0x" + "11".repeat(20),
          gasPrice: 0
        })
        await l2TxResult.wait()
        totalTxs++
      }
    }))
  } catch (err) {
    console.log(`caught an unhandled error: ${err}`)
  } finally {
    // console.log(`returning funds to main wallet...`)
    // // Zero for now because we can do gasPrice = 0
    // const intrinsicTxCost = ethers.utils.parseEther('0')

    // await Promise.all(wallets.map(async (wallet) => {
    //   const l2Wallet = wallet.connect(l2RpcProvider)
    //   const l2Balance = await l2Wallet.getBalance()
    //   const l2RefundAmount = l2Balance.sub(intrinsicTxCost)
    //   if (l2RefundAmount.gt(0)) {
    //     const l2RefundResult = await l2FundDistributor.connect(l2Wallet).deposit({
    //       value: l2RefundAmount,
    //       gasPrice: 0
    //     })
    //     await l2RefundResult.wait()
    //   }
    // }))

    // console.log(`withdrawing funds from L2 distributor...`)
    // const l2WithdrawResult = await l2FundDistributor.connect(l2MainWallet).withdraw({
    //   gasPrice: 0
    // })
    // await l2WithdrawResult.wait()
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
