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


/* Run! */
export const run = async () => {
  const THE_BLOCK_NUMBER = 70800
  const l2Provider = new OptimismProvider(env.L2_NODE_WEB3_URL)
  const wallet = Wallet.createRandom().connect(l2Provider)

  let lastBlockNumber = (await l2Provider.getBlock('latest')).number
  log.debug('Beginning spam')

  while (lastBlockNumber < THE_BLOCK_NUMBER) {
    log.debug('Sending tx...')
    const res = await wallet.sendTransaction({
      to: '0x4a16A42407AA491564643E1dfc1fd50af29794eF',
      data: '0x',
      gasPrice: 0
    })
    await res.wait()
    log.debug('Complete!')
    lastBlockNumber = (await l2Provider.getBlock('latest')).number
    log.debug('New last block:', lastBlockNumber)
  }
}

run()
