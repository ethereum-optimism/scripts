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

const getBlock = async (provider, index) => {
  return provider.send('eth_getBlockByNumber', [`0x${index.toString(16)}`, true])
}

async function main() {
  dotenv.config()

  const verifier = new JsonRpcProvider(process.env.VERIFIER_ENDPOINT)
  const sequencer = new JsonRpcProvider(process.env.SEQUENCER_ENDPOINT)

  let latest = await verifier.getBlockNumber()
  console.log(`Latest Verifier block number is: ${latest}`)

  console.log(`Comparing the latest state roots...`)
  const latestVerifierBlock = await getBlock(verifier, latest)
  const latestSequencerBlock = await getBlock(sequencer, latest)

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

  let i = 1
  while (i < latest) {
    log(`Checking transaction: ${i}\n`)

    try {
      const sequencerBlock = await getBlock(sequencer, i)
      const verifierBlock = await getBlock(verifier, i)
      const sequencerTx = sequencerBlock.transactions[0]
      const verifierTx = verifierBlock.transactions[0]

      if (sequencerTx.hash !== verifierTx.hash) {
        console.log(`Found a mismatched transaction at index: ${i} 💀`)
        if (sequencerTx.nonce !== verifierTx.nonce) {
          console.log('  Mismatched nonce')
          console.log(`    verifier: ${parseInt(verifierTx.nonce,16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.nonce,16)}`)
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
          console.log(`    verifier: ${verifierTx.gas}`)
          console.log(`    sequencer: ${sequencerTx.gas}`)
        }
        if (sequencerTx.gasPrice !== verifierTx.gasPrice) {
          console.log('  Mismatched gas price')
          console.log(`    verifier: ${verifierTx.gasPrice}`)
          console.log(`    sequencer: ${sequencerTx.gasPrice}`)
        }
        if (sequencerTx.to !== verifierTx.to) {
          console.log('  Mismatched to')
          console.log(`    verifier: ${verifierTx.to}`)
          console.log(`    sequencer: ${sequencerTx.to}`)
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
        }
        if (sequencerTx.l1Timestamp !== verifierTx.l1Timestamp) {
          console.log('  Mismatched l1 timestamp')
          console.log(`    verifier: ${parseInt(verifierTx.l1Timestamp, 16)}`)
          console.log(`    sequencer: ${parseInt(sequencerTx.l1Timestamp, 16)}`)
        }
        if (sequencerTx.v !== verifierTx.v) {
          console.log('  Mismatched v')
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
