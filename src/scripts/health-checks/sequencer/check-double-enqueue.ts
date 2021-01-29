import { ethers } from 'ethers'
import { getBlock } from '../../../utils'

const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    'https://mainnet.optimism.io'
  )

  let seen = {}
  for (let i = 1; i < 22000; i++) {
    console.log(`Checking transaction: ${i}`)

    const block = await getBlock(provider, i)
    const transaction = block.transactions[0]

    if (transaction.queueOrigin !== 'sequencer') {
      if (seen[transaction.nonce] === true) {
        console.log('WE SAW THIS QUEUE ELEMENT TWICE')
        return
      }

      seen[transaction.nonce] = true
    }
  }
}

main()
