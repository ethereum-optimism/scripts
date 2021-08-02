import dotenv from 'dotenv'
import { ethers } from 'ethers'
import { getContractInterface } from '@eth-optimism/contracts'
import { sleep } from '@eth-optimism/core-utils'
import dateformat from 'dateformat'

dotenv.config()
const l1RpcProviderUrl = process.env.CSR__L1_RPC_PROVIDER_URL
const l2RpcProviderUrl = process.env.CSR__L2_RPC_PROVIDER_URL
const stateCommitmentChainAddress = process.env.CSR__STATE_COMMITMENT_CHAIN_ADDRESS
const startingBatchIndex = parseInt(process.env.CSR__STARTING_BATCH_INDEX || '0', 10)

const main = async () => {
  const l1RpcProvider = new ethers.providers.StaticJsonRpcProvider(l1RpcProviderUrl)
  const l2RpcProvider = new ethers.providers.StaticJsonRpcProvider(l2RpcProviderUrl)
  const stateCommitmentChain = new ethers.Contract(
    stateCommitmentChainAddress,
    getContractInterface('OVM_StateCommitmentChain'),
    l1RpcProvider
  )
  const challengePeriodSeconds = await stateCommitmentChain.FRAUD_PROOF_WINDOW()

  let highestScannedBatchIndex = startingBatchIndex
  while (true) {
    const latestBatchIndex = await stateCommitmentChain.getTotalBatches()
    if (highestScannedBatchIndex >= latestBatchIndex) {
      await sleep(15000)
    }

    console.log(`Latest batch is ${latestBatchIndex}`)
    while (highestScannedBatchIndex < latestBatchIndex) {
      console.log(`Checking batch ${highestScannedBatchIndex}`)
      // Makes the assumption that there will only be a single event and that event definitely
      // exists. We expect this to succeed because highestScannedBatchIndex < latestBatchIndex.
      // I guess it would be bad if this ever fails and we should know about it in the form of an
      // error anyway.
      const batchEvents = await stateCommitmentChain.queryFilter(
        stateCommitmentChain.filters.StateBatchAppended(highestScannedBatchIndex)
      )
      const batchEvent = batchEvents[0]
      const batchTransaction = await batchEvent.getTransaction()
      const [stateRoots] = stateCommitmentChain.interface.decodeFunctionData(
        'appendStateBatch',
        batchTransaction.data
      )
      const prevTotalElements = batchEvent.args._prevTotalElements.toNumber()
      const batchSize = batchEvent.args._batchSize.toNumber()
      const nextTotalElements = prevTotalElements + batchSize
      const l2Blocks = await l2RpcProvider.send(
        'eth_getBlockRange',
        [
          `0x${(prevTotalElements + 1).toString(16)}`,
          `0x${(nextTotalElements + 1).toString(16)}`,
          false
        ]
      )
      for (let i = 0; i < stateRoots.length; i++) {
        if (l2Blocks[i].stateRoot !== stateRoots[i]) {
          throw new Error(`found mismatched state root at L2 block number ${prevTotalElements + i}`)
        }
      }
      const batchBlock = await batchEvent.getBlock()
      const nextSafeTimestamp = (batchBlock.timestamp + challengePeriodSeconds.toNumber()) * 1000
      console.log(`OK at batch ${highestScannedBatchIndex}`)
      console.log(`Total scanned ${nextTotalElements}`)
      console.log(`Safe until: ${dateformat(new Date(nextSafeTimestamp), 'mmmm dS, yyyy, h:MM:ss TT')}`)
      highestScannedBatchIndex++
    }
  }
}

main()
