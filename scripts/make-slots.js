const ethers = require('ethers')

const makeStorageFromAccounts = (accounts) => {
  const storage = {}
  for (const account of accounts) {
    // Key for a mapping at index 5
    const key = ethers.utils.keccak256(
      ethers.utils.hexConcat(
        [
          ethers.utils.hexZeroPad(account.address, 32),
          ethers.utils.hexZeroPad('0x05', 32),
        ]
      )
    )

    // Uint256 is right-padded.
    const val = ethers.BigNumber.from(
      account.balance
    ).toHexString().padEnd(66, '0') // '0x' + 32 hex bytes = 66 characters

    storage[key] = val
  }
  return storage
}

module.exports = {
  makeSlotsFromAccounts
}
