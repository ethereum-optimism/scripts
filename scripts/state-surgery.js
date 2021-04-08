/**
 * State Surgery Script
 *
 * Required env vars:
 *  SEQUENCER_ENDPOINT
 *  STATE_DUMP_PATH
 */

const fs = require('fs');
const axios = require('axios');
const { JsonRpcProvider } = require('@ethersproject/providers');
const { getContractDefinition } = require('@eth-optimism/contracts')

const cfg = config()

const contracts = {
  ProxyEOA: getContractDefinition('OVM_ProxyEOA'),
  Lib_AddressManager: getContractDefinition('Lib_AddressManager'),
  OVM_DeployerWhitelist: getContractDefinition('OVM_DeployerWhitelist'),
  OVM_L1MessageSender: getContractDefinition('OVM_L1MessageSender'),
  OVM_L2ToL1MessagePasser: getContractDefinition('OVM_L2ToL1MessagePasser'),
  OVM_ProxyEOA: getContractDefinition('OVM_ProxyEOA'),
  OVM_ECDSAContractAccount: getContractDefinition('OVM_ECDSAContractAccount'),
  mockOVM_ECDSAContractAccount: getContractDefinition('mockOVM_ECDSAContractAccount'),
  OVM_ProxySequencerEntrypoint: getContractDefinition('OVM_ProxySequencerEntrypoint'),
  ERC1820Registry: getContractDefinition('ERC1820Registry'),
  OVM_SequencerEntrypoint: getContractDefinition('OVM_SequencerEntrypoint'),
  OVM_L2CrossDomainMessenger: getContractDefinition('OVM_L2CrossDomainMessenger'),
  OVM_SafetyChecker: getContractDefinition('OVM_SafetyChecker'),
  OVM_ExecutionManager: getContractDefinition('OVM_ExecutionManager'),
  OVM_StateManager: getContractDefinition('OVM_StateManager'),
  OVM_ETH: getContractDefinition('OVM_ETH'),
}

const sequencer = new JsonRpcProvider(cfg.sequencerEndpoint);

;(async () => {
  let currentState;

  while (!currentState) {
    try {
      currentState = await sequencer.send('debug_dumpBlock', ['latest']);
    } catch (e) {
      // Do nothing
    }
  }

  // Need to merge current state into contractsDump
  const res = await axios.get(cfg.stateDumpPath)
  const contractsDump = res.data

  for (const [address, account] of Object.entries(currentState.accounts)) {
    // EOA Accounts receive the latest OVM_ProxyEOA code. They keep the same
    // storage and nonce.
    if (isEOA(account)) {
      const eoaName = 'EOA_' + address
      contractsDump.accounts[eoaName] = {
        address: address,
        nonce: account.nonce,
        code: contracts.ProxyEOA.deployedBytecode,
        storage: account.storage,
        abi: contracts.ProxyEOA.abi
      }
    } else if (isPredeploy(address) || isSystemAccount(address)) {
      // Predeploys and System Accounts keep the same nonce and code
      // Iterate through the contractsDump to find the matching addresses so
      // that the storage can be pulled in
      for (const [name, dumpAccount] of Object.entries(contractsDump.accounts)) {
        if (dumpAccount.address === address) {
          let newAccount = contracts[name]
          if (!newAccount)
            throw new Error(`Cannot find code for ${name}`)

          const updated = {
            address: address,
            nonce: 0,
            code: newAccount.deployedBytecode,
            storage: dumpAccount.storage,
            abi: newAccount.abi,
          }

          contractsDump.accounts[name] = updated
        }
      }
    } else if (isPrecompile(address)) {
      // do nothing
    } else {
      // handle the Synthetix contracts
      contractsDump.accounts[address] = {
        address: address,
        nonce: account.nonce,
        code: account.code,
        storage: account.storage,
        abi: []
      }
    }
  }

  console.log(JSON.stringify(contractsDump))
})().catch(err => {
  console.log(err)
  process.exit(1)
})


function isEmptyAccount(account) {
  return account.codeHash == 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
}

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

// 1-9 are defined as precompiles
function isPrecompile(address) {
  const int = parseInt(address, 16)
  return int <= 9 && int !== 0
}

const add0x = (str) => {
  if (str === undefined) {
    return str
  }
  return str.startsWith('0x') ? str : '0x' + str
}

function config() {
  if (!process.env.SEQUENCER_ENDPOINT)
    throw new Error('Must pass SEQUENCER_ENDPOINT')
  if (!process.env.STATE_DUMP_PATH)
    throw new Error('Must pass STATE_DUMP_PATH')

  return {
    sequencerEndpoint: process.env.SEQUENCER_ENDPOINT,
    stateDumpPath: process.env.STATE_DUMP_PATH,
  }
}

