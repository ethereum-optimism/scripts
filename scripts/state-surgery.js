/**
 * State Surgery Script
 *
 * Required env vars:
 *  SEQUENCER_ENDPOINT or CURRENT_STATE_PATH
 *  ETH_NETWORK
 * Optional env var:
 *  STATE_DUMP_PATH
 */

const fs = require('fs');
const axios = require('axios');
const { JsonRpcProvider } = require('@ethersproject/providers');
const { getLatestStateDump } = require('@eth-optimism/contracts')

const cfg = config()

const sequencer = new JsonRpcProvider(cfg.sequencerEndpoint);
const snx = `https://raw.githubusercontent.com/Synthetixio/synthetix/develop/publish/deployed/${cfg.ethNetwork}-ovm/deployment.json`

const synthetix = {}
const unknowns = []

// This script will need to be updated for the next state dump
// - isEOA will need to use EIP-1967

;(async () => {
  let currentState;

  // Fetch the state dump via HTTP if the current state path is passed,
  // otherwise fetch it from the sequencer
  if (cfg.currentStatePath) {
    const res = await axios.get(cfg.currentStatePath)
    currentState = res.data
    if (currentState.result)
      currentState = currentState.result
  } else {
    let attempt = 1
    while (!currentState) {
      try {
        currentState = await sequencer.send('debug_dumpBlock', ['latest']);
      } catch (e) {
        console.error(`timeout ${attempt}`)
        attempt++
      }
    }
  }

  // Need to merge current state into contractsDump
  let contractsDump
  if (cfg.stateDumpPath) {
    const res = await axios.get(cfg.stateDumpPath)
    contractsDump = res.data
  } else {
    contractsDump = getLatestStateDump()
  }

  // Replace all of the existing smart contract wallets with the latest code
  const proxyEOA = contractsDump.accounts.OVM_ProxyEOA

  try {
    const res = await axios.get(snx)
    for (const [name, target] of Object.entries(res.data.targets)) {
      synthetix[target.address.toLowerCase()] = name
    }
  } catch (e) {
    console.error('unable to fetch synthetix contracts')
  }

  for (const [address, account] of Object.entries(currentState.accounts)) {
    if (isEOA(account)) {
      // EOA Accounts receive the latest OVM_ProxyEOA code. They keep the same
      // storage and nonce. Leave out the ABI to not bloat the file
      const key = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
      const val = '0x4200000000000000000000000000000000000003'
      const storage = {}
      storage[key] = val

      const eoaName = 'EOA_' + address
      contractsDump.accounts[eoaName] = {
        address: address,
        nonce: account.nonce,
        code: proxyEOA.code,
        storage: storage,
        abi: []
      }
    } else if (isPredeploy(address) || isSystemAccount(address) || isPrecompile(address)) {
      // Keep the storage for OVM_ETH to preserve the L2 balances
      if (address === '0x4200000000000000000000000000000000000006') {
        const OVM_ETH = contractsDump.accounts.OVM_ETH
        const storage = Object.assign(add0xToObject(OVM_ETH.storage), add0xToObject(account.storage))

        contractsDump.accounts.OVM_ETH = {
          address: OVM_ETH.address,
          nonce: OVM_ETH.nonce,
          code: OVM_ETH.code,
          storage: storage,
          abi: OVM_ETH.abi,
        }
      }

      // Do nothing
    } else if (isSynthetix(address)) {
      // Handle the synthetix contracts
      const name = synthetix[address]
      if (!name)
        throw new Error(`Unknown synthetix account: ${address}`)
      if (name in contractsDump.accounts)
        throw new Error(`Duplicate synthetix account: ${address}`)

      contractsDump.accounts[name] = {
        address: address,
        nonce: account.nonce,
        code: account.code,
        storage: add0xToObject(account.storage),
        abi: []
      }
    } else {
      // Handle the other contracts
      console.error(`Unknown address ${address}`)
      let storage = {}
      if (typeof account.storage === 'object') {
        storage = add0xToObject(account.storage)
      }

      unknowns.push(address)
      contractsDump.accounts[address] = {
        address: address,
        nonce: account.nonce,
        code: add0x(account.code),
        storage: storage,
        abi: []
      }
    }
  }
  contractsDump.unknowns = unknowns

  console.log(JSON.stringify(contractsDump))
})().catch(err => {
  console.error(err)
  console.log(JSON.stringify(err))
  process.exit(1)
})

// corresponds to the storage slots
// 0xdead....dead => 0x4200....03
function isEOA(account) {
  return account.root === '75d420245863567e51996db1c1a5e781bcf2a94d7f8d8c0eb549ee6c82b3a8cc'
}

function isPredeploy(address) {
  return address.startsWith('0x420000000000000000000000000000000000')
}

function isSystemAccount(address) {
  return address.startsWith('0xdeaddeaddeaddeaddeaddeaddeaddeaddead')
}

function isSynthetix(address) {
  return address.toLowerCase() in synthetix
}

// 1-9 are defined as precompiles
function isPrecompile(address) {
  const int = parseInt(address, 16)
  return int <= 9 && int !== 0
}

function getFindAndReplacedCode(str) {
  return str.split(
    '336000905af158601d01573d60011458600c01573d6000803e3d621234565260ea61109c52'
  ).join(
    '336000905af158600e01573d6000803e3d6000fd5b3d6001141558600a015760016000f35b'
  )
}

function add0x(str) {
  if (typeof str === 'undefined')
    return '0x'
  if (str.startsWith('0x'))
    return str
  return `0x${str}`
}

function add0xToObject(obj) {
  if (obj == null)
    return {}
  const ret = {}
  for ([key, val] of Object.entries(obj)) {
    ret[add0x(key)] = add0x(val)
  }
  return ret
}

function config() {
  if (!process.env.SEQUENCER_ENDPOINT && !process.env.CURRENT_STATE_PATH)
    throw new Error('Must pass SEQUENCER_ENDPOINT or CURRENT_STATE_PATH')
  if (!process.env.ETH_NETWORK)
    throw new Error('Must pass ETH_NETWORK')

  return {
    sequencerEndpoint: process.env.SEQUENCER_ENDPOINT,
    currentStatePath: process.env.CURRENT_STATE_PATH,
    stateDumpPath: process.env.STATE_DUMP_PATH,
    ethNetwork: process.env.ETH_NETWORK,
  }
}
