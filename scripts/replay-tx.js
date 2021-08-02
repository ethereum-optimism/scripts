const { Command } = require("commander")
const dotenv = require('dotenv')
const ethers = require('ethers')
const { getContractInterface, predeploys } = require('@eth-optimism/contracts')

const main = async () => {
  // Load environment variables from .env
  dotenv.config()
  const l1ProviderUrl = process.env.REPLAY__L1_RPC_PROVIDER_URL
  const l2ProviderUrl = process.env.REPLAY__L2_RPC_PROVIDER_URL
  const l1MessengerProxyAddress = process.env.REPLAY__L1_MESSENGER_PROXY_ADDRESS
  const l1PrivateKey = process.env.REPLAY__L1_PRIVATE_KEY
  
  // Load the command line arguments
  const program = new Command()
  // Specify a hash if you want to replay a specific transaction
  program.option("-h, --hash <number>", "specify transaction hash")
  // Otherwise specify a from block and to block and replay all transactions within that range
  program.option("-f, --from <number>", "specify a block number to start from")
  program.option("-t, --to <number>", "specify a block number to end at")
  program.parse(process.argv);
  const opts = program.opts();
  
  if (!opts.hash && !opts.from) {
    throw new Error('must provide either a transaction hash (--hash) or a starting block number (--from)')
  }

  const l1Provider = new ethers.providers.JsonRpcProvider(l1ProviderUrl)
  const l2Provider = new ethers.providers.JsonRpcProvider(l2ProviderUrl)
  const l1Wallet = new ethers.Wallet(l1PrivateKey, l1Provider)
  const l1CrossDomainMessenger = new ethers.Contract(
    l1MessengerProxyAddress,
    getContractInterface('OVM_L1CrossDomainMessenger'),
    l1Provider
  )
  const l2CrossDomainMessenger = new ethers.Contract(
    predeploys.OVM_L2CrossDomainMessenger,
    getContractInterface('OVM_L2CrossDomainMessenger'),
    l2Provider
  )

  const replayMessages = async (transactionHash) => {
    // Get the receipt so we can get the event logs.
    const receipt = await l1Provider.getTransactionReceipt(transactionHash)
  
    // Decode the sent messages from the logs.
    const decodedMessages = receipt.logs.filter((log) => {
      return (
        log.address === l1CrossDomainMessenger.address
        && log.topics[0] === ethers.utils.id('SentMessage(bytes)')
      )
    }).map((log) => {
      const [message] = ethers.utils.defaultAbiCoder.decode(['bytes'], log.data)
      return l2CrossDomainMessenger.interface.decodeFunctionData('relayMessage', message)
    })

    // Replay the messages.
    for (const message of decodedMessages) {
      try {
        const tx = await l1CrossDomainMessenger.connect(l1Wallet).replayMessage(
          message._target,
          message._sender,
          message._message,
          message._messageNonce,
          3000000
        )
        await tx.wait()
        console.log("success! tx hash:", tx.hash)
      } catch (err) {
        console.log(err)
      }
    }
  }

  if (opts.hash) {
    console.log(`Attempting to replay messages for tx: ${opts.hash}`)
    await replayMessages(opts.hash)
  } else {
    // First find all L1 => L2 messages sent within the block range
    const events = await l1CrossDomainMessenger.queryFilter(
      l1CrossDomainMessenger.filters.SentMessage(),
      Number(opts.from),
      opts.to ? Number(opts.to) : undefined
    )

    // Find all L2 status events. In the future this may have to be refactored if there are too
    // many events and we're required to paginate. Alternatively, we could index the event args
    // and avoid this issue entirely but that requires a regenesis.
    const l2SuccessEvents = await l2CrossDomainMessenger.queryFilter(
      l2CrossDomainMessenger.filters.RelayedMessage(),
    )
    const l2FailureEvents = await l2CrossDomainMessenger.queryFilter(
      l2CrossDomainMessenger.filters.FailedRelayedMessage(),
    )
    const l2Events = l2SuccessEvents.concat(l2FailureEvents)

    // For each L1 => L2 message, find the corresponding L2 status event. If none exists, then we
    // should replay those messages.
    for (const event of events) {
      const matchingEvents = l2Events.filter((l2Event) => {
        return l2Event.args.msgHash === ethers.utils.keccak256(event.args.message)
      })

      if (matchingEvents.length === 0) {
        console.log(`Found unsuccessful message for event in tx: ${event.transactionHash}`)
        console.log(`Attempting to replay message...`)
        // await replayMessages(event.transactionHash)
      } else {
        console.log(`Found successful message for event in tx: ${event.transactionHash}`)
      }
    }
  }
}

main()
