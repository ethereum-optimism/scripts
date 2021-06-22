const ethers = require('ethers')

const makeStorageFromAccounts = (accounts) => {
  const storage = {}
  for (const [address, balance] of Object.entries(accounts)) {
    const preimage = ethers.utils.hexConcat([
      ethers.utils.hexZeroPad(address, 32),
      ethers.utils.hexZeroPad('0x00', 32),
    ])
    const key = ethers.utils.keccak256(preimage)
    const val = ethers.BigNumber.from(balance).toHexString()
    storage[key] = val
  }
  return storage
}

module.exports = {
  makeStorageFromAccounts
}
