const ethers = require('ethers')
const {providers, Wallet, utils} = ethers

const cfg = config()

;(async () => {
  const provider = new providers.JsonRpcProvider(cfg.ethUrl)

  let wallet
  if (cfg.privateKey)
    wallet = new Wallet(cfg.privateKey, provider)
  else
    wallet = Wallet.fromMnemonic(cfg.mnemonic).connect(provider)

  const address = await wallet.getAddress()
  console.log(`Address: ${address}`)
  const balance = await wallet.getBalance()
  console.log(`Balance: ${utils.formatEther(balance.toString())}`)

  console.log(`Sending: ${cfg.ether} ETH to ${cfg.to}`)
  const response = await wallet.sendTransaction({
    to: cfg.to,
    value: utils.parseEther(cfg.ether),
  })

  console.log(`Transaction hash: ${response.hash}`)
  const receipt = await response.wait()
  console.log(`Transaction mined. Include in block ${receipt.blockNumber}`)
})().catch(err => {
  console.log(err)
  process.exit(1)
})

function config() {
  const env = process.env
  if (!env.PRIVATE_KEY && !env.MNEMONIC)
    throw new Error('Must pass one of PRIVATE_KEY or MNEMONIC')
  if (!env.ETH_URL)
    throw new Error('Must pass ETH_URL')
  if (!env.TO)
    throw new Error('Must pass TO')
  if (!env.ETHER)
    throw new Error('Must pass ETHER')

  return {
    privateKey: env.PRIVATE_KEY,
    mnemonic: env.MNEMONIC,
    hdPath: env.HD_PATH || ethers.utils.defaultPath,
    ethUrl: env.ETH_URL,
    to: env.TO,
    ether: env.ETHER,
  }
}
