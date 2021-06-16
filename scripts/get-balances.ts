#!/usr/bin/env -S node --require ts-node/register

import {ethers} from 'ethers'
import { writeFileSync } from 'fs'

import { getContractFactory } from '@eth-optimism/contracts'
import dotenv from 'dotenv'
dotenv.config()

const env = process.env
const NODE_URL = env.NODE_URL || 'http://localhost:8545'
const ETH_ADDR = env.ETH_ADDR || '0x4200000000000000000000000000000000000006'
const FROM_BLOCK = env.FROM_BLOCK || '0'
const TO_BLOCK = env.TO_BLOCK || 'latest'

const blockInterval = 5000

const events = []

const balances = {}

;(async () => {
  console.log('booting up fam')
  const provider = new ethers.providers.JsonRpcProvider(NODE_URL)
  const signer = ethers.Wallet.createRandom().connect(provider)
  const erc20Contract = getContractFactory('OVM_L2DepositedERC20').connect(signer).attach(ETH_ADDR)

  let maxBlock
  if (TO_BLOCK === 'latest') {
    const lastBlock = await provider.getBlock('latest')
    maxBlock = lastBlock.number
  } else {
    maxBlock = parseInt(TO_BLOCK, 10)
  }
  console.log('Max block:', maxBlock)

  const fromBlock = parseInt(FROM_BLOCK, 10)
  let toBlock
  for (let i = fromBlock; i < maxBlock; i += blockInterval) {
    toBlock = i + blockInterval
    if (toBlock > maxBlock) {
      toBlock = maxBlock
    }
    console.log('Getting events for blocks', i, 'to', toBlock)
    const transfers = await getTransfers(i, toBlock, erc20Contract)
    events.push(...transfers)
  }

  console.log('fetched all events, writing them to file')
  const eventsJson = JSON.stringify(events, null, 2)
  console.log('writing to file ./all-events.json')
  writeFileSync('./all-events.json', eventsJson, 'utf-8' )

  console.log('setting all known addresses balances to zero')
  // go through all addresses that we found and set their balances to zero
  for (const e of events) {
    balances[e.args.from] = '0x00'
  }

  console.log('querying all known addresses for their real balance')
  console.log('number of addresses', Object.keys(balances).length)
  let counter = 0
  // query all of the balances
  for (const address in balances) {
    if (balances.hasOwnProperty(address)) {
      console.log('got balance', counter)
      balances[address] = (await erc20Contract.balanceOf(address)).toHexString()
      counter+=1
    }
  }

  console.log('querying all known addresses for their real balance')
  console.log(balances)

  const balancesJson = JSON.stringify(balances, null, 2)
  console.log('writing to file ./all-balances.json')
  writeFileSync('./all-balances.json', balancesJson, 'utf-8' )
})().catch(err => {
  // const thing = await daiContract.queryFilter(filterFrom, 9843470, 9843480)
  console.log(err)
  process.exit(1)
})

async function getTransfers(startBlock, endBlock, contract) {
  return contract.queryFilter(contract.filters.Transfer(null, null), startBlock, endBlock)
}
