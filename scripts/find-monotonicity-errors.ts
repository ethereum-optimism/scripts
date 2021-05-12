#!/usr/bin/env -S node --require ts-node/register

import {OptimismProvider} from '@eth-optimism/provider'

const endpoint = process.env.L2_WEB3_URL || 'https://mainnet.optimism.io'
const L2Provider = new OptimismProvider(endpoint);

const blocks = [];
const start = 1

;(async () => {
  const height = await L2Provider.getBlockNumber()
  console.log(`L2 Tip: ${height}`)
  for (let i = start; i < height; i++) {
    if (i % 100 === 0)
      console.log(`Checking height ${i}`)

    const block = await L2Provider.getBlockWithTransactions(i)
    const prev = blocks[blocks.length - 1]
    if (!prev)
      continue;

    if (prev.timestamp > block.timestamp || prev.transactions[0].l1BlockNumber > block.transactions[0].l1BlockNumber) {
      log(prev)
      log(block)
    }
    blocks.push(block)
  }
})().catch(err => {
  console.error(err)
  process.exit(1)
})

function log(block) {
  const tx = block.transactions[0]
  console.log(`Monotonicity violation at index: ${block.number - 1}`)
  console.log(`  timestamp - ${block.timestamp}`)
  console.log(`  bn        - ${tx.l1BlockNumber}`)
  console.log(`  qo        - ${tx.queueOrigin}`)
  console.log(`  hash      - ${tx.hash}`)
}
