import fetch from 'node-fetch'
import { ethers, Contract, ContractFactory, BigNumber } from 'ethers'
import { getContractFactory } from '@eth-optimism/contracts'
import * as dotenv from 'dotenv'

const loadSynthetixContract = (
  snxJson: any,
  name: string,
  provider: ethers.providers.JsonRpcProvider
): Contract => {
  return new Contract(
    snxJson.targets[name].address,
    snxJson.sources[name].abi,
    provider
  )
}

const main = async () => {
  dotenv.config()

  const l2provider = new ethers.providers.JsonRpcProvider(
    process.env.L2_PROVIDER_ENDPOINT
  )

  const l1provider = new ethers.providers.JsonRpcProvider(
    process.env.L1_PROVIDER_ENDPOINT
  )

  const OVM_L2CrossDomainMessenger = (getContractFactory(
    'OVM_L2CrossDomainMessenger'
  ) as ContractFactory).attach(
    process.env.L2_MESSENGER_ADDRESS
  ).connect(l2provider)

  const OVM_L1CrossDomainMessenger = (getContractFactory(
    'OVM_L1CrossDomainMessenger'
  ) as ContractFactory).attach(
    process.env.L1_MESSENGER_ADDRESS
  ).connect(l1provider)
  
  const snxL1Json = await (await fetch(
    process.env.SNX_L1_DEPLOY_JSON
  )).json()

  const SynthetixBridgeToOptimism = loadSynthetixContract(
    snxL1Json,
    'SynthetixBridgeToOptimism',
    l1provider
  )

  const events = await OVM_L2CrossDomainMessenger.queryFilter(
    OVM_L2CrossDomainMessenger.filters.SentMessage()
  )

  const parsed = []
  for (const event of events) {
    const decoded = OVM_L2CrossDomainMessenger.interface.decodeFunctionData(
      'relayMessage',
      event.args.message
    )

    parsed.push({
      target: decoded._target,
      sender: decoded._sender,
      message: decoded._message,
      messageNonce: decoded._messageNonce,
      encodedMessage: event.args.message,
      encodedMessageHash: ethers.utils.keccak256(event.args.message),
      parentTransactionIndex: event.blockNumber - 1,
      parentTransactionHash: event.transactionHash,
    })
  }

  let lastRelayedAccount = undefined
  let lastRelayedEvent = undefined
  for (const event of parsed) {
    try {
      const {
        account,
        amount,
      } = SynthetixBridgeToOptimism.interface.decodeFunctionData(
        'completeWithdrawal',
        event.message
      )

      const relayed = await OVM_L1CrossDomainMessenger.successfulMessages(
        event.encodedMessageHash
      )

      if (relayed === false) {
        console.log(`Not relayed`)
        console.log(`Account: ${account}`)
        console.log(`Amount (SNX): ${BigNumber.from(amount).div(BigNumber.from('1000000000000000000')).toNumber()}`)
        console.log(`Message nonce: ${event.messageNonce}`)
        console.log(`Transaction index: ${event.parentTransactionIndex}`)
        console.log(`Transaction hash: ${event.parentTransactionHash}`)
      } else {
        lastRelayedAccount = account
        lastRelayedEvent = event
      }
    } catch (err) {
      console.log('Caught an error, skipping')
      continue
    }
  }

  if (lastRelayedEvent) {
    console.log(`Last relayed event:`)
    console.log(`Account: ${lastRelayedAccount}`)
    console.log(`Message nonce: ${lastRelayedEvent.messageNonce}`)
    console.log(`Transaction index: ${lastRelayedEvent.parentTransactionIndex}`)
    console.log(`Transaction hash: ${lastRelayedEvent.parentTransactionHash}`)
  }
}

main()

