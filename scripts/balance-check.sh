#!/bin/bash

if [[ -z $1 ]]; then
    echo "Must pass URL as first arg"
    exit 1
fi

if [[ ! -f $2 ]]; then
    echo "Must pass path to all-balances.json as second arg"
    exit 1
fi

export ETH_RPC_URL=$1
all_balances=$2

supply=$(seth call 0x4200000000000000000000000000000000000006 'totalSupply()(uint256)')
echo "total supply: $(seth --from-wei $supply ETH)"

cat $all_balances | jq -r 'keys | .[]' | while read addr; do
    ovm_eth=$(seth call 0x4200000000000000000000000000000000000006 \
        'balanceOf(address)(uint256)' $addr)
    balance=$(seth balance $addr)
    if [[ $ovm_eth != $balance ]]; then
        echo "OVM_ETH and balance mismatch for $addr"
    fi
    expect=$(cat $all_balances \
        | jq -r --arg key $addr '.[$key]' \
        | xargs printf '%d')
    if [[ $balance != $expect ]]; then
        echo "$addr balance mismatch"
    else
        echo "Balance correct: $addr has $(seth --from-wei $balance eth) ETH"
    fi
done
