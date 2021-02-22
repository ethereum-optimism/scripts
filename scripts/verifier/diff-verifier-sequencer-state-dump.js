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
  console.log('getting Verifier dump')
  // get current block number for verifier and sequeuncer
  // make sure block number is same, otherwise use lower block number
  // const vdump = await verifier.send('debug_dumpBlock',[blocknumber])
  // const sdump = await sequencer.send('debug_dumpBlock',[blocknumber])
  // store the dump in a JSON file
  // diff the dumps - make sure to log any storage slots that are in one and not the other or have values that are different between the two.
  // Diff any mismatched code
  // Log the diff in an easy to view format
}

main()
