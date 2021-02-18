/**
 * Utility script for running a health check that compares the state of a verifier to the state of
 * the current sequencer. Useful for catching discrepancies on verifier/sequencer codebases.
 *
 * Required environment variables:
 * VERIFIER_ENDPOINT: RPC endpoint for the verifier node.
 * SEQUENCER_ENDPOINT: RPC endpoint for the sequencer node.
 */

const log = require('single-line-log').stdout
const dotenv = require('dotenv')
const { JsonRpcProvider } = require('@ethersproject/providers')
const { getContractFactory } = require('@eth-optimism/contracts')
const { L1DataTransportClient } = require('@eth-optimism/data-transport-layer')
const { decodeAppendSequencerBatch, ctcCoder, remove0x }  = require('@eth-optimism/core-utils')

const getBlock = async (provider, index) => {
  return provider.send('eth_getBlockByNumber', [`0x${index.toString(16)}`, true])
}

async function main() {
  dotenv.config()

  const verifier = new JsonRpcProvider(process.env.VERIFIER_ENDPOINT)
  const sequencer = new JsonRpcProvider(process.env.SEQUENCER_ENDPOINT)
  let l1Provider = null
  let ctc = null
  let dtl = null

  if (process.env.L1_ENDPOINT) {
    if (!process.env.ADDRESS_MANAGER_ADDRESS) {
      throw new Error('Must pass ADDRESS_MANAGER_ADDRESS')
    }

    l1Provider = new JsonRpcProvider(process.env.L1_ENDPOINT)
    const addressManager = getContractFactory('Lib_AddressManager')
      .attach(process.env.ADDRESS_MANAGER_ADDRESS)
      .connect(l1Provider)

    const ctcAddress = await addressManager.getAddress('OVM_CanonicalTransactionChain')
    ctc = getContractFactory('OVM_CanonicalTransactionChain')
      .attach(ctcAddress)
      .connect(l1Provider)
  }

  if (process.env.DATA_TRANSPORT_LAYER_ENDPOINT) {
    dtl = new L1DataTransportClient(process.env.DATA_TRANSPORT_LAYER_ENDPOINT)
  }

  let latest = await verifier.getBlockNumber()
  console.log(`Latest Verifier block number is: ${latest}`)

  console.log(`Comparing the latest state roots...`)
  const latestVerifierBlock = await getBlock(verifier, latest)
  const latestSequencerBlock = await getBlock(sequencer, latest)

  if (latestSequencerBlock == null) {
    throw new Error('Latest Sequencer Block is null')
  }

  if (latestVerifierBlock.stateRoot !== latestSequencerBlock.stateRoot) {
    console.log(`Latest state roots are mismatched!`)
    console.log(`Executing a binary search to determine the first mismatched block...`)

    let start = 1
    let end = latest
    while (start + 1 !== end) {
      const middle = Math.floor((start + end) / 2)
      let ncount = Math.floor((1 - (start / end)) * 10)
      if (middle + 1 !== end) {
        ncount++
      }

      log(`Checking block: ${middle + 1} ${ncount > 0 ? '🤔'.repeat(ncount) : '💀'}\n`)

      const verifierBlock = await getBlock(verifier, middle)
      const sequencerBlock = await getBlock(sequencer, middle)

      if (verifierBlock.stateRoot === sequencerBlock.stateRoot) {
        start = middle
      } else {
        end = middle
      }
    }

    log.clear()
    console.log(`First block with a mismatched state root is: ${end}`)
  }

  log.clear()
  console.log(`Checking for any mismatched transactions...\n`)

  i = 1
  while (i < latest) {
    log(`Checking transaction: ${i}\n`)

    try {
      const sequencerBlock = await getBlock(sequencer, i)
      const verifierBlock = await getBlock(verifier, i)
      const sequencerTx = sequencerBlock.transactions[0]
      const verifierTx = verifierBlock.transactions[0]
      let queueElement = null
      let ctcTx = null

      if (sequencerTx.hash !== verifierTx.hash) {
        if (dtl) {
          const info = await dtl.getTransactionByIndex(i - 1)
          if (ctc && info.transaction.queueOrigin === 'l1') {
            queueElement = await ctc.getQueueElement(info.transaction.queueIndex)
          }
          if (l1Provider) {
            console.log(`Fetching tx ${info.batch.l1TransactionHash}`)
            const tx = await l1Provider.getTransaction(info.batch.l1TransactionHash)
            const data = tx.data.slice(10)
            const sequencerBatch = decodeAppendSequencerBatch(data)

            // pull the correct tx directly out of the sequencer batch
            const index = (i - 1) - sequencerBatch.shouldStartAtBatch
            //const index = (i) - sequencerBatch.shouldStartAtBatch
            let batchtx = sequencerBatch.transactions[index]

            if (batchtx) {
              batchtx = remove0x(batchtx)
              const type = parseInt(batchtx.slice(0, 2), 16)
              if (type === ctcCoder.eip155TxData.txType) {
                ctcTx = ctcCoder.eip155TxData.decode(batchtx)
              } else if (type === ctcCoder.ethSignTxData.txType) {
                ctcTx = ctcCoder.ethSignTxData.decode(batchtx)
              } else {
                console.log(`Unknown tx type ${type}`)
              }
            }
          }
        }

        console.log(`Found a mismatched transaction at index: ${i - 1} 💀`)
        if (sequencerTx.nonce !== verifierTx.nonce) {
          console.log('  Mismatched nonce')
          console.log(`    verifier: ${parseInt(verifierTx.nonce,16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.nonce,16)}`)
          if (ctcTx) {
            console.log(`    batch: ${ctcTx.nonce}`)
          }
        }
        if (sequencerTx.from !== verifierTx.from) {
          console.log('  Mismatched from')
          console.log(`    verifier: ${verifierTx.from}`)
          console.log(`    sequencer: ${sequencerTx.from}`)
        }
        if (sequencerTx.blockNumber !== verifierTx.blockNumber) {
          console.log('  Mismatched blocknumber')
          console.log(`    verifier: ${verifierTx.blockNumber}`)
          console.log(`    sequencer: ${sequencerTx.blockNumber}`)
        }
        if (sequencerTx.gas !== verifierTx.gas) {
          console.log('  Mismatched gas')
          console.log(`    verifier: ${parseInt(verifierTx.gas, 16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.gas, 16)}`)
          if (ctcTx) {
            console.log(`    batch: ${ctcTx.gasLimit}`)
          }
        }
        if (sequencerTx.gasPrice !== verifierTx.gasPrice) {
          console.log('  Mismatched gas price')
          console.log(`    verifier: ${parseInt(verifierTx.gasPrice, 16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.gasPrice, 16)}`)
          if (ctcTx) {
            console.log(`    batch: ${ctcTx.gasPrice}`)
          }
        }
        if (sequencerTx.to !== verifierTx.to) {
          console.log('  Mismatched to')
          console.log(`    verifier: ${verifierTx.to}`)
          console.log(`    sequencer: ${sequencerTx.to}`)
          if (ctcTx) {
            console.log(`    batch: ${ctcTx.target}`)
          }
        }
        if (sequencerTx.queueOrigin !== verifierTx.queueOrigin) {
          console.log('  Mismatched queue origin')
          console.log(`    verifier: ${verifierTx.queueOrigin}`)
          console.log(`    sequencer: ${sequencerTx.queueOrigin}`)
        }
        if (sequencerTx.txType !== verifierTx.txType) {
          console.log('  Mismatched tx type')
          console.log(`    verifier: ${verifierTx.txType}`)
          console.log(`    sequencer: ${sequencerTx.txType}`)
        }
        if (sequencerTx.value !== verifierTx.value) {
          console.log('  Mismatched value')
        }
        if (sequencerTx.l1TxOrigin !== verifierTx.l1TxOrigin) {
          console.log('  Mismatched tx origin')
          console.log(`    verifier: ${verifierTx.l1TxOrigin}`)
          console.log(`    sequencer: ${sequencerTx.l1TxOrigin}`)
        }
        if (sequencerTx.l1BlockNumber !== verifierTx.l1BlockNumber) {
          console.log('  Mismatched l1 blocknumber')
          console.log(`    verifier: ${parseInt(verifierTx.l1BlockNumber, 16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.l1BlockNumber, 16)}`)
          if (queueElement) {
            console.log(`    ctc: ${queueElement[2]}`)
          }
        }
        if (sequencerTx.l1Timestamp !== verifierTx.l1Timestamp) {
          console.log('  Mismatched l1 timestamp')
          console.log(`    verifier: ${parseInt(verifierTx.l1Timestamp, 16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.l1Timestamp, 16)}`)
          if (queueElement) {
            console.log(`    ctc: ${queueElement[1]}`)
          }
        }
        if (sequencerTx.v !== verifierTx.v) {
          console.log('  Mismatched v')
          console.log(`    verifier: ${verifierTx.v}`)
          console.log(`    sequencer: ${sequencerTx.v}`)
          if (ctcTx) {
            console.log(`    batch: ${ctcTx.sig.v}`)
          }
        }
        if (sequencerTx.r !== verifierTx.r) {
          console.log('  Mismatched r')
        }
        if (sequencerTx.s !== verifierTx.s) {
          console.log('  Mismatched s')
        }
        if (sequencerTx.input !== verifierTx.input) {
          console.log('  Mismatched data')
          console.log(`    verifier: len(data) = ${verifierTx.input.length}`)
          console.log(`    sequencer: len(data) = ${sequencerTx.input.length}`)
        }
        console.log('')
      }

      i++
      queueElement = null
      ctcTx = null
    } catch (err) {
      log.clear()
      console.log(`Ran into a temporary error, trying the same index again.`)
      console.log(`Here's the error:`)
      console.log(err)
      log.clear()
    }
  }

  log.clear()
  log.clear()
}

main()
