import { Contract, providers, ethers } from 'ethers'
import { writeFileSync, createWriteStream } from 'fs'
import dotenv from 'dotenv'
import { stringifyStream } from '@discoveryjs/json-ext'

import { getContractFactory } from '@eth-optimism/contracts'
import {
  abi as FACTORY_ABI
} from '@uniswap/v3-core-optimism/artifacts-ovm/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

dotenv.config()

const env = process.env
const NODE_URL = env.NODE_URL || 'http://localhost:8545'
const ETH_ADDR = env.ETH_ADDR || '0x4200000000000000000000000000000000000006'
const UNI_FACTORY_ADDR = env.UNI_FACTORY_ADDR || '0x1F98431c8aD98523631AE4a59f267346ea31F984' // address on mainnet
const FROM_BLOCK = env.FROM_BLOCK || '0'
const TO_BLOCK = env.TO_BLOCK || 'latest'

const blockInterval = parseInt(env.BLOCK_INTERVAL, 10) || 2000

interface FindAllEventsOptions {
  provider: providers.StaticJsonRpcProvider
  contract: Contract
  filter: ethers.EventFilter
  fromBlock?: number
  toBlock?: number
  blockInterval?: number
}

interface AllEventsOutput {
  ethTransfers: ethers.Event[]
  uniV3FeeAmountEnabled: ethers.Event[]
  uniV3PoolCreated: ethers.Event[]
  lastBlock: number
}

const findAllEvents = async (options: FindAllEventsOptions): Promise<ethers.Event[]> => {
  // Note: tested this doesn't throw an error even if the optional parameters 
  // are not defined, they will just be undefined
  const { provider, contract, filter, fromBlock, toBlock, blockInterval } = options
  const cache = {
    startingBlockNumber: fromBlock || 0,
    events: [],
  }
  let events: ethers.Event[] = []
  let startingBlockNumber = fromBlock || 0
  let endingBlockNumber = toBlock || (await provider.getBlockNumber())

  while (startingBlockNumber < endingBlockNumber) {
    events = events.concat(
      await contract.queryFilter(
        filter,
        startingBlockNumber, // inclusive of both beginning and end
        // https://docs.ethers.io/v5/api/providers/types/#providers-Filter
        Math.min(startingBlockNumber + blockInterval - 1, endingBlockNumber)
      )
    )

    if (startingBlockNumber + blockInterval > endingBlockNumber) {
      cache.startingBlockNumber = endingBlockNumber
      cache.events = cache.events.concat(events)
      break
    }

    startingBlockNumber += blockInterval
    endingBlockNumber = await provider.getBlockNumber()
  }

  return cache.events
}

// TODO: add json file parsing to determine startBlock? Determine use case
;(async () => {
  console.log('ready to index events')
  const provider = new ethers.providers.StaticJsonRpcProvider(NODE_URL)
  const signer = ethers.Wallet.createRandom().connect(provider)
  const erc20Contract = getContractFactory('OVM_L2DepositedERC20').connect(signer).attach(ETH_ADDR)
  const uniV3FactoryContract = new Contract(
    UNI_FACTORY_ADDR,
    FACTORY_ABI,
    provider
  )

  let maxBlock
  if (TO_BLOCK === 'latest') {
    const lastBlock = await provider.getBlock('latest')
    maxBlock = lastBlock.number
  } else {
    maxBlock = parseInt(TO_BLOCK, 10)
  }
  console.log('Max block:', maxBlock)

  const fromBlock = parseInt(FROM_BLOCK, 10)

  const [ethTransfers, uniV3FeeAmountEnabled, uniV3PoolCreated] = await Promise.all([
    findAllEvents({
      provider,
      contract: erc20Contract,
      filter: erc20Contract.filters.Transfer(),
      fromBlock,
      toBlock: maxBlock,
      blockInterval
    }),
    findAllEvents({
      provider,
      contract: uniV3FactoryContract,
      filter: uniV3FactoryContract.filters.FeeAmountEnabled(),
      fromBlock,
      toBlock: maxBlock,
      blockInterval
    }),
    findAllEvents({
      provider,
      contract: uniV3FactoryContract,
      filter: uniV3FactoryContract.filters.PoolCreated(),
      fromBlock,
      toBlock: maxBlock,
      blockInterval
    })
  ])

  console.log(`Found ${ethTransfers.length} ETH transfer events`)
  console.log(`Found ${uniV3FeeAmountEnabled.length} FeeAmountEnabled events`)
  console.log(`Found ${uniV3PoolCreated.length} PoolCreated events`)

  const output: AllEventsOutput = {
    lastBlock: maxBlock,
    ethTransfers,
    uniV3FeeAmountEnabled,
    uniV3PoolCreated
  }

  // This next line runs out of memory for large outputs
  // const outputJson = JSON.stringify(output, null, 2)
  // writeFileSync('./all-events.json', outputJson, 'utf-8')

  console.log('writing to file ./all-events.json')
  // This write correctly but all on one line
  const writeStream = createWriteStream('./all-events.json', 'utf-8')
  stringifyStream(output)
    .pipe(writeStream)
    .on('error', error => console.error(error))
    .on('finish', () => console.log('DONE!'))
})().catch(err => {
  console.log(err)
  process.exit(1)
})
