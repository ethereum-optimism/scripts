const {getContractFactory, getContractInterface} = require('@eth-optimism/contracts')
const {JsonRpcProvider} = require('@ethersproject/providers')
const {Contract} = require('@ethersproject/contracts')

const env = process.env
const L1_URL = env.L1_URL || 'http://localhost:8545'
const ADDRESS_MANAGER_ADDRESS = env.ADDRESS_MANAGER_ADDRESS || '0x1De8CFD4C1A486200286073aE91DE6e8099519f1'

;(async () => {
  const provider = new JsonRpcProvider(L1_URL)
  const manager = new Contract(ADDRESS_MANAGER_ADDRESS, getContractInterface('Lib_AddressManager'), provider)

  const addr = await manager.getAddress('OVM_ChainStorageContainer:CTC:batches')
  const container = new Contract(addr, getContractInterface('OVM_ChainStorageContainer'), provider)

  let meta = await container.getGlobalMetadata()
  console.log(`Global Metadata - ${addr}`)
  console.log(meta)
  // remove 0x
  meta = meta.slice(2)
  // convert to bytes27
  meta = meta.slice(10)

  const totalElements = meta.slice(-10)
  console.log(`total elements: ${parseInt(totalElements, 16)}`)

  const nextQueueIndex = meta.slice(-20, -10)
  console.log(`next queue index: ${parseInt(nextQueueIndex, 16)}`)

  const lastTimestamp = meta.slice(-30, -20)
  console.log(`last timestamp: ${parseInt(lastTimestamp, 16)}`)

  const lastBlockNumber = meta.slice(-40, -30)
  console.log(`last block number: ${parseInt(lastBlockNumber, 16)}`)
})().catch(err => {
  console.log(err)
})
