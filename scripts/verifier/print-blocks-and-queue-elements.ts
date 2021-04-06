#!/usr/bin/env -S node --require ts-node/register

/**
 * Simple script for printing out all of the blocks in L2 for a range. This was designed for debugging monotonicity bugs.
 *
 * Required environment variables:
 * START_BLOCK: The first block to query.
 * NUMBER_OF_BLOCKS: The number of blocks that should be returned. (END_BLOCK = START_BLOCK + NUMBER_OF_BLOCKS)
 * L1_NODE_WEB3_URL: L1 node
 * L2_NODE_WEB3_URL: L2 node
 * ADDRESS_MANAGER_ADDRESS: Address of address manager
 */

/* External Imports */
import { Wallet } from 'ethers'
import {
  BlockWithTransactions,
  Provider,
  TransactionResponse,
} from '@ethersproject/abstract-provider'
import {
  JsonRpcProvider,
  TransactionReceipt,
} from '@ethersproject/providers'
import {
  getContractInterface,
  getContractFactory,
} from '@eth-optimism/contracts'
import { OptimismProvider } from '@eth-optimism/provider'
import * as fs from 'fs'
import dotenv from 'dotenv'
dotenv.config()

/* Logging */
const log = { debug: console.log }

/* Env */
const env = process.env
const startBlock = parseInt(env.START_BLOCK, 10)
let numberOfBlocks = parseInt(env.NUMBER_OF_BLOCKS, 10)

/* Types */
export enum QueueOrigin {
  Sequencer = 0,
  L1ToL2 = 1,
}

export const queueOriginPlainText = {
  0: QueueOrigin.Sequencer,
  1: QueueOrigin.L1ToL2,
  sequencer: QueueOrigin.Sequencer,
  l1ToL2: QueueOrigin.L1ToL2,
}

export interface L2Transaction extends TransactionResponse {
  l1BlockNumber: number
  l1TxOrigin: string
  txType: number
  queueOrigin: number
}

export interface L2Block extends BlockWithTransactions {
  stateRoot: string
  transactions: [L2Transaction]
}


/* Run! */
export const run = async () => {
  const l2Provider = new OptimismProvider(env.L2_NODE_WEB3_URL)

  const lastBlockNumber = (await l2Provider.getBlock('latest')).number
  const test = await l2Provider.getBlockWithTransactions(lastBlockNumber)

  if (!numberOfBlocks) {
    numberOfBlocks = lastBlockNumber - startBlock
  }

  const blocks: L2Block[]  = []
  const l1ToL2Blocks: L2Block[]  = []
  const endBlock = startBlock + numberOfBlocks

  console.log(`Starting block: ${startBlock}`)
  console.log(`End block: ${endBlock}`)
  for (let i = startBlock; i < endBlock; i++) {
    blocks.push(await l2Provider.getBlockWithTransactions(i) as L2Block)
    console.log('Got block', i)
  }

  const queueTxs: L2Block[]  = []
  for (const block of blocks) {
    if (block.transactions[0].queueOrigin === ('sequencer' as any)) {
      console.log('sequencer tx found!')
    } else {
      console.log('queue tx found!')
      queueTxs.push(block)
    }
  }

  console.log('writing all blocks...')
  const allBlocks = JSON.stringify(blocks, null, 2)
  fs.writeFileSync('./all-blocks.json', allBlocks, 'utf-8')  // lord forgive me for i have sinned
  console.log('writing all queue txs...')
  const allQueueTxs = JSON.stringify(queueTxs, null, 2)
  fs.writeFileSync('./all-queue-txs.json', allQueueTxs, 'utf-8')  // lord forgive me for i have sinned
  console.log('~~~~~~~~~~~~ Some final debug info: ~~~~~~~~~~~~~~')

  // Get all of the queue elements
  const l1Provider = new JsonRpcProvider(env.L1_NODE_WEB3_URL)
  const ctcAddress = (await getChainAddresses(l1Provider, l2Provider)).ctcAddress
  const wallet = new Wallet('0x1101010101010101010101010101010101010101010101010101010101010100', l1Provider)
  const ctc = (await getContractFactory('OVM_CanonicalTransactionChain', wallet)).attach(ctcAddress)

  const nextQueueIndex = await ctc.getNextQueueIndex()
  console.log('Next Queue Index', nextQueueIndex)

  const totalQueueElements = await ctc.getTotalElements()
  console.log('Total Queue Elements', totalQueueElements.toString())

  const pendingQueueElements = await ctc.getNumPendingQueueElements()
  console.log('Pending Queue Elements', pendingQueueElements.toString())

  const elements = []
  for (let i = 0; i < nextQueueIndex; i++) {
    const element = await ctc.getQueueElement(i)
    elements.push({
      index: i,
      timestamp: element[1],
      blockNumber: element[2]
    })
  }

  fs.writeFileSync('./all-queue-elements.json', JSON.stringify(elements, null, 2), 'utf-8')
}


async function getChainAddresses(
  l1Provider: JsonRpcProvider,
  l2Provider: JsonRpcProvider
): Promise<{ ctcAddress: string; sccAddress: string }> {
  const addressManager = (
    await getContractFactory('Lib_AddressManager')
  ).attach(env.ADDRESS_MANAGER_ADDRESS).connect(l1Provider)
  const sccAddress = await addressManager.getAddress(
    'OVM_StateCommitmentChain'
  )
  const ctcAddress = await addressManager.getAddress(
    'OVM_CanonicalTransactionChain'
  )

  return {
    ctcAddress,
    sccAddress,
  }
}

run()
