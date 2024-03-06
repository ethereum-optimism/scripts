// Import the ethers library
import { utils, BigNumber } from 'ethers';

/**
 * Creates a storage object from a given accounts object.
 * Each account's address and balance are used to generate a storage key-value pair.
 * @param {Object} accounts - An object where keys are account addresses and values are account balances.
 * @returns {Object} A storage object with hexadecimal storage keys and their corresponding balances.
 */
const makeStorageFromAccounts = (accounts) => {
 const storage = {};

 // Iterate over each account
 for (const [address, balance] of Object.entries(accounts)) {
    // Concatenate and pad the address with zeros
    const preimage = utils.hexConcat([
      utils.hexZeroPad(address, 32),
      utils.hexZeroPad('0x00', 32),
    ]);

    // Generate a storage key using keccak256
    const key = utils.keccak256(preimage);

    // Convert the balance to a hexadecimal string
    const val = BigNumber.from(balance).toHexString();

    // Store the balance in the storage object with the generated key
    storage[key] = val;
 }

 // Return the populated storage object
 return storage;
};

// Export the function for use in other modules
export { makeStorageFromAccounts };
