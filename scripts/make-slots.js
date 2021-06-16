const ethers = require('ethers')

const makeStorageFromAccounts = (accounts) => {
  const storage = {}
  for (const [address, balance] of Object.entries(accounts)) {
    // Key for a mapping at index 5
    const preimage = ethers.utils.hexConcat([
      ethers.utils.hexZeroPad(address, 32),
      ethers.utils.hexZeroPad('0x05', 32),
    ])
    const key = ethers.utils.keccak256(preimage)

    // Uint256 is right-padded.
    const val = ethers.BigNumber.from(balance).toHexString()
    storage[key] = val
  }
  return storage
}

module.exports = {
  makeStorageFromAccounts
}
