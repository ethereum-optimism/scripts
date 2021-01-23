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

  const latest = await verifier.getBlockNumber()
  console.log(`Latest Verifier block number is: ${latest}`)

  console.log(`Comparing the latest state roots...`)
  const latestVerifierBlock = await getBlock(verifier, latest)
  const latestSequencerBlock = await getBlock(sequencer, latest)

  if (latestVerifierBlock.stateRoot !== latestSequencerBlock.stateRoot) {
    console.log(`Latest state roots are mismatched!`)
    console.log(`Executing a binary search to determine the first mismatched block...`)

    let start = 0
    let end = latest
    while (start + 1 !== end) {
      const middle = Math.floor((start + end) / 2)
      log(`Checking block: ${middle}\n`)

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

  console.log(`Checking for any mismatched transactions...`)
  let i = 0
  while (i < latest) {
    log(`Checking transaction: ${i}\n`)

    try {
      const sequencerBlock = await getBlock(sequencer, i)
      const verifierBlock = await getBlock(verifier, i)

      if (sequencerBlock.transactions[0].hash !== verifierBlock.transactions[0].hash) {
        console.log(`Found a mismatched transaction at index: ${i}`)
      }

      i++
    } catch (err) {
      log.clear()
      console.log(`Ran into a temporary error, trying the same index again.`)
      console.log(`Here's the error:`)
      console.log(err)
    }
  }

  log.clear()
}

main()
