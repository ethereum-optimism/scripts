#!/usr/bin/env -S node --require ts-node/register

import {ethers} from 'ethers';
import {L1DataTransportClient} from '@eth-optimism/data-transport-layer'
import assert from 'assert'

const env = process.env
const DATA_TRANSPORT_URL = env.DATA_TRANSPORT_URL || 'http://18.191.34.195:7878'
const REPLICA_DATA_TRANSPORT_URL = env.REPLICA_DATA_TRANSPORT_URL || 'http://localhost:7878'

const dtl = new L1DataTransportClient(DATA_TRANSPORT_URL)
const replica = new L1DataTransportClient(REPLICA_DATA_TRANSPORT_URL)

;(async () => {
  const latest = await dtl.getLatestTransacton()
  const rlatest = await replica.getLatestTransacton()

  const min = Math.min(latest.transaction.index, rlatest.transaction.index)

  for (let i = 0; i < 100; i++) {
    const tx = await dtl.getTransactionByIndex(i)
    const rtx = await replica.getTransactionByIndex(i)

    function equal(...keys) {
      let rhs = tx
      let lhs = rtx
      for (let key of keys) {
        rhs = rhs[key]
        lhs = lhs[key]
      }
      return deepEqual(lhs, rhs)
    }

    if (!equal()) {
      console.log(`mismatch at ${i}`)
      if (!equal('transaction', 'index')) {
        console.log(`  Index mismatch`)
        console.log(`    sequencer: ${tx.transaction.index}`)
        console.log(`    replica: ${rtx.transaction.index}`)
      }
      if (!equal('transaction', 'blockNumber')) {
        console.log('  blocknumber mismatch')
        console.log(`    sequencer: ${tx.transaction.blockNumber}`)
        console.log(`    replica: ${rtx.transaction.blockNumber}`)
      }
      if (!equal('transaction', 'timestamp')) {
        console.log('timestamp mismatch')
        console.log(`    sequencer: ${tx.transaction.timestamp}`)
        console.log(`    replica: ${rtx.transaction.timestamp}`)
      }
      if (!equal('transaction', 'queueOrigin')) {
        console.log('queue origin mismatch')
      }
      if (!equal('transaction', 'type')) {
        console.log('tx type mismatch')
      }
      if (!equal('transaction', 'queueIndex')) {
        console.log('queue index mismatch')
      }
      if (!equal('transaction', 'confirmed')) {
        console.log('confirmation mismatch')
      }
      if (!equal('transaction', 'gasLimit')) {
        console.log('gas limit mismatch')
      }
      if (!equal('transaction', 'target')) {
        console.log('target mismatch')
      }
      if (!equal('transaction', 'origin')) {
        console.log('origin mismatch')
      }
      if (!equal('transaction', 'data')) {
        console.log('data mismatch')
      }
      if (!equal('transaction', 'decoded')) {
        console.log('decoded mismatch')
      }
      //console.log(JSON.stringify(tx,null,2))
      //console.log(JSON.stringify(rtx,null,2))
    }
  }
})().catch(err => {
  console.log(err)
  process.exit(1)
})


function deepEqual(object1, object2) {
  const type1 = typeof object1
  const type2 = typeof object2

  if (type1 !== type2) {
    return false
  }

  if (object1 === null && object2 === null) {
    return true
  }

  if (type1 === 'string' && type2 === 'string') {
    return object1 === object2
  }

  if (type1 === 'number' && type2 === 'number') {
    return object1 === object2
  }

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      areObjects && !deepEqual(val1, val2) ||
      !areObjects && val1 !== val2
    ) {
      return false;
    }
  }
  return true;
}

function isObject(object) {
  return object != null && typeof object === 'object';
}
