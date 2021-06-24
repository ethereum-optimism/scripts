# Simple load test steps

## Build and push a docker container

This container will be used to run the tests.
Tag the image with a namespace you can push to.

For example:
```
docker build \
  --file Dockerfile-simple-load-test \
  --tag optimisticben/simple-load-test \
  .
docker push optimisticben/simple-load-test
```

## Edit kustomization.yaml

Update the `images` section to point to the docker image name and tag you pushed.

Update the target namespace for the tests (`kovan-load-test` by default).

## Review env

Take a look at `kustomize/simple-load-test/load-test-configmap.env` for test configuration options, make any required changes.

## Create the testing namespace

```
kubectl create ns kovan-load-test
```

## Create a secret

The tests require 2 secret values

- a funded wallet private key on the tested network
- a layer 1 ethereum rpc endpoint address (sometimes contains secret keys)

```
LOAD_TEST__L1_PRIVATE_KEY=<your private key>
LOAD_TEST__L1_RPC_URL=<your L1 RPC URL>
kubectl create secret generic load-test \
  -n kovan-load-test \
  --from-literal=LOAD_TEST__L1_PRIVATE_KEY=${LOAD_TEST__L1_PRIVATE_KEY} \
  --from-literal=LOAD_TEST__L1_RPC_URL=${LOAD_TEST__L1_RPC_URL} \
```

## Deploy the test!

The deployment uses kustomize to build and create the resources.

Deploy it with something like
```
kustomize build kustomize/simple-load-test/ | kubectl apply -f -
```

## Update the replica count

By default the test uses 2 replicas, it can be scaled after deployment like
```
kubectl scale \
  -n kovan-load-test \
  --replicas=<DESIRED COUNT> \
  deployment/load-test
```

You can scale the deployment to `0` to stop all the running pods.

## Cleanup

There is no state saved in the testing containers or deployment.

Delete the namespace to clean up the resources.

```
kubectl delete ns kovan-load-test
```