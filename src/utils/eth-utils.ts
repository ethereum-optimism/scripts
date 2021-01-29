import { ethers } from 'ethers'

export const getBlock = async (provider: ethers.providers.JsonRpcProvider, index: number) => {
  return provider.send('eth_getBlockByNumber', [`0x${index.toString(16)}`, true])
}
