#!/usr/bin/env -S node --require ts-node/register

/**
 * Simple script for printing out all of the blocks in L2 for a range. This was designed for debugging monotonicity bugs.
 *
 * Required environment variables:
 * START_BLOCK: The first block to query.
 * NUMBER_OF_BLOCKS: The number of blocks that should be returned. (END_BLOCK = START_BLOCK + NUMBER_OF_BLOCKS)
 * L1_NODE_WEB3_URL: L1 node
 * L2_NODE_WEB3_URL: L2 node
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

log.debug('hello world')

/* Env */
const env = process.env

/* Types */
export interface RollupInfo {
  signer: string
  mode: 'sequencer' | 'verifier'
  syncing: boolean
  l1BlockHash: string
  l1BlockHeight: number
  addresses: {
    canonicalTransactionChain: string
    stateCommitmentChain: string
    addressResolver: string
    l1ToL2TransactionQueue: string
    sequencerDecompression: string
  }
}

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
  const THE_BLOCK_NUMBER = 70800
  const l2Provider = new OptimismProvider(env.L2_NODE_WEB3_URL)
  const wallet = Wallet.createRandom().connect(l2Provider)

  let lastBlockNumber = (await l2Provider.getBlock('latest')).number
  log.debug(lastBlockNumber)

  for (let i = lastBlockNumber; i < THE_BLOCK_NUMBER; i++) {
    wallet.sendTransaction({
      to: '0x4a16A42407AA491564643E1dfc1fd50af29794eF',
      data: '0x',
      gasPrice: 0
    })
  }
}

run()
