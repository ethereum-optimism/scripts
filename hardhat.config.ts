import { HardhatUserConfig } from 'hardhat/types'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@eth-optimism/hardhat-ovm'

const config: HardhatUserConfig = {
  networks: {
    optimism: {
      url: 'https://kovan.optimism.io',
      ovm: true
    }
  },
  solidity: {
    version: '0.7.6'
  },
  ovm: {
    solcVersion: '0.7.6-experimental_callvalue'
  }
}

export default config
