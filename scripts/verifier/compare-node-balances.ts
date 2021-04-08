#!/usr/bin/env -S node --require ts-node/register

import { ethers } from 'ethers'
import synthetix from 'synthetix'
import * as path from 'path'
import * as fs from 'fs'
import { JsonRpcProvider } from '@ethersproject/providers'

const env = process.env
const NODE_A_URL = env.NODE_A_URL || 'http://127.0.0.1:8545'
const NODE_B_URL = env.NODE_B_URL || 'http://mainnet.optimism.io'
const MAX_BLOCKS_PER_LOOP = 1000

const range = (
  start: number,
  stop: number
) => {
  return [...Array(stop - start)].map((_, i) => {
    return start + i
  })
}

const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, ms)
  })
}

const snxSources = synthetix.wrap({
  network: 'mainnet',
  useOvm: true,
  fs,
  path
}).getSource({
  contract1: 'Synthetix',
  network: 'mainnet',
  useOvm: true
})

const loadSnxContract = (
  name: string,
  address: string,
  provider: JsonRpcProvider
) => {
  return new ethers.Contract(address, snxSources[name].abi, provider)
}

const main = async () => {
  const nodeA_rpcProvider = new ethers.providers.JsonRpcProvider(NODE_A_URL)
  const nodeB_rpcProvider = new ethers.providers.JsonRpcProvider(NODE_B_URL)

  const nodeA_highestBlock = await nodeA_rpcProvider.getBlockNumber()
  const nodeB_highestBlock = await nodeB_rpcProvider.getBlockNumber()

  const highestBlockNumber = Math.min(nodeA_highestBlock, nodeB_highestBlock)
  let currentBlockNumber = 1

  const touchedAccounts = new Set()
  while (currentBlockNumber < highestBlockNumber) {
    try {
      const targetBlockNumber = Math.min(
        currentBlockNumber + MAX_BLOCKS_PER_LOOP,
        highestBlockNumber
      )

      console.log(`Loading blocks ${currentBlockNumber} - ${targetBlockNumber}`)
      const blocks = await Promise.all(
        range(currentBlockNumber, targetBlockNumber + 1).reduce((blockPromises: Promise<any>[], i) => {
          blockPromises.push(
            nodeA_rpcProvider.send('eth_getBlockByNumber', [`0x${i.toString(16)}`, true]),
            nodeB_rpcProvider.send('eth_getBlockByNumber', [`0x${i.toString(16)}`, true]),
          )

          return blockPromises
        }, [])
      )

      for (const block of blocks) {
        touchedAccounts.add(block.transactions[0].from)
        touchedAccounts.add(block.transactions[0].to)
      }

      currentBlockNumber = targetBlockNumber
    } catch (err) {
      console.log(`Caught an error trying to load blocks. Trying again in 5s.`)
      await sleep(5000)
    }
  }

  // `null` is the target for contract creations, not a real account.
  touchedAccounts.delete(null)
  console.log(`Found a total of ${touchedAccounts.size} touched accounts`)

  const nodeA_Synthetix = loadSnxContract('ProxyERC20', '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', nodeA_rpcProvider)
  const nodeA_ProxyERC20sUSD = loadSnxContract('ProxyERC20', '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9', nodeA_rpcProvider)
  const nodeB_Synthetix = loadSnxContract('ProxyERC20', '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', nodeB_rpcProvider)
  const nodeB_ProxyERC20sUSD = loadSnxContract('ProxyERC20', '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9', nodeB_rpcProvider)

  for (const account of Array.from(touchedAccounts)) {
    try {
      console.log(`Checking balances for: ${account}...`)
      const [
        nodeA_snxBalance,
        nodeA_susdBalance,
        nodeB_snxBalance,
        nodeB_susdBalance,
      ] = await Promise.all([
        nodeA_Synthetix.balanceOf(account, {blockTag: highestBlockNumber}),
        nodeA_ProxyERC20sUSD.balanceOf(account, {blockTag: highestBlockNumber}),
        nodeB_Synthetix.balanceOf(account, {blockTag: highestBlockNumber}),
        nodeB_ProxyERC20sUSD.balanceOf(account, {blockTag: highestBlockNumber})
      ])

      if (!nodeA_snxBalance.eq(nodeA_snxBalance)) {
        console.log(`SNX balance mismatch!`)
        console.log(`Balance on nodeA node: ${nodeA_snxBalance.toString()}`)
        console.log(`Balance on nodeB node: ${nodeB_snxBalance.toString()}`)
      }
      if (!nodeA_susdBalance.eq(nodeB_susdBalance)) {
        console.log(`sUSD balance mismatch!`)
        console.log(`Balance on nodeA node: ${nodeA_susdBalance.toString()}`)
        console.log(`Balance on nodeB node: ${nodeB_susdBalance.toString()}`)
      }
    } catch (err) {
      console.log(`Caught an error, trying again in 5 seconds...`)
      console.log(err)
      await sleep(5000)
    }
  }
}

main()
